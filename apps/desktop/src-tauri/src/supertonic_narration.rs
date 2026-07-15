use ort::session::RunOptions;
use std::{
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Instant,
};

use crate::error_log::record_native_error;
use crate::narration_cache::NarrationSentenceSpan;
use crate::narration_manifest::{
    ensure_narration_not_cancelled, ManifestNarrationRequest, ManifestNarrationSentence,
};
use crate::narration_rendered_audio::RenderedManifestAudio;
use crate::narration_wav::float_wav;
use crate::supertonic_helper;

static SUPERTONIC_RUNTIME: OnceLock<Mutex<Option<SupertonicRuntime>>> = OnceLock::new();

struct SupertonicRuntime {
    installation_path: PathBuf,
    tts: supertonic_helper::TextToSpeech,
    female_style: supertonic_helper::Style,
    male_style: supertonic_helper::Style,
}

#[cfg(test)]
pub fn render_supertonic_manifest(
    engine_installation_path: &Path,
    request: &ManifestNarrationRequest,
) -> Result<RenderedManifestAudio, String> {
    let run_options =
        RunOptions::new().map_err(|_| "Sonelle couldn't start offline narration.".to_string())?;
    render_supertonic_manifest_with_options(engine_installation_path, request, &run_options)
}

pub fn render_supertonic_manifest_with_options(
    engine_installation_path: &Path,
    request: &ManifestNarrationRequest,
    run_options: &RunOptions,
) -> Result<RenderedManifestAudio, String> {
    let request_started = Instant::now();
    let mut runtime_guard = SUPERTONIC_RUNTIME
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "Offline narration is already busy. Please try again.".to_string())?;
    let assets = engine_installation_path.join("assets");
    let onnx_dir = assets.join("onnx");
    let language = supertonic_language(request.passage.language.as_deref());
    if runtime_guard
        .as_ref()
        .is_none_or(|runtime| runtime.installation_path != engine_installation_path)
    {
        *runtime_guard = Some(load_supertonic_runtime(
            engine_installation_path,
            &onnx_dir,
        )?);
    }
    let runtime = runtime_guard
        .as_mut()
        .ok_or_else(|| "Sonelle couldn't start offline narration.".to_string())?;
    let SupertonicRuntime {
        tts,
        female_style,
        male_style,
        ..
    } = runtime;
    let style = if request.voice_id.to_ascii_lowercase().contains("m1") {
        male_style
    } else {
        female_style
    };
    ensure_narration_not_cancelled(&request.request_id)?;
    let texts = request
        .passage
        .sentences
        .iter()
        .map(|sentence| sentence.text.trim().to_string())
        .collect::<Vec<_>>();
    let synthesis_started = Instant::now();
    let sentence_audio = tts
        .batch_with_options(
            &texts,
            &language,
            style,
            supertonic_helper::SynthesisOptions {
                total_step: 8,
                speed: 1.05,
                silence_duration: 0.3,
                run_options,
            },
        )
        .map_err(|error| {
            log_supertonic_issue("synthesis", &error.to_string());
            "Sonelle couldn't prepare this narration.".to_string()
        })?;
    ensure_narration_not_cancelled(&request.request_id)?;
    let synthesis_elapsed = synthesis_started.elapsed();
    let audio_seconds =
        sentence_audio.iter().map(Vec::len).sum::<usize>() as f64 / tts.sample_rate as f64;
    log_supertonic_performance(
        "synthesis",
        texts.len(),
        texts.iter().map(String::len).sum(),
        synthesis_elapsed.as_secs_f64(),
        audio_seconds,
    );

    let rendered = render_sentence_audio_to_manifest(
        &request.passage.sentences,
        tts.sample_rate as u32,
        sentence_audio,
    )?;
    log_supertonic_performance(
        "request",
        texts.len(),
        texts.iter().map(String::len).sum(),
        request_started.elapsed().as_secs_f64(),
        audio_seconds,
    );
    Ok(rendered)
}

fn load_supertonic_runtime(
    engine_installation_path: &Path,
    onnx_dir: &Path,
) -> Result<SupertonicRuntime, String> {
    let _started = Instant::now();
    let onnx_dir = onnx_dir
        .to_str()
        .ok_or_else(|| "Sonelle couldn't open offline narration files.".to_string())?;
    let tts = supertonic_helper::load_text_to_speech(onnx_dir, false).map_err(|error| {
        log_supertonic_issue("startup", &error.to_string());
        "Sonelle couldn't start offline narration.".to_string()
    })?;
    let styles = engine_installation_path.join("assets").join("voice_styles");
    let female_style = load_supertonic_style(&styles.join("F1.json"))?;
    let male_style = load_supertonic_style(&styles.join("M1.json"))?;
    let runtime = SupertonicRuntime {
        installation_path: engine_installation_path.to_path_buf(),
        tts,
        female_style,
        male_style,
    };
    #[cfg(debug_assertions)]
    eprintln!(
        "[sonelle][native][supertonic:startup] elapsed_ms={}",
        _started.elapsed().as_millis()
    );
    Ok(runtime)
}

fn load_supertonic_style(path: &Path) -> Result<supertonic_helper::Style, String> {
    let path = path
        .to_str()
        .ok_or_else(|| "Sonelle couldn't open offline narration files.".to_string())?
        .to_string();
    supertonic_helper::load_voice_style(&[path], false).map_err(|error| {
        log_supertonic_issue("voice", &error.to_string());
        "Sonelle couldn't open the selected narration voice.".to_string()
    })
}

fn log_supertonic_issue(stage: &str, detail: &str) {
    record_native_error(&format!("supertonic.{stage}"), detail);
}

