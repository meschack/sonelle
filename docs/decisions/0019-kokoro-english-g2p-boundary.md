# 0019: Kokoro English G2P Boundary

## Status

Accepted for the hybrid development path. Listening QA and final license review remain release
gates.

## Context

Kokoro needs English grapheme-to-phoneme conversion before Sonelle can build model inputs from real
book text. The Python reference uses Misaki and an eSpeak fallback, but shipping Python inside the
desktop app would add runtime weight, packaging risk, and another platform failure surface.

The Rust `misaki-rs` crate provides a Kokoro-oriented English G2P implementation with embedded
lexicons and tagger data. Its default feature enables an eSpeak fallback, so Sonelle opts out of
default features: statically linking that fallback would conflict with Sonelle's permissive license
and add native packaging and pronunciation-data requirements.

Real-book QA showed that Misaki deliberately spells unknown words character by character when that
fallback is disabled. This made uncommon names sound like initialisms. Misaki also inserts a word
boundary inside hyphenated compounds, producing an unnatural pause.

## Decision

Sonelle adds a native `kokoro_text` module that owns English text preprocessing for Kokoro:

- accepting Sonelle sentence IDs and text;
- selecting American or British English phonemization;
- calling `misaki-rs` with default features disabled;
- predicting genuine out-of-vocabulary English words with the embedded, pure-Rust
  `grapheme_to_phoneme` model and converting its ARPAbet result into Kokoro phonemes;
- preserving short initialisms while treating unknown, pronounceable all-caps tokens as words;
- deriving possessive forms from the stem pronunciation and the English `/s/`, `/z/`, or `/ɪz/`
  suffix rule, including typographic apostrophes;
- phonemizing each real word inside a hyphenated compound, then removing only the artificial pause
  between those phonemes without changing the reader's displayed text;
- rejecting empty text or unknown phoneme output before model preparation;
- returning `KokoroSentencePhonemes` for the native Kokoro inference boundary.

The module refuses to own:

- Kokoro ONNX inference;
- voice style loading;
- sentence duration projection;
- cache writes, playback, or UI state;
- eSpeak fallback packaging or system dependencies.

Prepared-audio identity includes a provider preparation revision. Pronunciation-rule changes bump
that revision so previously rendered speech cannot survive as a stale cache hit.

## Events

No provider-specific event is introduced. The module is preparation plumbing behind the shared
`NarrationPreparationStarted` and `PassageNarrationReady` lifecycle.

## Testing

Portable tests cover American and British English phonemization, sentence ID preservation,
hyphenated compounds, straight and typographic possessives, possessive suffix voicing, emphasized
words, unknown names, short initialisms, empty sentence rejection, and unknown phoneme rejection.
Dependency checks confirm `espeak-rs` is not part of the native dependency tree. Cache tests prove
that a provider preparation revision changes asset identity.
