//! OS credential storage for the OAuth client and refresh token.

use std::collections::HashMap;
use std::sync::Mutex;

use super::error::ConnectorError;

pub const CLIENT_KEY: &str = "oauth-client";
pub const REFRESH_KEY: &str = "refresh-token";
pub const ACCOUNT_KEY: &str = "account";

/// Secret persistence. The keyring implementation is used in the app; tests
/// substitute an in-memory store.
pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<String>, ConnectorError>;
    fn set(&self, key: &str, value: &str) -> Result<(), ConnectorError>;
    fn delete(&self, key: &str) -> Result<(), ConnectorError>;
}

/// OS keychain / Credential Manager / Secret Service. There is no plaintext fallback.
pub struct KeyringStore {
    service: String,
}

impl KeyringStore {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self, key: &str) -> Result<keyring::Entry, ConnectorError> {
        keyring::Entry::new(&self.service, key).map_err(storage_error)
    }
}

fn storage_error(error: keyring::Error) -> ConnectorError {
    // Platform error text does not include secret values.
    ConnectorError::SecureStorage(error.to_string())
}

impl SecretStore for KeyringStore {
    fn get(&self, key: &str) -> Result<Option<String>, ConnectorError> {
        match self.entry(key)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(storage_error(error)),
        }
    }

    fn set(&self, key: &str, value: &str) -> Result<(), ConnectorError> {
        self.entry(key)?.set_password(value).map_err(storage_error)
    }

    fn delete(&self, key: &str) -> Result<(), ConnectorError> {
        match self.entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(storage_error(error)),
        }
    }
}

/// In-memory substitute for tests, optionally failing every operation.
#[derive(Default)]
pub struct MemoryStore {
    pub values: Mutex<HashMap<String, String>>,
    pub unavailable: bool,
}

impl MemoryStore {
    pub fn unavailable() -> Self {
        Self {
            unavailable: true,
            ..Self::default()
        }
    }

    fn check(&self) -> Result<(), ConnectorError> {
        if self.unavailable {
            Err(ConnectorError::SecureStorage(
                "test store unavailable".into(),
            ))
        } else {
            Ok(())
        }
    }
}

impl SecretStore for MemoryStore {
    fn get(&self, key: &str) -> Result<Option<String>, ConnectorError> {
        self.check()?;
        Ok(self.values.lock().unwrap().get(key).cloned())
    }
    fn set(&self, key: &str, value: &str) -> Result<(), ConnectorError> {
        self.check()?;
        self.values.lock().unwrap().insert(key.into(), value.into());
        Ok(())
    }
    fn delete(&self, key: &str) -> Result<(), ConnectorError> {
        self.check()?;
        self.values.lock().unwrap().remove(key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Writes only an isolated verification entry in the real OS credential store"]
    fn native_keyring_round_trip() {
        let store = KeyringStore::new(format!(
            "com.franz.kanban.verification.{}",
            std::process::id()
        ));
        let result = (|| {
            assert!(store.get("synthetic").unwrap().is_none());
            store.set("synthetic", "synthetic-verification-value")?;
            assert_eq!(
                store.get("synthetic")?.as_deref(),
                Some("synthetic-verification-value")
            );
            Ok::<(), ConnectorError>(())
        })();
        store.delete("synthetic").unwrap();
        result.unwrap();
        assert!(store.get("synthetic").unwrap().is_none());
    }
}
