#![cfg_attr(test, allow(dead_code))]

use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, plugin::TauriPlugin, AppHandle, Manager, Wry};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidBackgroundPlaybackSnapshot {
    pub book_title: String,
    pub author: String,
    pub chapter_title: String,
    pub playback_status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackSubscription {
    on_intent: Channel<serde_json::Value>,
}

#[derive(Debug)]
pub struct AndroidBackgroundPlaybackBridge {
    #[cfg(target_os = "android")]
    handle: PluginHandle<Wry>,
}

pub fn init() -> TauriPlugin<Wry> {
    tauri::plugin::Builder::new("android-background-playback")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            app.manage(AndroidBackgroundPlaybackBridge {
                handle: _api
                    .register_android_plugin("app.sonelle.reader", "BackgroundPlaybackPlugin")?,
            });
            #[cfg(not(target_os = "android"))]
            app.manage(AndroidBackgroundPlaybackBridge {});
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
            .state::<AndroidBackgroundPlaybackBridge>()
            .handle
            .run_mobile_plugin_async("subscribe", PlaybackSubscription { on_intent })
            .await
            .map_err(friendly_plugin_error)?;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, on_intent);
    }
    Ok(())
}

pub async fn publish(
    app: &AppHandle,
    snapshot: AndroidBackgroundPlaybackSnapshot,
) -> Result<(), String> {
    run(app, "publish", snapshot).await
}

pub async fn clear(app: &AppHandle) -> Result<(), String> {
    run(app, "clear", serde_json::json!({})).await
}

async fn run<T: Serialize>(app: &AppHandle, command: &str, payload: T) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let _: serde_json::Value = app
            .state::<AndroidBackgroundPlaybackBridge>()
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
    crate::error_log::record_native_error("android-background-playback", &error.to_string());
    "Android couldn't update background narration.".to_string()
}
