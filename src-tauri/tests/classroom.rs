//! Connector integration tests with a controlled HTTP server and an in-memory
//! credential store. No real Google endpoint or OS keychain is contacted.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine;
use kanban_lib::classroom::config::{Endpoints, SCOPE_COURSES, SCOPE_COURSEWORK};
use kanban_lib::classroom::error::ConnectorError;
use kanban_lib::classroom::secrets::{
    MemoryStore, SecretStore, ACCOUNT_KEY, CLIENT_KEY, REFRESH_KEY,
};
use kanban_lib::classroom::{Connector, CourseResult, Opener};
use sha2::Digest;
use wiremock::matchers::{body_string_contains, header, method, path, query_param};
use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};

const CLIENT_JSON: &str = r#"{"installed":{"client_id":"42-test.apps.googleusercontent.com","client_secret":"test-client-secret",
  "token_uri":"https://attacker.invalid/token","auth_uri":"https://attacker.invalid/auth"}}"#;
const REFRESH: &str = "refresh-token-value";
const ACCESS: &str = "access-token-value";

fn endpoints(server: &MockServer) -> Endpoints {
    Endpoints {
        auth: format!("{}/auth", server.uri()),
        token: format!("{}/token", server.uri()),
        revoke: format!("{}/revoke", server.uri()),
        userinfo: format!("{}/userinfo", server.uri()),
        classroom: server.uri(),
    }
}

/// Captures the authorization URL the browser would open.
fn capture() -> (Opener, Arc<Mutex<Option<String>>>) {
    let seen = Arc::new(Mutex::new(None));
    let slot = seen.clone();
    (
        Arc::new(move |url: &str| {
            *slot.lock().unwrap() = Some(url.to_string());
            Ok(())
        }),
        seen,
    )
}

fn connector(server: &MockServer, store: Arc<MemoryStore>, opener: Opener) -> Connector {
    Connector::with_endpoints(store, opener, endpoints(server))
        .with_timing(Duration::from_secs(5), Duration::from_millis(5))
}

fn token_body(scopes: &str, refresh: bool) -> serde_json::Value {
    let mut body = serde_json::json!({ "access_token": ACCESS, "token_type": "Bearer", "expires_in": 3600, "scope": scopes });
    if refresh {
        body["refresh_token"] = REFRESH.into();
    }
    body
}

fn all_scopes() -> String {
    format!(
        "openid https://www.googleapis.com/auth/userinfo.email {SCOPE_COURSES} {SCOPE_COURSEWORK}"
    )
}

async fn mount_userinfo(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path("/userinfo"))
        .and(header("authorization", format!("Bearer {ACCESS}").as_str()))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(
                serde_json::json!({ "sub": "user-1", "email": "student@example.edu" }),
            ),
        )
        .mount(server)
        .await;
}

fn query(url: &str, key: &str) -> String {
    url::Url::parse(url)
        .unwrap()
        .query_pairs()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default()
}

