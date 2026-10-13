//! Desktop OAuth client configuration imported from a Google Cloud JSON download.
//!
//! Only the client ID and secret are taken from the file. Endpoints are fixed
//! constants so a tampered download cannot redirect credentials elsewhere.

use serde::{Deserialize, Serialize};

use super::error::ConnectorError;

pub const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
pub const USERINFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
pub const CLASSROOM_URL: &str = "https://classroom.googleapis.com";

pub const SCOPE_COURSES: &str = "https://www.googleapis.com/auth/classroom.courses.readonly";
pub const SCOPE_COURSEWORK: &str =
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly";
/// Google's live token response uses this read-only name for SCOPE_COURSEWORK.
pub const SCOPE_SUBMISSIONS_READONLY: &str =
    "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly";
pub const SCOPES: [&str; 4] = ["openid", "email", SCOPE_COURSES, SCOPE_COURSEWORK];
/// Scopes that must be granted for the connector to work.
pub const REQUIRED_SCOPES: [&str; 2] = [SCOPE_COURSES, SCOPE_COURSEWORK];

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClientConfig {
    pub client_id: String,
    pub client_secret: String,
}

impl std::fmt::Debug for ClientConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClientConfig")
            .field("client_id", &self.client_id)
            .field("client_secret", &"<redacted>")
            .finish()
    }
}

/// Google's endpoints, overridable only by tests.
#[derive(Clone, Debug)]
pub struct Endpoints {
    pub auth: String,
    pub token: String,
    pub revoke: String,
    pub userinfo: String,
    pub classroom: String,
}

impl Default for Endpoints {
    fn default() -> Self {
        Self {
            auth: AUTH_URL.into(),
            token: TOKEN_URL.into(),
            revoke: REVOKE_URL.into(),
            userinfo: USERINFO_URL.into(),
            classroom: CLASSROOM_URL.into(),
        }
    }
}

#[derive(Deserialize)]
struct InstalledFile {
    installed: Option<InstalledClient>,
    web: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct InstalledClient {
    client_id: Option<String>,
    client_secret: Option<String>,
}

/// Validate a downloaded `client_secret_*.json` for a Desktop app client.
pub fn parse_client_json(raw: &str) -> Result<ClientConfig, ConnectorError> {
    let invalid = |reason: &str| ConnectorError::InvalidConfig(reason.to_string());
    let file: InstalledFile = serde_json::from_str(raw)
        .map_err(|_| invalid("The file is not valid OAuth client JSON."))?;
    let Some(installed) = file.installed else {
        return Err(invalid(if file.web.is_some() {
            "This is a Web application client. Create a Desktop app OAuth client instead."
        } else {
            "The file does not contain a Desktop app OAuth client."
        }));
    };
    let client_id = installed.client_id.unwrap_or_default().trim().to_string();
    let client_secret = installed
        .client_secret
        .unwrap_or_default()
        .trim()
        .to_string();
    if !client_id.ends_with(".apps.googleusercontent.com") || client_id.len() > 256 {
        return Err(invalid(
            "The client ID is missing or is not a Google OAuth client ID.",
        ));
    }
    if client_secret.is_empty() || client_secret.len() > 256 {
        return Err(invalid("The client secret is missing."));
    }
    Ok(ClientConfig {
        client_id,
        client_secret,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = r#"{"installed":{"client_id":"123-abc.apps.googleusercontent.com",
        "project_id":"p","auth_uri":"https://evil.example/auth","token_uri":"https://evil.example/token",
        "client_secret":"GOCSPX-secret","redirect_uris":["http://localhost"]}}"#;

    #[test]
    fn accepts_desktop_client_and_ignores_supplied_urls() {
        let config = parse_client_json(VALID).unwrap();
        assert_eq!(config.client_id, "123-abc.apps.googleusercontent.com");
        assert_eq!(config.client_secret, "GOCSPX-secret");
        let defaults = Endpoints::default();
        assert_eq!(defaults.token, TOKEN_URL);
        assert_eq!(defaults.auth, AUTH_URL);
    }

    #[test]
    fn rejects_web_clients_and_malformed_files() {
        let web = r#"{"web":{"client_id":"1.apps.googleusercontent.com","client_secret":"x"}}"#;
        assert!(
            matches!(parse_client_json(web), Err(ConnectorError::InvalidConfig(m)) if m.contains("Desktop"))
        );
        assert!(parse_client_json("not json").is_err());
        assert!(
            parse_client_json(r#"{"installed":{"client_id":"x","client_secret":"y"}}"#).is_err()
        );
        assert!(
            parse_client_json(r#"{"installed":{"client_id":"1.apps.googleusercontent.com"}}"#)
                .is_err()
        );
    }

    #[test]
    fn debug_output_redacts_secret() {
        let config = parse_client_json(VALID).unwrap();
        assert!(!format!("{config:?}").contains("GOCSPX"));
    }
}
