use serde::Serialize;

/// Errors returned to the UI. Messages never contain tokens or secrets.
#[derive(Debug, thiserror::Error, Clone, PartialEq, Eq)]
pub enum ConnectorError {
    #[error("{0}")]
    InvalidConfig(String),
    #[error("Set up an OAuth client before connecting.")]
    NotConfigured,
    #[error("Connect your Google account first.")]
    NotConnected,
    #[error("Secure credential storage is unavailable: {0}. Unlock or enable your system keychain and try again.")]
    SecureStorage(String),
    #[error("Sign-in was cancelled.")]
    Cancelled,
    #[error("Sign-in timed out after five minutes. Try again.")]
    TimedOut,
    #[error("Sign-in failed: {0}")]
    SignIn(String),
    #[error("Google did not return all required Classroom permissions. Missing: {missing}. Returned scopes: {granted}. If you approved every permission, share this message so the scope names can be checked.")]
    ScopeDenied { missing: String, granted: String },
    #[error(
        "Google authorization expired or was revoked. Reconnect your account to resume refresh."
    )]
    AuthExpired,
    #[error("Google Classroom is temporarily unavailable: {0}")]
    Transient(String),
    #[error("Google Classroom request failed: {0}")]
    Api(String),
    #[error("Another sign-in is already in progress.")]
    Busy,
}

impl ConnectorError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidConfig(_) => "invalid_config",
            Self::NotConfigured => "not_configured",
            Self::NotConnected => "not_connected",
            Self::SecureStorage(_) => "secure_storage",
            Self::Cancelled => "cancelled",
            Self::TimedOut => "timed_out",
            Self::SignIn(_) => "sign_in",
            Self::ScopeDenied { .. } => "scope_denied",
            Self::AuthExpired => "auth_expired",
            Self::Transient(_) => "transient",
            Self::Api(_) => "api",
            Self::Busy => "busy",
        }
    }
}

#[derive(Serialize)]
pub struct ErrorPayload {
    pub code: &'static str,
    pub message: String,
}

impl Serialize for ConnectorError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        ErrorPayload {
            code: self.code(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}