/// Waits for the browser URL, then plays the browser's redirect.
async fn redirect(
    seen: Arc<Mutex<Option<String>>>,
    build: impl FnOnce(&str, &str) -> String,
) -> reqwest::Response {
    let url = loop {
        if let Some(url) = seen.lock().unwrap().clone() {
            break url;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    };
    let target = build(&query(&url, "redirect_uri"), &query(&url, "state"));
    reqwest::get(target).await.unwrap()
}

async fn configured(
    server: &MockServer,
) -> (Connector, Arc<MemoryStore>, Arc<Mutex<Option<String>>>) {
    let store = Arc::new(MemoryStore::default());
    let (opener, seen) = capture();
    let connector = connector(server, store.clone(), opener);
    connector.configure(CLIENT_JSON).await.unwrap();
    (connector, store, seen)
}

#[tokio::test]
async fn sign_in_uses_pkce_state_and_stores_only_refresh_token() {
    let server = MockServer::start().await;
    mount_userinfo(&server).await;
    Mock::given(method("POST"))
        .and(path("/token"))
        .and(body_string_contains("grant_type=authorization_code"))
        .and(body_string_contains("code=auth-code"))
        .and(body_string_contains("code_verifier="))
        .respond_with(ResponseTemplate::new(200).set_body_json(token_body(&all_scopes(), true)))
        .expect(1)
        .mount(&server)
        .await;
    let (connector, store, seen) = configured(&server).await;

    let browser = tokio::spawn(redirect(seen.clone(), |redirect, state| {
        format!("{redirect}/?state={state}&code=auth-code")
    }));
    let status = connector.connect().await.unwrap();
    assert_eq!(browser.await.unwrap().status(), 200);

    let url = seen.lock().unwrap().clone().unwrap();
    assert!(
        url.starts_with(&format!("{}/auth?", server.uri())),
        "fixed endpoint, not the JSON's auth_uri"
    );
    assert_eq!(query(&url, "code_challenge_method"), "S256");
    assert!(query(&url, "redirect_uri").starts_with("http://127.0.0.1:"));
    assert_eq!(query(&url, "access_type"), "offline");
    for scope in ["openid", "email", SCOPE_COURSES, SCOPE_COURSEWORK] {
        assert!(
            query(&url, "scope").split(' ').any(|s| s == scope),
            "{scope} requested"
        );
    }
    // The verifier sent to the token endpoint must hash to the challenge.
    let token_request = &server
        .received_requests()
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.url.path() == "/token")
        .unwrap();
    let body = String::from_utf8(token_request.body.clone()).unwrap();
    let verifier = url::form_urlencoded::parse(body.as_bytes())
        .find(|(k, _)| k == "code_verifier")
        .unwrap()
        .1
        .into_owned();
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(sha2::Sha256::digest(verifier.as_bytes()));
    assert_eq!(query(&url, "code_challenge"), challenge);

    assert_eq!(status.account.unwrap().email, "student@example.edu");
    assert_eq!(store.get(REFRESH_KEY).unwrap().as_deref(), Some(REFRESH));
    let stored: Vec<String> = store.values.lock().unwrap().values().cloned().collect();
    assert!(
        stored.iter().all(|value| !value.contains(ACCESS)),
        "access token stays in memory"
    );
    let serialized = serde_json::to_string(&connector.status().await.unwrap()).unwrap();
    for secret in [REFRESH, ACCESS, "test-client-secret"] {
        assert!(
            !serialized.contains(secret),
            "status must not expose credentials"
        );
    }
}

#[tokio::test]
async fn mismatched_state_is_rejected_without_token_exchange() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(500))
        .expect(0)
        .mount(&server)
        .await;
    let (connector, store, seen) = configured(&server).await;
    let browser = tokio::spawn(redirect(seen, |redirect, _| {
        format!("{redirect}/?state=forged&code=stolen")
    }));
    let error = connector.connect().await.unwrap_err();
    assert_eq!(browser.await.unwrap().status(), 400);
    assert!(matches!(error, ConnectorError::SignIn(m) if m.contains("state")));
    assert_eq!(store.get(REFRESH_KEY).unwrap(), None);
}

#[tokio::test]
async fn sign_in_accepts_google_canonical_readonly_scope() {
    let server = MockServer::start().await;
    mount_userinfo(&server).await;
    // Scope names observed in the live Google response; no user credentials.
    let scopes = format!("https://www.googleapis.com/auth/classroom.student-submissions.me.readonly https://www.googleapis.com/auth/userinfo.email openid {SCOPE_COURSES}");
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(token_body(&scopes, true)))
        .mount(&server)
        .await;
    let (connector, store, seen) = configured(&server).await;
    let browser = tokio::spawn(redirect(seen, |target, state| {
        format!("{target}/?state={state}&code=c")
    }));
    let status = connector.connect().await.unwrap();
    browser.await.unwrap();
    assert_eq!(status.account.unwrap().id, "user-1");
    assert_eq!(store.get(REFRESH_KEY).unwrap().as_deref(), Some(REFRESH));
}

