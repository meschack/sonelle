use serde::Serialize;

/// The mobile shell reports an empty prepared-audio view until a mobile
/// narration adapter owns that capability. It must not pretend desktop cache
/// files or desktop font discovery exist on Android.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileAudioCacheStats {
    sentence_count: usize,
    size_bytes: u64,
}

pub fn empty_audio_cache_stats() -> MobileAudioCacheStats {
    MobileAudioCacheStats {
        sentence_count: 0,
        size_bytes: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mobile_shell_does_not_claim_desktop_prepared_audio() {
        assert_eq!(
            empty_audio_cache_stats(),
            MobileAudioCacheStats {
                sentence_count: 0,
                size_bytes: 0,
            }
        );
    }
}
