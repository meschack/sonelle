#![cfg_attr(test, allow(dead_code))]

use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, AppHandle, Manager, Wry};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidDeviceSpeechRequest {
    pub utterance_id: String,
    pub text: String,
    pub voice_name: String,
    pub locale: String,
    pub playback_rate: f32,
    pub volume: f32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidDeviceVoice {
    pub name: String,
    pub label: String,
    pub locale: String,
    pub network_required: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AndroidDeviceVoiceList {
    voices: Vec<AndroidDeviceVoice>,
}

#[derive(Debug)]
pub struct AndroidDeviceVoiceBridge {
    #[cfg(target_os = "android")]
    handle: PluginHandle<Wry>,
}

pub fn init() -> TauriPlugin<Wry> {
    tauri::plugin::Builder::new("android-device-voice")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            app.manage(AndroidDeviceVoiceBridge {
                handle: _api
                    .register_android_plugin("app.sonelle.reader", "DeviceNarrationPlugin")?,
            });
            #[cfg(not(target_os = "android"))]
            app.manage(AndroidDeviceVoiceBridge {});
            Ok(())
        })
        .build()
}

pub async fn list(app: &AppHandle) -> Result<Vec<AndroidDeviceVoice>, String> {
    #[cfg(target_os = "android")]
    {
        app.state::<AndroidDeviceVoiceBridge>()
            .handle
            .run_mobile_plugin_async::<AndroidDeviceVoiceList>("listVoices", ())
            .await
            .map(|response| response.voices)
            .map_err(friendly_plugin_error)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(Vec::new())
    }
}

pub async fn speak(app: &AppHandle, request: AndroidDeviceSpeechRequest) -> Result<(), String> {
    validate_request(&request)?;
    #[cfg(target_os = "android")]
    {
        let _: serde_json::Value = app
            .state::<AndroidDeviceVoiceBridge>()
            .handle
            .run_mobile_plugin_async("speak", request)
            .await
            .map_err(friendly_plugin_error)?;
        Ok(())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Device voices are available only in the Android app.".to_string())
    }
}

pub async fn stop(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let _: serde_json::Value = app
            .state::<AndroidDeviceVoiceBridge>()
            .handle
            .run_mobile_plugin_async("stop", ())
            .await
            .map_err(friendly_plugin_error)?;
        Ok(())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

fn validate_request(request: &AndroidDeviceSpeechRequest) -> Result<(), String> {
    if request.utterance_id.trim().is_empty()
        || request.text.trim().is_empty()
        || request.voice_name.trim().is_empty()
    {
        return Err("This device voice couldn't read the selected sentence.".to_string());
    }
    if !request.playback_rate.is_finite()
        || !(0.5..=2.0).contains(&request.playback_rate)
        || !request.volume.is_finite()
        || !(0.0..=1.0).contains(&request.volume)
    {
        return Err("This device voice received unsupported playback settings.".to_string());
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn friendly_plugin_error(error: tauri::plugin::mobile::PluginInvokeError) -> String {
    crate::error_log::record_native_error("android-device-voice", &error.to_string());
    "This device voice needs attention.".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_or_out_of_range_speech_requests() {
        let request = AndroidDeviceSpeechRequest {
            utterance_id: "sentence:1".to_string(),
            text: "Sonelle reads one sentence at a time.".to_string(),
            voice_name: "reader".to_string(),
            locale: "en-US".to_string(),
            playback_rate: 1.0,
            volume: 0.8,
        };
        assert!(validate_request(&request).is_ok());
        assert!(validate_request(&AndroidDeviceSpeechRequest {
            text: " ".to_string(),
            ..request.clone()
        })
        .is_err());
        assert!(validate_request(&AndroidDeviceSpeechRequest {
            playback_rate: 4.0,
            ..request
        })
        .is_err());
    }
}
