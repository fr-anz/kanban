//! Loopback authorization-code sign-in with PKCE, token refresh, and revocation.

use std::future::Future;
use std::time::{Duration, Instant};

use oauth2::basic::{BasicClient, BasicErrorResponseType};
use oauth2::{
    AuthType, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, HttpRequest,
    HttpResponse, PkceCodeChallenge, RedirectUrl, RefreshToken, RequestTokenError, Scope,
    TokenResponse, TokenUrl,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use super::config::{
    ClientConfig, Endpoints, REQUIRED_SCOPES, SCOPES, SCOPE_COURSEWORK, SCOPE_SUBMISSIONS_READONLY,
};
use super::error::ConnectorError;

pub const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const MAX_REQUEST_BYTES: usize = 8 * 1024;

pub struct AccessToken {
    pub secret: String,
    pub expires_at: Instant,
}

impl AccessToken {
    pub fn fresh(&self) -> bool {
        self.expires_at > Instant::now() + Duration::from_secs(60)
    }
}

pub struct SignInTokens {
    pub access: AccessToken,
    pub refresh: String,
}

/// TLS for reqwest uses rustls with the ring provider shared with the updater.
pub fn http_client() -> reqwest::Client {
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        // OAuth token responses must not follow redirects.
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .expect("HTTP client configuration is valid")
}

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct HttpError(String);

/// Adapts reqwest 0.13 to oauth2's HTTP interface.
fn oauth_http(
    client: &reqwest::Client,
) -> impl Fn(
    HttpRequest,
) -> std::pin::Pin<Box<dyn Future<Output = Result<HttpResponse, HttpError>> + Send>>
       + '_ {
    move |request: HttpRequest| {
        let client = client.clone();
        Box::pin(async move {
            let request =
                reqwest::Request::try_from(request).map_err(|e| HttpError(e.to_string()))?;
            let response = client
                .execute(request)
                .await
                .map_err(|e| HttpError(e.without_url().to_string()))?;
            let mut builder = oauth2::http::Response::builder().status(response.status());
            for (name, value) in response.headers() {
                builder = builder.header(name, value);
            }
            let body = response
                .bytes()
                .await
                .map_err(|e| HttpError(e.to_string()))?;
            builder
                .body(body.to_vec())
                .map_err(|e| HttpError(e.to_string()))
        })
    }
}

fn oauth_client(
    config: &ClientConfig,
    endpoints: &Endpoints,
    redirect: Option<String>,
) -> Result<
    BasicClient<
        oauth2::EndpointSet,
        oauth2::EndpointNotSet,
        oauth2::EndpointNotSet,
        oauth2::EndpointNotSet,
        oauth2::EndpointSet,
    >,
    ConnectorError,
> {
    let bad = |_| ConnectorError::SignIn("invalid OAuth endpoint".into());
    let mut client = BasicClient::new(ClientId::new(config.client_id.clone()))
        .set_client_secret(ClientSecret::new(config.client_secret.clone()))
        .set_auth_type(AuthType::RequestBody)
        .set_auth_uri(AuthUrl::new(endpoints.auth.clone()).map_err(bad)?)
        .set_token_uri(TokenUrl::new(endpoints.token.clone()).map_err(bad)?);
    if let Some(redirect) = redirect {
        client = client.set_redirect_uri(RedirectUrl::new(redirect).map_err(bad)?);
    }
    Ok(client)
}

fn map_token_error<RE: std::error::Error>(
    error: RequestTokenError<RE, oauth2::StandardErrorResponse<BasicErrorResponseType>>,
) -> ConnectorError {
    match error {
        RequestTokenError::ServerResponse(response) => match response.error() {
            BasicErrorResponseType::InvalidGrant
            | BasicErrorResponseType::InvalidClient
            | BasicErrorResponseType::UnauthorizedClient => ConnectorError::AuthExpired,
            other => ConnectorError::SignIn(other.as_ref().to_string()),
        },
        RequestTokenError::Request(error) => ConnectorError::Transient(error.to_string()),
        // Usually an HTML 5xx page from the token endpoint.
        RequestTokenError::Parse(_, _) | RequestTokenError::Other(_) => {
            ConnectorError::Transient("unexpected token endpoint response".into())
        }
    }
}

