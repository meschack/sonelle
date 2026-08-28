use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BuildIdentity {
    pub version: &'static str,
    pub commit_revision: &'static str,
    pub build_type: &'static str,
    pub abi: &'static str,
    pub narration_profile: &'static str,
    pub narration_catalog_sha256: &'static str,
    pub narration_model_revision: &'static str,
}

pub fn current() -> BuildIdentity {
    BuildIdentity {
        version: env!("CARGO_PKG_VERSION"),
        commit_revision: option_env!("SONELLE_BUILD_COMMIT").unwrap_or("local"),
        build_type: option_env!("SONELLE_BUILD_TYPE").unwrap_or(default_build_type()),
        abi: android_abi(),
        narration_profile: narration_profile(),
        narration_catalog_sha256: option_env!("SONELLE_NARRATION_CATALOG_SHA256")
            .unwrap_or("local"),
        narration_model_revision: narration_model_revision(),
    }
}

const fn default_build_type() -> &'static str {
    if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    }
}

const fn android_abi() -> &'static str {
    if cfg!(all(target_os = "android", target_arch = "aarch64")) {
        "arm64-v8a"
    } else if cfg!(all(target_os = "android", target_arch = "arm")) {
        "armeabi-v7a"
    } else if cfg!(all(target_os = "android", target_arch = "x86")) {
        "x86"
    } else if cfg!(all(target_os = "android", target_arch = "x86_64")) {
        "x86_64"
    } else {
        "desktop"
    }
}

const fn narration_profile() -> &'static str {
    if cfg!(all(
        target_os = "android",
        target_arch = "aarch64",
        feature = "android-offline-voice-candidate"
    )) {
        "offline-voice-candidate"
    } else if cfg!(target_os = "android") {
        "reader-only"
    } else {
        "desktop-hybrid"
    }
}

fn narration_model_revision() -> &'static str {
    if cfg!(all(
        target_os = "android",
        target_arch = "aarch64",
        feature = "android-offline-voice-candidate"
    )) {
        match option_env!("SONELLE_NARRATION_MODEL_REVISION") {
            Some(revision) => revision,
            None => "candidate-local",
        }
    } else {
        "none"
    }
}

#[cfg(test)]
mod tests {
    use super::current;

    #[test]
    fn local_build_identity_is_complete_without_ci_environment() {
        let identity = current();
        assert!(!identity.version.is_empty());
        assert!(!identity.commit_revision.is_empty());
        assert!(!identity.build_type.is_empty());
        assert_eq!(identity.abi, "desktop");
        assert_eq!(identity.narration_profile, "desktop-hybrid");
        assert_eq!(identity.narration_model_revision, "none");
    }
}