fn log_supertonic_performance(
    stage: &str,
    sentence_count: usize,
    character_count: usize,
    elapsed_seconds: f64,
    audio_seconds: f64,
) {
    #[cfg(debug_assertions)]
    eprintln!(
        "[sonelle][native][supertonic:{stage}] sentences={sentence_count} characters={character_count} elapsed_ms={} audio_seconds={audio_seconds:.2} rtf={:.3}",
        (elapsed_seconds * 1_000.0).round() as u64,
        elapsed_seconds / audio_seconds.max(f64::EPSILON)
    );

    #[cfg(not(debug_assertions))]
    let _ = (
        stage,
        sentence_count,
        character_count,
        elapsed_seconds,
        audio_seconds,
    );
}

pub fn render_sentence_audio_to_manifest(
    sentences: &[ManifestNarrationSentence],
    sample_rate: u32,
    sentence_audio: Vec<Vec<f32>>,
) -> Result<RenderedManifestAudio, String> {
    if sentences.len() != sentence_audio.len() {
        return Err("Prepared narration did not match the requested sentences.".to_string());
    }

    let mut start_sample = 0_u64;
    let mut spans = Vec::with_capacity(sentences.len());
    let mut audio = Vec::new();
    for (sentence, samples) in sentences.iter().zip(sentence_audio) {
        let sample_count = samples.len() as u64;
        let end_sample = start_sample
            .checked_add(sample_count)
            .ok_or_else(|| "Prepared narration audio is too large.".to_string())?;
        spans.push(NarrationSentenceSpan {
            sentence_id: sentence.id.clone(),
            start_sample,
            end_sample,
        });
        audio.extend(samples);
        start_sample = end_sample;
    }

    Ok(RenderedManifestAudio {
        sample_rate,
        sample_count: start_sample,
        sentences: spans,
        wav: float_wav(sample_rate, &audio)?,
    })
}

fn supertonic_language(language: Option<&str>) -> String {
    let normalized = language
        .and_then(|value| value.split(['-', '_']).next())
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| supertonic_helper::is_valid_lang(value));

    normalized.unwrap_or_else(|| "na".to_string())
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, path::PathBuf};

    use super::{render_sentence_audio_to_manifest, render_supertonic_manifest};
    use crate::narration_manifest::{
        ManifestNarrationPassage, ManifestNarrationRequest, ManifestNarrationSentence,
    };

    #[test]
    fn renders_sentence_spans_from_synthesized_audio() {
        let rendered = render_sentence_audio_to_manifest(
            &[
                sentence("sentence-1", 0, "Bonjour."),
                sentence("sentence-2", 1, "Nous continuons."),
            ],
            44_100,
            vec![vec![0.1; 3], vec![-0.2; 5]],
        )
        .expect("manifest audio should render");

        assert_eq!(rendered.sample_rate, 44_100);
        assert_eq!(rendered.sample_count, 8);
        assert_eq!(rendered.sentences[0].start_sample, 0);
        assert_eq!(rendered.sentences[0].end_sample, 3);
        assert_eq!(rendered.sentences[1].start_sample, 3);
        assert_eq!(rendered.sentences[1].end_sample, 8);
        assert_eq!(&rendered.wav[..4], b"RIFF");
    }

    #[test]
    fn rejects_mismatched_sentence_audio() {
        let error = render_sentence_audio_to_manifest(
            &[sentence("sentence-1", 0, "Bonjour.")],
            44_100,
            vec![],
        )
        .expect_err("missing audio should fail");

        assert_eq!(
            error,
            "Prepared narration did not match the requested sentences."
        );
    }

    #[test]
    #[ignore = "runs the real Supertonic ONNX runtime against local spike assets"]
    fn renders_real_supertonic_audio_from_local_assets() {
        let root = std::env::var("SONELLE_SUPERTONIC_FIXTURE_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                [
                    PathBuf::from(".sonelle/narration-spike/sources/supertonic"),
                    PathBuf::from("../../.sonelle/narration-spike/sources/supertonic"),
                    PathBuf::from("../../../.sonelle/narration-spike/sources/supertonic"),
                ]
                .into_iter()
                .find(|candidate| candidate.join("assets/onnx/tts.json").is_file())
                .expect("Supertonic spike assets should exist")
            });
        let rendered = render_supertonic_manifest(&root, &request())
            .expect("real Supertonic synthesis should render");

        assert_eq!(rendered.sample_rate, 44_100);
        assert!(rendered.sample_count > 1_000);
        assert_eq!(rendered.sentences.len(), 2);
        assert!(rendered.sentences[1].start_sample >= rendered.sentences[0].end_sample);
        assert_eq!(&rendered.wav[..4], b"RIFF");
    }

    fn sentence(id: &str, index: i64, text: &str) -> ManifestNarrationSentence {
        ManifestNarrationSentence {
            id: id.to_string(),
            index,
            text: text.to_string(),
        }
    }

    fn request() -> ManifestNarrationRequest {
        ManifestNarrationRequest {
            request_id: "request-1".to_string(),
            passage: ManifestNarrationPassage {
                id: "passage-1".to_string(),
                book_id: "book-1".to_string(),
                chapter_id: "chapter-1".to_string(),
                paragraph_id: "paragraph-1".to_string(),
                language: Some("fr".to_string()),
                sentences: vec![
                    sentence(
                        "sentence-1",
                        0,
                        "La lecture attentive révèle ce que la première impression avait caché.",
                    ),
                    sentence(
                        "sentence-2",
                        1,
                        "Une seconde phrase permet de vérifier la préparation groupée.",
                    ),
                ],
            },
            engine_id: "supertonic".to_string(),
            model_revision: "supertonic-test".to_string(),
            voice_id: "supertonic:F1".to_string(),
            source_text_digest: "digest".to_string(),
            synthesis_parameters: BTreeMap::new(),
        }
    }
}