#[tokio::test]
async fn disconnect_during_account_lookup_cannot_reconnect_or_store_tokens() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(token_body(&all_scopes(), true)))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/userinfo"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(
                    serde_json::json!({ "sub": "user-1", "email": "student@example.edu" }),
                )
                .set_delay(Duration::from_millis(300)),
        )
        .mount(&server)
        .await;
    let (connector, store, seen) = configured(&server).await;
    let (signed_in, ()) = tokio::join!(connector.connect(), async {
        redirect(seen, |target, state| {
            format!("{target}/?state={state}&code=auth-code")
        })
        .await;
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if server
                    .received_requests()
                    .await
                    .unwrap()
                    .iter()
                    .any(|request| request.url.path() == "/userinfo")
                {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
        connector.disconnect().await.unwrap();
    });
    assert!(matches!(
        signed_in,
        Err(ConnectorError::Cancelled | ConnectorError::NotConnected)
    ));
    assert!(store.get(REFRESH_KEY).unwrap().is_none());
    assert!(connector.status().await.unwrap().account.is_none());
}

#[tokio::test]
async fn cancel_and_timeout_close_the_listener() {
    let server = MockServer::start().await;
    let (connector, _, seen) = configured(&server).await;
    let connector = Arc::new(connector);
    let running = connector.clone();
    let task = tokio::spawn(async move { running.connect().await });
    while seen.lock().unwrap().is_none() {
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(connector.status().await.unwrap().signing_in);
    assert!(matches!(
        connector.connect().await,
        Err(ConnectorError::Busy)
    ));
    connector.cancel_connect();
    assert_eq!(task.await.unwrap().unwrap_err(), ConnectorError::Cancelled);
    let redirect_uri = query(&seen.lock().unwrap().clone().unwrap(), "redirect_uri");
    assert!(
        reqwest::get(redirect_uri).await.is_err(),
        "listener closed after cancel"
    );
    assert!(!connector.status().await.unwrap().signing_in);

    let store = Arc::new(MemoryStore::default());
    let (opener, seen) = capture();
    let quick = Connector::with_endpoints(store, opener, endpoints(&server))
        .with_timing(Duration::from_millis(200), Duration::from_millis(5));
    quick.configure(CLIENT_JSON).await.unwrap();
    assert_eq!(quick.connect().await.unwrap_err(), ConnectorError::TimedOut);
    let redirect_uri = query(&seen.lock().unwrap().clone().unwrap(), "redirect_uri");
    assert!(
        reqwest::get(redirect_uri).await.is_err(),
        "listener closed after timeout"
    );
}

#[tokio::test]
async fn consent_denial_and_missing_scopes_are_reported() {
    let server = MockServer::start().await;
    let (connector, _store, seen) = configured(&server).await;
    let browser = tokio::spawn(redirect(seen, |redirect, state| {
        format!("{redirect}/?state={state}&error=access_denied")
    }));
    assert_eq!(
        connector.connect().await.unwrap_err(),
        ConnectorError::Cancelled
    );
    browser.await.unwrap();

    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(token_body(&format!("openid email {SCOPE_COURSES}"), true)),
        )
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/revoke"))
        .and(body_string_contains(REFRESH))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;
    let (connector, store, seen) = configured(&server).await;
    let browser = tokio::spawn(redirect(seen, |redirect, state| {
        format!("{redirect}/?state={state}&code=c")
    }));
    let error = connector.connect().await.unwrap_err();
    assert_eq!(error.code(), "scope_denied");
    let message = error.to_string();
    assert!(
        message.contains(SCOPE_COURSEWORK),
        "identifies the missing permission: {message}"
    );
    assert!(
        message.contains(SCOPE_COURSES),
        "identifies the granted permission: {message}"
    );
    assert!(!message.contains(ACCESS));
    assert!(!message.contains(REFRESH));
    browser.await.unwrap();
    assert_eq!(store.get(REFRESH_KEY).unwrap(), None);
}

