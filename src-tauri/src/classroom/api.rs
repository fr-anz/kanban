//! Authorized, read-only Classroom and userinfo requests.

use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use super::config::{ClientConfig, Endpoints};
use super::error::ConnectorError;
use super::oauth::{self, AccessToken};

pub const MAX_ATTEMPTS: u32 = 3;
const PAGE_LIMIT: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alternate_link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DueDate {
    pub year: Option<i32>,
    pub month: Option<u32>,
    pub day: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DueTime {
    pub hours: Option<u32>,
    pub minutes: Option<u32>,
    pub seconds: Option<u32>,
}

/// Coursework fields the connector imports. Unknown fields (materials,
/// grading data) are dropped during deserialization.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CourseWork {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alternate_link: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub work_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_date: Option<DueDate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_time: Option<DueTime>,
}

/// The student's own submission state. Grades are intentionally omitted.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Submission {
    pub course_work_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(default)]
    pub late: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Page<T> {
    #[serde(
        default = "Vec::new",
        alias = "courses",
        alias = "courseWork",
        alias = "studentSubmissions"
    )]
    items: Vec<T>,
    next_page_token: Option<String>,
}

/// An authorized session. Access tokens live only in this process's memory.
pub struct Session {
    pub http: reqwest::Client,
    pub endpoints: Endpoints,
    pub config: ClientConfig,
    pub refresh_token: String,
    pub access: Mutex<Option<AccessToken>>,
    pub retry_base: Duration,
}

impl Session {
    async fn access_token(&self, force: bool) -> Result<String, ConnectorError> {
        let mut access = self.access.lock().await;
        if let Some(token) = access.as_ref().filter(|token| !force && token.fresh()) {
            return Ok(token.secret.clone());
        }
        let mut attempt = 0;
        let token = loop {
            match oauth::refresh(
                &self.http,
                &self.config,
                &self.endpoints,
                &self.refresh_token,
            )
            .await
            {
                Err(ConnectorError::Transient(_)) if attempt + 1 < MAX_ATTEMPTS => {
                    tokio::time::sleep(self.retry_base * 2u32.pow(attempt)).await;
                    attempt += 1;
                }
                other => break other?,
            }
        };
        let secret = token.secret.clone();
        *access = Some(token);
        Ok(secret)
    }

    pub fn adopt(&self, token: AccessToken) {
        if let Ok(mut access) = self.access.try_lock() {
            *access = Some(token);
        }
    }

    /// GET with bearer auth, one forced token refresh on 401, and bounded
    /// exponential backoff for 429/5xx/network failures.
    pub async fn get_json<T: DeserializeOwned>(
        &self,
        url: &str,
        query: &[(&str, &str)],
    ) -> Result<T, ConnectorError> {
        let mut attempt = 0;
        let mut refreshed = false;
        loop {
            let token = self.access_token(false).await?;
            let result = self
                .http
                .get(url)
                .query(query)
                .bearer_auth(&token)
                .send()
                .await;
            let transient = match result {
                Ok(response) if response.status().is_success() => {
                    return response
                        .json::<T>()
                        .await
                        .map_err(|_| ConnectorError::Api("unexpected response format".into()));
                }
                Ok(response) if response.status() == reqwest::StatusCode::UNAUTHORIZED => {
                    if refreshed {
                        return Err(ConnectorError::AuthExpired);
                    }
                    refreshed = true;
                    self.access_token(true).await?;
                    continue;
                }
                Ok(response)
                    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS
                        || response.status().is_server_error() =>
                {
                    format!("HTTP {}", response.status().as_u16())
                }
                Ok(response) => return Err(api_error(response).await),
                Err(error) => error.without_url().to_string(),
            };
            attempt += 1;
            if attempt >= MAX_ATTEMPTS {
                return Err(ConnectorError::Transient(transient));
            }
            tokio::time::sleep(self.retry_base * 2u32.pow(attempt - 1)).await;
        }
    }

    async fn get_all<T: DeserializeOwned>(
        &self,
        url: &str,
        query: &[(&str, &str)],
    ) -> Result<Vec<T>, ConnectorError> {
        let mut items = Vec::new();
        let mut token: Option<String> = None;
        for _ in 0..PAGE_LIMIT {
            let mut params = query.to_vec();
            if let Some(token) = token.as_deref() {
                params.push(("pageToken", token));
            }
            let page: Page<T> = self.get_json(url, &params).await?;
            items.extend(page.items);
            match page.next_page_token.filter(|next| !next.is_empty()) {
                Some(next) => token = Some(next),
                None => return Ok(items),
            }
        }
        Err(ConnectorError::Api("too many result pages".into()))
    }

    pub async fn account(&self) -> Result<Account, ConnectorError> {
        #[derive(Deserialize)]
        struct UserInfo {
            sub: String,
            email: Option<String>,
        }
        let info: UserInfo = self.get_json(&self.endpoints.userinfo, &[]).await?;
        Ok(Account {
            id: info.sub,
            email: info.email.unwrap_or_default(),
        })
    }

    pub async fn courses(&self) -> Result<Vec<Course>, ConnectorError> {
        let url = format!("{}/v1/courses", self.endpoints.classroom);
        self.get_all(
            &url,
            &[
                ("studentId", "me"),
                ("courseStates", "ACTIVE"),
                ("pageSize", "100"),
            ],
        )
        .await
    }

    pub async fn course_work(&self, course_id: &str) -> Result<Vec<CourseWork>, ConnectorError> {
        let url = format!(
            "{}/v1/courses/{}/courseWork",
            self.endpoints.classroom,
            encode(course_id)
        );
        self.get_all(
            &url,
            &[("courseWorkStates", "PUBLISHED"), ("pageSize", "100")],
        )
        .await
    }

    pub async fn submissions(&self, course_id: &str) -> Result<Vec<Submission>, ConnectorError> {
        let url = format!(
            "{}/v1/courses/{}/courseWork/-/studentSubmissions",
            self.endpoints.classroom,
            encode(course_id)
        );
        self.get_all(&url, &[("userId", "me"), ("pageSize", "100")])
            .await
    }
}

fn encode(segment: &str) -> String {
    url::form_urlencoded::byte_serialize(segment.as_bytes()).collect()
}

async fn api_error(response: reqwest::Response) -> ConnectorError {
    #[derive(Deserialize)]
    struct Body {
        error: Option<Detail>,
    }
    #[derive(Deserialize)]
    struct Detail {
        message: Option<String>,
    }
    let status = response.status();
    let detail = response
        .json::<Body>()
        .await
        .ok()
        .and_then(|body| body.error?.message);
    let message = match (status.as_u16(), detail) {
        (403, Some(detail)) => format!("access denied ({detail}). Check that the Classroom API is enabled and your school allows this app."),
        (403, None) => "access denied. Check that the Classroom API is enabled and your school allows this app.".into(),
        (_, Some(detail)) => format!("HTTP {} ({detail})", status.as_u16()),
        (_, None) => format!("HTTP {}", status.as_u16()),
    };
    ConnectorError::Api(message)
}
