//! Read-only Google Classroom connector. Authentication, credential storage,
//! and network access stay native; the UI receives only course data.

pub mod api;
pub mod config;
pub mod error;
pub mod oauth;
pub mod secrets;

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::{oneshot, watch, Mutex};

use api::{Account, Course, CourseWork, Session, Submission};
use config::{ClientConfig, Endpoints};
use error::ConnectorError;
use secrets::{SecretStore, ACCOUNT_KEY, CLIENT_KEY, REFRESH_KEY};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<Account>,
    pub auth_expired: bool,
    pub signing_in: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CourseSnapshot {
    pub course_id: String,
    pub course_work: Vec<CourseWork>,
    pub submissions: Vec<Submission>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CourseResult {
    Ok {
        snapshot: CourseSnapshot,
    },
    Error {
        course_id: String,
        error: ConnectorError,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub account_id: String,
    pub results: Vec<CourseResult>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectResult {
    pub revoked: bool,
}

pub type Opener = Arc<dyn Fn(&str) -> Result<(), String> + Send + Sync>;

pub struct Connector {
    store: Arc<dyn SecretStore>,
    endpoints: Endpoints,
    http: reqwest::Client,
    opener: Opener,
    sign_in_timeout: Duration,
    retry_base: Duration,
    session: Mutex<Option<Arc<Session>>>,
    sign_in_cancel: std::sync::Mutex<Option<oneshot::Sender<()>>>,
    signing_in: Mutex<()>,
    auth_expired: std::sync::atomic::AtomicBool,
    fetching: Mutex<()>,
    /// Bumped on disconnect so in-flight work is cancelled.
    generation: watch::Sender<u64>,
}

impl Connector {
    pub fn new(store: Arc<dyn SecretStore>, opener: Opener) -> Self {
        Self::with_endpoints(store, opener, Endpoints::default())
    }

    pub fn with_endpoints(
        store: Arc<dyn SecretStore>,
        opener: Opener,
        endpoints: Endpoints,
    ) -> Self {
        Self {
            store,
            endpoints,
            http: oauth::http_client(),
            opener,
            sign_in_timeout: oauth::SIGN_IN_TIMEOUT,
            retry_base: Duration::from_millis(500),
            session: Mutex::new(None),
            sign_in_cancel: std::sync::Mutex::new(None),
            signing_in: Mutex::new(()),
            auth_expired: false.into(),
            fetching: Mutex::new(()),
            generation: watch::channel(0).0,
        }
    }

    pub fn with_timing(mut self, sign_in_timeout: Duration, retry_base: Duration) -> Self {
        self.sign_in_timeout = sign_in_timeout;
        self.retry_base = retry_base;
        self
    }

    fn client_config(&self) -> Result<Option<ClientConfig>, ConnectorError> {
        self.store
            .get(CLIENT_KEY)?
            .map(|raw| {
                serde_json::from_str(&raw).map_err(|_| {
                    ConnectorError::InvalidConfig(
                        "Stored OAuth client is unreadable. Import it again.".into(),
                    )
                })
            })
            .transpose()
    }

    fn stored_account(&self) -> Result<Option<Account>, ConnectorError> {
        Ok(self
            .store
            .get(ACCOUNT_KEY)?
            .and_then(|raw| serde_json::from_str(&raw).ok()))
    }

    pub async fn status(&self) -> Result<Status, ConnectorError> {
        let config = self.client_config()?;
        let connected = self.store.get(REFRESH_KEY)?.is_some();
        Ok(Status {
            configured: config.is_some(),
            client_id: config.map(|config| config.client_id),
            account: if connected {
                self.stored_account()?
            } else {
                None
            },
            auth_expired: connected && self.auth_expired.load(std::sync::atomic::Ordering::SeqCst),
            signing_in: self.sign_in_cancel.lock().unwrap().is_some(),
        })
    }

    pub async fn configure(&self, raw_json: &str) -> Result<Status, ConnectorError> {
        let config = config::parse_client_json(raw_json)?;
        let previous = self.client_config()?;
        let serialized = serde_json::to_string(&config).expect("config serializes");
        self.store.set(CLIENT_KEY, &serialized)?;
        // A different client cannot use the old refresh token.
        if previous.is_some_and(|previous| previous.client_id != config.client_id) {
            self.disconnect().await?;
        }
        self.status().await
    }

    pub fn cancel_connect(&self) {
        if let Some(cancel) = self.sign_in_cancel.lock().unwrap().take() {
            let _ = cancel.send(());
        }
    }

    pub async fn connect(&self) -> Result<Status, ConnectorError> {
        let _sign_in_guard = self
            .signing_in
            .try_lock()
            .map_err(|_| ConnectorError::Busy)?;
        let config = self.client_config()?.ok_or(ConnectorError::NotConfigured)?;
        let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
        {
            let mut slot = self.sign_in_cancel.lock().unwrap();
            if slot.is_some() {
                return Err(ConnectorError::Busy);
            }
            *slot = Some(cancel_tx);
        }
        let mut generation = self.generation.subscribe();
        let started_generation = *generation.borrow();
        let opener = self.opener.clone();
        let result = async {
        // Cancellation covers token exchange as well as the browser callback.
        let tokens = tokio::select! {
            result = oauth::sign_in(&self.http, &config, &self.endpoints, |url| opener(url), std::future::pending(), self.sign_in_timeout) => result?,
            _ = &mut cancel_rx => return Err(ConnectorError::Cancelled),
            _ = generation.changed() => return Err(ConnectorError::NotConnected),
        };
        let session = Arc::new(Session {
            http: self.http.clone(),
            endpoints: self.endpoints.clone(),
            config,
            refresh_token: tokens.refresh,
            access: Mutex::new(None),
            retry_base: self.retry_base,
        });
        session.adopt(tokens.access);
        let account_result = tokio::select! {
            result = session.account() => result,
            _ = &mut cancel_rx => Err(ConnectorError::Cancelled),
            _ = generation.changed() => Err(ConnectorError::NotConnected),
        };
        let account = match account_result {
            Ok(account) => account,
            Err(error) => {
                let _ = oauth::revoke(&self.http, &self.endpoints, &session.refresh_token).await;
                return Err(error);
            }
        };
        let mut slot = self.session.lock().await;
        // Disconnect bumps generation before taking this same lock. Check
        // again after acquiring it so credential commit cannot resurrect auth.
        if *self.generation.borrow() != started_generation || cancel_rx.try_recv().is_ok() {
            drop(slot);
            let _ = oauth::revoke(&self.http, &self.endpoints, &session.refresh_token).await;
            return Err(ConnectorError::Cancelled);
        }
        let account_json = serde_json::to_string(&account).expect("account serializes");
        let stored = self.store.set(REFRESH_KEY, &session.refresh_token).and_then(|()| self.store.set(ACCOUNT_KEY, &account_json));
        if let Err(error) = stored {
            let _ = self.store.delete(REFRESH_KEY);
            let _ = oauth::revoke(&self.http, &self.endpoints, &session.refresh_token).await;
            return Err(error);
        }
        *slot = Some(session);
        drop(slot);
        self.auth_expired.store(false, std::sync::atomic::Ordering::SeqCst);
        self.status().await
        }.await;
        self.sign_in_cancel.lock().unwrap().take();
        result.map(|mut status| {
            status.signing_in = false;
            status
        })
    }

    async fn session(&self) -> Result<(Arc<Session>, Account), ConnectorError> {
        if self.auth_expired.load(std::sync::atomic::Ordering::SeqCst) {
            return Err(ConnectorError::AuthExpired);
        }
        let account = self.stored_account()?.ok_or(ConnectorError::NotConnected)?;
        let mut slot = self.session.lock().await;
        if let Some(session) = slot.as_ref() {
            return Ok((session.clone(), account));
        }
        let config = self.client_config()?.ok_or(ConnectorError::NotConfigured)?;
        let refresh_token = self
            .store
            .get(REFRESH_KEY)?
            .ok_or(ConnectorError::NotConnected)?;
        let session = Arc::new(Session {
            http: self.http.clone(),
            endpoints: self.endpoints.clone(),
            config,
            refresh_token,
            access: Mutex::new(None),
            retry_base: self.retry_base,
        });
        *slot = Some(session.clone());
        Ok((session, account))
    }

    fn note<T>(&self, result: Result<T, ConnectorError>) -> Result<T, ConnectorError> {
        if matches!(result, Err(ConnectorError::AuthExpired)) {
            self.auth_expired
                .store(true, std::sync::atomic::Ordering::SeqCst);
        }
        result
    }

    async fn cancellable<T>(
        &self,
        work: impl std::future::Future<Output = Result<T, ConnectorError>>,
    ) -> Result<T, ConnectorError> {
        let mut generation = self.generation.subscribe();
        tokio::select! {
            result = work => self.note(result),
            _ = generation.changed() => Err(ConnectorError::NotConnected),
        }
    }

    pub async fn list_courses(&self) -> Result<Vec<Course>, ConnectorError> {
        let (session, _) = self.session().await?;
        self.cancellable(session.courses()).await
    }

    /// Fetch complete coursework and submissions for each course. A course is
    /// reported `Ok` only when every page of both lists succeeded.
    pub async fn fetch_courses(
        &self,
        course_ids: &[String],
    ) -> Result<FetchResult, ConnectorError> {
        let _guard = self.fetching.try_lock().map_err(|_| ConnectorError::Busy)?;
        let (session, account) = self.session().await?;
        let mut results = Vec::with_capacity(course_ids.len());
        for course_id in course_ids {
            let work = async {
                tokio::try_join!(
                    session.course_work(course_id),
                    session.submissions(course_id)
                )
            };
            match self.cancellable(work).await {
                Ok((course_work, submissions)) => results.push(CourseResult::Ok {
                    snapshot: CourseSnapshot {
                        course_id: course_id.clone(),
                        course_work,
                        submissions,
                    },
                }),
                Err(error @ (ConnectorError::AuthExpired | ConnectorError::NotConnected)) => {
                    return Err(error)
                }
                Err(error) => results.push(CourseResult::Error {
                    course_id: course_id.clone(),
                    error,
                }),
            }
        }
        Ok(FetchResult {
            account_id: account.id,
            results,
        })
    }

    /// Cancel work, clear tokens, and attempt revocation. The OAuth client
    /// configuration is kept for reconnecting.
    pub async fn disconnect(&self) -> Result<DisconnectResult, ConnectorError> {
        self.generation.send_modify(|generation| *generation += 1);
        self.cancel_connect();
        let session = self.session.lock().await.take();
        let refresh_token = match session {
            Some(session) => Some(session.refresh_token.clone()),
            None => self.store.get(REFRESH_KEY).ok().flatten(),
        };
        self.store.delete(REFRESH_KEY)?;
        self.store.delete(ACCOUNT_KEY)?;
        self.auth_expired
            .store(false, std::sync::atomic::Ordering::SeqCst);
        let revoked = match refresh_token {
            Some(token) => oauth::revoke(&self.http, &self.endpoints, &token)
                .await
                .is_ok(),
            None => true,
        };
        Ok(DisconnectResult { revoked })
    }
}

/// Keyring service name. `KANBAN_CREDENTIAL_NAMESPACE` isolates smoke tests
/// from the real credentials.
pub fn credential_service(identifier: &str) -> String {
    match std::env::var("KANBAN_CREDENTIAL_NAMESPACE") {
        Ok(namespace) if !namespace.trim().is_empty() => {
            format!("{identifier}.classroom.{}", namespace.trim())
        }
        _ => format!("{identifier}.classroom"),
    }
}

pub mod commands {
    use super::*;
    use tauri::State;

    #[tauri::command]
    pub async fn classroom_status(
        connector: State<'_, Connector>,
    ) -> Result<Status, ConnectorError> {
        connector.status().await
    }

    #[tauri::command]
    pub async fn classroom_configure(
        connector: State<'_, Connector>,
        client_json: String,
    ) -> Result<Status, ConnectorError> {
        if client_json.len() > 64 * 1024 {
            return Err(ConnectorError::InvalidConfig(
                "The file is too large to be an OAuth client JSON.".into(),
            ));
        }
        connector.configure(&client_json).await
    }

    #[tauri::command]
    pub async fn classroom_connect(
        connector: State<'_, Connector>,
    ) -> Result<Status, ConnectorError> {
        connector.connect().await
    }

    #[tauri::command]
    pub fn classroom_cancel_connect(connector: State<'_, Connector>) {
        connector.cancel_connect();
    }

    #[tauri::command]
    pub async fn classroom_list_courses(
        connector: State<'_, Connector>,
    ) -> Result<Vec<Course>, ConnectorError> {
        connector.list_courses().await
    }

    #[tauri::command]
    pub async fn classroom_fetch_courses(
        connector: State<'_, Connector>,
        course_ids: Vec<String>,
    ) -> Result<FetchResult, ConnectorError> {
        if course_ids.len() > 200 {
            return Err(ConnectorError::Api("too many courses requested".into()));
        }
        connector.fetch_courses(&course_ids).await
    }

    #[tauri::command]
    pub async fn classroom_disconnect(
        connector: State<'_, Connector>,
    ) -> Result<DisconnectResult, ConnectorError> {
        connector.disconnect().await
    }
}