async fn connected(server: &MockServer) -> (Connector, Arc<MemoryStore>) {
    let store = Arc::new(MemoryStore::default());
    let (opener, _) = capture();
    let connector = connector(server, store.clone(), opener);
    connector.configure(CLIENT_JSON).await.unwrap();
    store.set(REFRESH_KEY, REFRESH).unwrap();
    store
        .set(
            ACCOUNT_KEY,
            r#"{"id":"user-1","email":"student@example.edu"}"#,
        )
        .unwrap();
    (connector, store)
}

async fn mount_refresh(server: &MockServer) {
    Mock::given(method("POST"))
        .and(path("/token"))
        .and(body_string_contains("grant_type=refresh_token"))
        .and(body_string_contains(REFRESH))
        .respond_with(ResponseTemplate::new(200).set_body_json(token_body(&all_scopes(), false)))
        .mount(server)
        .await;
}

/// Serves `pages` successive responses keyed by pageToken.
struct Pages(Vec<serde_json::Value>);
impl Respond for Pages {
    fn respond(&self, request: &Request) -> ResponseTemplate {
        let page = request
            .url
            .query_pairs()
            .find(|(k, _)| k == "pageToken")
            .map(|(_, v)| v.parse::<usize>().unwrap())
            .unwrap_or(0);
        ResponseTemplate::new(200).set_body_json(&self.0[page])
    }
}

#[tokio::test]
async fn restart_refreshes_token_and_fetches_every_page() {
    let server = MockServer::start().await;
    mount_refresh(&server).await;
    Mock::given(method("GET"))
        .and(path("/v1/courses"))
        .and(query_param("studentId", "me"))
        .and(query_param("courseStates", "ACTIVE"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(
                serde_json::json!({ "courses": [{ "id": "c1", "name": "Biology" }] }),
            ),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET")).and(path("/v1/courses/c1/courseWork")).and(query_param("courseWorkStates", "PUBLISHED"))
        .and(header("authorization", format!("Bearer {ACCESS}").as_str()))
        .respond_with(Pages(vec![
            serde_json::json!({ "courseWork": [{ "id": "w1", "title": "Essay", "workType": "ASSIGNMENT",
                "dueDate": { "year": 2026, "month": 11, "day": 2 }, "dueTime": { "hours": 23, "minutes": 59 },
                "maxPoints": 100, "materials": [{ "driveFile": {} }] }], "nextPageToken": "1" }),
            serde_json::json!({ "courseWork": [{ "id": "w2", "title": "Quiz", "workType": "SHORT_ANSWER_QUESTION" }] }),
        ]))
        .mount(&server).await;
    Mock::given(method("GET"))
        .and(path("/v1/courses/c1/courseWork/-/studentSubmissions"))
        .and(query_param("userId", "me"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "studentSubmissions": [
            { "courseWorkId": "w1", "state": "TURNED_IN", "assignedGrade": 90, "late": true }] })),
        )
        .mount(&server)
        .await;
    let (connector, _) = connected(&server).await;

    assert_eq!(connector.list_courses().await.unwrap()[0].name, "Biology");
    let fetched = connector.fetch_courses(&["c1".into()]).await.unwrap();
    assert_eq!(fetched.account_id, "user-1");
    let CourseResult::Ok { snapshot } = &fetched.results[0] else {
        panic!("course failed: {:?}", fetched.results)
    };
    assert_eq!(
        snapshot
            .course_work
            .iter()
            .map(|w| w.id.as_str())
            .collect::<Vec<_>>(),
        ["w1", "w2"]
    );
    assert_eq!(snapshot.submissions[0].state.as_deref(), Some("TURNED_IN"));
    let json = serde_json::to_string(&fetched).unwrap();
    assert!(
        !json.contains("assignedGrade") && !json.contains("materials") && !json.contains(ACCESS)
    );
    // One refresh serves every request.
    let refreshes = server
        .received_requests()
        .await
        .unwrap()
        .iter()
        .filter(|r| r.url.path() == "/token")
        .count();
    assert_eq!(refreshes, 1);
}