fn scope_grant_error(scopes: Option<&Vec<Scope>>) -> Option<ConnectorError> {
    let granted: Vec<&str> = scopes
        .map(|scopes| {
            scopes
                .iter()
                .flat_map(|scope| scope.as_str().split(' '))
                .collect()
        })
        .unwrap_or_default();
    let missing: Vec<&str> = REQUIRED_SCOPES
        .iter()
        .copied()
        .filter(|required| {
            let canonical =
                *required == SCOPE_COURSEWORK && granted.contains(&SCOPE_SUBMISSIONS_READONLY);
            !granted.contains(required) && !canonical
        })
        .collect();
    if missing.is_empty() {
        None
    } else {
        Some(ConnectorError::ScopeDenied {
            missing: missing.join(", "),
            granted: if granted.is_empty() {
                "none reported".into()
            } else {
                granted.join(", ")
            },
        })
    }
}

enum Callback {
    Code(String),
    Denied,
    Mismatch,
    Ignore,
}

fn parse_callback(request_line: &str, state: &str) -> Callback {
    let Some(target) = request_line
        .strip_prefix("GET ")
        .and_then(|rest| rest.split(' ').next())
    else {
        return Callback::Ignore;
    };
    let Ok(url) = url::Url::parse(&format!("http://127.0.0.1{target}")) else {
        return Callback::Ignore;
    };
    if url.path() != "/" {
        return Callback::Ignore;
    }
    let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    if query.get("state").map(String::as_str) != Some(state) {
        return if query.contains_key("code") || query.contains_key("error") {
            Callback::Mismatch
        } else {
            Callback::Ignore
        };
    }
    match (query.get("code"), query.get("error")) {
        (Some(code), None) if !code.is_empty() => Callback::Code(code.clone()),
        (_, Some(_)) => Callback::Denied,
        _ => Callback::Mismatch,
    }
}

async fn respond(stream: &mut TcpStream, status: &str, message: &str) {
    let body = format!(
        "<!doctype html><meta charset=utf-8><title>Kanban</title>\
         <body style=\"font:16px system-ui;margin:48px\"><p>{message}</p></body>"
    );
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
}

async fn read_request_line(stream: &mut TcpStream) -> Option<String> {
    let mut buffer = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    while buffer.len() < MAX_REQUEST_BYTES {
        let read = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut chunk))
            .await
            .ok()?
            .ok()?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(end) = buffer.windows(2).position(|window| window == b"\r\n") {
            return String::from_utf8(buffer[..end].to_vec()).ok();
        }
    }
    None
}

/// Waits on the loopback listener until the matching redirect arrives.
async fn await_code(listener: &TcpListener, state: &str) -> Result<String, ConnectorError> {
    loop {
        let Ok((mut stream, _)) = listener.accept().await else {
            continue;
        };
        let Some(line) = read_request_line(&mut stream).await else {
            continue;
        };
        match parse_callback(&line, state) {
            Callback::Code(code) => {
                respond(
                    &mut stream,
                    "200 OK",
                    "Kanban is connected. You can close this tab and return to the app.",
                )
                .await;
                return Ok(code);
            }
            Callback::Denied => {
                respond(
                    &mut stream,
                    "200 OK",
                    "Sign-in was cancelled. You can close this tab.",
                )
                .await;
                return Err(ConnectorError::Cancelled);
            }
            Callback::Mismatch => {
                respond(&mut stream, "400 Bad Request", "This sign-in response did not match the request. Return to Kanban and try again.").await;
                return Err(ConnectorError::SignIn(
                    "authorization state mismatch".into(),
                ));
            }
            Callback::Ignore => respond(&mut stream, "404 Not Found", "Not found.").await,
        }
    }
}

/// Runs the browser sign-in. `open` receives the authorization URL. The
/// listener is dropped (closed) on every exit path.
pub async fn sign_in(
    http: &reqwest::Client,
    config: &ClientConfig,
    endpoints: &Endpoints,
    open: impl FnOnce(&str) -> Result<(), String>,
    cancel: impl Future<Output = ()>,
    timeout: Duration,
) -> Result<SignInTokens, ConnectorError> {
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| {
        ConnectorError::SignIn(format!("could not start the local sign-in listener: {e}"))
    })?;
    let port = listener
        .local_addr()
        .map_err(|e| ConnectorError::SignIn(e.to_string()))?
        .port();
    let client = oauth_client(config, endpoints, Some(format!("http://127.0.0.1:{port}")))?;
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (url, state) = client
        .authorize_url(CsrfToken::new_random)
        .add_scopes(SCOPES.iter().map(|scope| Scope::new(scope.to_string())))
        .add_extra_param("access_type", "offline")
        .add_extra_param("prompt", "consent")
        .set_pkce_challenge(challenge)
        .url();
    open(url.as_str())
        .map_err(|e| ConnectorError::SignIn(format!("could not open the browser: {e}")))?;

    let code = tokio::select! {
        result = await_code(&listener, state.secret()) => result?,
        _ = cancel => return Err(ConnectorError::Cancelled),
        _ = tokio::time::sleep(timeout) => return Err(ConnectorError::TimedOut),
    };
    drop(listener);

    let http_fn = oauth_http(http);
    let response = client
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(verifier)
        .request_async(&http_fn)
        .await
        .map_err(|error| match map_token_error(error) {
            ConnectorError::AuthExpired => {
                ConnectorError::SignIn("Google rejected the authorization code".into())
            }
            other => other,
        })?;
    let refresh = response.refresh_token().map(|token| token.secret().clone());
    let access = AccessToken {
        secret: response.access_token().secret().clone(),
        expires_at: Instant::now() + response.expires_in().unwrap_or(Duration::from_secs(3600)),
    };
    if let Some(error) = scope_grant_error(response.scopes()) {
        let _ = revoke(
            http,
            endpoints,
            refresh.as_deref().unwrap_or(&access.secret),
        )
        .await;
        return Err(error);
    }
    let refresh = refresh
        .ok_or_else(|| ConnectorError::SignIn("Google did not return a refresh token".into()))?;
    Ok(SignInTokens { access, refresh })
}

