fn main() {
    for name in [
        "SONELLE_BUILD_COMMIT",
        "SONELLE_BUILD_TYPE",
        "SONELLE_NARRATION_CATALOG_SHA256",
        "SONELLE_NARRATION_MODEL_REVISION",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
    }
    tauri_build::build()
}