#[tokio::test]
async fn transient_failures_retry_then_report_partial_results() {
    let server = MockServer::start().await;
    mount_refresh(&server).await;
    // c1: one 503, then success. c2: always 500.
    Mock::given(method("GET"))
        .and(path("/v1/courses/c1/courseWork"))
        .respond_with(ResponseTemplate::new(503))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/courses/c1/courseWork"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({ "courseWork": [{ "id": "w1", "title": "A" }] })),
        )
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/courses/c1/courseWork/-/studentSubmissions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/courses/c2/courseWork"))
        .respond_with(ResponseTemplate::new(500))
        .expect(3)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/courses/c2/courseWork/-/studentSubmissions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
        .mount(&server)
        .await;
    let (connector, _) = connected(&server).await;

    let fetched = connector
        .fetch_courses(&["c1".into(), "c2".into()])
        .await
        .unwrap();
    assert!(
        matches!(&fetched.results[0], CourseResult::Ok { snapshot } if snapshot.course_work.len() == 1)
    );
    assert!(
        matches!(&fetched.results[1], CourseResult::Error { course_id, error: ConnectorError::Transient(_) } if course_id == "c2")
    );
}

#[tokio::test]
async fn revoked_access_pauses_refresh_until_reconnect() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(
            ResponseTemplate::new(400)
                .set_body_json(serde_json::json!({ "error": "invalid_grant" })),
        )
        .expect(1)
        .mount(&server)
        .await;
    let (connector, _) = connected(&server).await;
    assert_eq!(
        connector.fetch_courses(&["c1".into()]).await.unwrap_err(),
        ConnectorError::AuthExpired
    );
    assert!(connector.status().await.unwrap().auth_expired);
    // Paused: no further token requests (expect(1) above).
    assert_eq!(
        connector.list_courses().await.unwrap_err(),
        ConnectorError::AuthExpired
    );
}

#[tokio::test]
async fn rejected_access_token_is_refreshed_once() {
    let server = MockServer::start().await;
    mount_refresh(&server).await;
    Mock::given(method("GET"))
        .and(path("/v1/courses"))
        .respond_with(ResponseTemplate::new(401))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/courses"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({ "courses": [] })),
        )
        .mount(&server)
        .await;
    let (connector, _) = connected(&server).await;
    assert!(connector.list_courses().await.unwrap().is_empty());
    let refreshes = server
        .received_requests()
        .await
        .unwrap()
        .iter()
        .filter(|r| r.url.path() == "/token")
        .count();
    assert_eq!(refreshes, 2);
}

#[tokio::test]
async fn disconnect_revokes_clears_tokens_and_keeps_client() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/revoke"))
        .and(body_string_contains(REFRESH))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;
    let (connector, store) = connected(&server).await;
    assert!(connector.disconnect().await.unwrap().revoked);
    assert_eq!(store.get(REFRESH_KEY).unwrap(), None);
    assert_eq!(store.get(ACCOUNT_KEY).unwrap(), None);
    assert!(store.get(CLIENT_KEY).unwrap().is_some());
    let status = connector.status().await.unwrap();
    assert!(status.configured && status.account.is_none());
    assert_eq!(
        connector.list_courses().await.unwrap_err(),
        ConnectorError::NotConnected
    );
}

#[tokio::test]
async fn unavailable_secure_storage_never_falls_back() {
    let server = MockServer::start().await;
    let (opener, _) = capture();
    let connector = connector(&server, Arc::new(MemoryStore::unavailable()), opener);
    assert!(matches!(
        connector.configure(CLIENT_JSON).await,
        Err(ConnectorError::SecureStorage(_))
    ));
    assert!(matches!(
        connector.status().await,
        Err(ConnectorError::SecureStorage(_))
    ));
}

#[tokio::test]
async fn errors_serialize_without_secrets() {
    let error = ConnectorError::SecureStorage("locked".into());
    let json = serde_json::to_value(&error).unwrap();
    assert_eq!(json["code"], "secure_storage");
    assert!(json["message"].as_str().unwrap().contains("locked"));
}
