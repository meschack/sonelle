# Mobile Shell

## Owns

- The smallest native command surface needed to boot the shared reader on a mobile target.
- Honest empty views for desktop-only discovery data, such as prepared desktop audio and installed
  desktop fonts, until mobile adapters own those capabilities.
- The platform boundary that keeps desktop narration runtimes and command-line book opening out of
  Android builds.

## Refuses to own

- Mobile narration, model installation, document selection, background playback, or media controls.
- Reader state, EPUB parsing, storage behavior, or UI platform detection.
- Compatibility shims that claim an unavailable desktop feature works on mobile.

## Interface

The Tauri mobile entry point exposes the shared library, bookmark, search, reading-position, and
error-reporting commands. `get_audio_cache_stats` and `list_system_fonts` return empty views so the
shared reader can render without treating an intentionally absent desktop adapter as a failure.

Desktop-only commands remain in the desktop handler. A later mobile feature must add its own adapter
and command deliberately instead of widening this shell by accident.

## Capability boundary

`capabilities/android.json` is the only capability profile applied to Android. It grants the main
reader window Tauri's core defaults and nothing else. The desktop `default.json` profile is explicitly
limited to Linux, macOS, and Windows, so its dialog and opener permissions cannot leak into a mobile
build through Tauri's all-platform default.

Do not add a plugin's broad default permission merely because its Rust plugin is initialized. When a
mobile feature needs native access:

1. name the user action and the exact Tauri command it requires;
2. add the narrowest permission to `android.json`, including allow/deny scope where the plugin
   supports it;
3. add a repository contract assertion for the permission and its forbidden neighbors;
4. verify the supported action on Android and document the capability's owner here.

Filesystem, shell, dialog, opener, and process permissions remain absent until an owning mobile slice
proves one is necessary. Application commands registered by Sonelle's Rust mobile handler are governed
by that handler and are not a reason to grant unrelated plugin permissions.

## Domain events

None. The shell only selects platform adapters and command availability; it does not own long-running
work or project domain state.

## Testing

- Native unit tests verify the mobile prepared-audio fallback never reports desktop cache contents.
- `cargo check` verifies the desktop target and the Android development build verifies the mobile
  command graph.
- Emulator QA loads the fixture book and navigates between chapters through the rendered WebView.
- The capability contract test verifies Android has a dedicated core-only profile and that desktop
  permissions are platform-constrained.
