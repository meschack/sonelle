#![cfg_attr(test, allow(dead_code))]

use serde::Serialize;
use tauri::{ipc::Channel, plugin::TauriPlugin, AppHandle, Manager, Wry};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FocusSubscription {
    on_intent: Channel<serde_json::Value>,
}

#[derive(Debug)]
pub struct AndroidAudioFocusBridge {
    #[cfg(target_os = "android")]
    handle: PluginHandle<Wry>,
}

pub fn init() -> TauriPlugin<Wry> {
    tauri::plugin::Builder::new("android-audio-focus")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            app.manage(AndroidAudioFocusBridge {
                handle: _api.register_android_plugin("app.sonelle.reader", "AudioFocusPlugin")?,
            });
            #[cfg(not(target_os = "android"))]
            app.manage(AndroidAudioFocusBridge {});
            Ok(())
        })
        .build()
}

pub async fn subscribe(
    app: &AppHandle,
    on_intent: Channel<serde_json::Value>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let _: serde_json::Value = app
            .state::<AndroidAudioFocusBridge>()
            .handle
            .run_mobile_plugin_async("subscribe", FocusSubscription { on_intent })
            .await
            .map_err(friendly_plugin_error)?;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, on_intent);
    }
    Ok(())
}

pub async fn set_playing(app: &AppHandle, playing: bool) -> Result<(), String> {
    run(
        app,
        "setPlayback",
        serde_json::json!({ "playing": playing }),
    )
    .await
}

pub async fn clear(app: &AppHandle) -> Result<(), String> {
    run(app, "clear", serde_json::json!({})).await
}

async fn run(app: &AppHandle, command: &str, payload: serde_json::Value) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let _: serde_json::Value = app
            .state::<AndroidAudioFocusBridge>()
            .handle
            .run_mobile_plugin_async(command, payload)
            .await
            .map_err(friendly_plugin_error)?;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, command, payload);
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn friendly_plugin_error(error: tauri::plugin::mobile::PluginInvokeError) -> String {
    crate::error_log::record_native_error("android-audio-focus", &error.to_string());
    "Android couldn't update narration audio focus.".to_string()
}