pub async fn refresh(
    http: &reqwest::Client,
    config: &ClientConfig,
    endpoints: &Endpoints,
    refresh_token: &str,
) -> Result<AccessToken, ConnectorError> {
    let client = oauth_client(config, endpoints, None)?;
    let token = RefreshToken::new(refresh_token.to_string());
    let http_fn = oauth_http(http);
    let response = client
        .exchange_refresh_token(&token)
        .request_async(&http_fn)
        .await
        .map_err(map_token_error)?;
    Ok(AccessToken {
        secret: response.access_token().secret().clone(),
        expires_at: Instant::now() + response.expires_in().unwrap_or(Duration::from_secs(3600)),
    })
}

/// Best-effort token revocation at Google's fixed endpoint.
pub async fn revoke(
    http: &reqwest::Client,
    endpoints: &Endpoints,
    token: &str,
) -> Result<(), ConnectorError> {
    let body = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("token", token)
        .finish();
    let response = http
        .post(&endpoints.revoke)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|e| ConnectorError::Transient(e.without_url().to_string()))?;
    // 400 means the token was already invalid, which is the desired end state.
    if response.status().is_success() || response.status() == reqwest::StatusCode::BAD_REQUEST {
        Ok(())
    } else {
        Err(ConnectorError::Transient(format!(
            "revocation returned {}",
            response.status()
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_requires_matching_state() {
        assert!(
            matches!(parse_callback("GET /?state=s1&code=abc HTTP/1.1", "s1"), Callback::Code(c) if c == "abc")
        );
        assert!(matches!(
            parse_callback("GET /?state=other&code=abc HTTP/1.1", "s1"),
            Callback::Mismatch
        ));
        assert!(matches!(
            parse_callback("GET /?code=abc HTTP/1.1", "s1"),
            Callback::Mismatch
        ));
        assert!(matches!(
            parse_callback("GET /?state=s1&error=access_denied HTTP/1.1", "s1"),
            Callback::Denied
        ));
        assert!(matches!(
            parse_callback("GET /favicon.ico HTTP/1.1", "s1"),
            Callback::Ignore
        ));
        assert!(matches!(
            parse_callback("POST /?state=s1&code=a HTTP/1.1", "s1"),
            Callback::Ignore
        ));
    }

    #[test]
    fn required_scopes_are_checked() {
        let all = vec![Scope::new(format!(
            "openid email {} {}",
            REQUIRED_SCOPES[0], REQUIRED_SCOPES[1]
        ))];
        assert!(scope_grant_error(Some(&all)).is_none());
        let partial = vec![Scope::new(format!("openid email {}", REQUIRED_SCOPES[0]))];
        assert!(scope_grant_error(Some(&partial)).is_some());
        assert!(scope_grant_error(None).is_some());
    }

    #[test]
    fn canonical_scope_does_not_replace_courses_or_allow_write_teacher_scopes() {
        let canonical = vec![Scope::new(SCOPE_SUBMISSIONS_READONLY.to_string())];
        assert!(scope_grant_error(Some(&canonical)).is_some());
        for other in [
            "https://www.googleapis.com/auth/classroom.coursework.me",
            "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
            "https://www.googleapis.com/auth/classroom.student-submissions.students.readonly",
        ] {
            let scopes = vec![Scope::new(format!("{} {other}", REQUIRED_SCOPES[0]))];
            assert!(
                scope_grant_error(Some(&scopes)).is_some(),
                "must reject {other}"
            );
        }
    }
}
