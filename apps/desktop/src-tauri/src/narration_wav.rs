pub fn float_wav(sample_rate: u32, samples: &[f32]) -> Result<Vec<u8>, String> {
    let data_bytes = (samples.len() as u64)
        .checked_mul(2)
        .ok_or_else(|| "Prepared narration audio is too large.".to_string())?;
    let riff_size = 36_u64
        .checked_add(data_bytes)
        .ok_or_else(|| "Prepared narration audio is too large.".to_string())?;
    if riff_size > u64::from(u32::MAX) || data_bytes > u64::from(u32::MAX) {
        return Err("Prepared narration audio is too large.".to_string());
    }

    let mut wav = Vec::with_capacity(44 + data_bytes as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(riff_size as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    wav.extend_from_slice(&2_u16.to_le_bytes());
    wav.extend_from_slice(&16_u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(data_bytes as u32).to_le_bytes());
    for sample in samples {
        let pcm = (sample.clamp(-1.0, 1.0) * 32767.0) as i16;
        wav.extend_from_slice(&pcm.to_le_bytes());
    }

    Ok(wav)
}

#[cfg(test)]
mod tests {
    use super::float_wav;

    #[test]
    fn writes_pcm_wave_header_and_samples() {
        let wav = float_wav(24_000, &[0.0, 1.0, -1.0]).expect("wav should encode");

        assert_eq!(&wav[..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(wav.len(), 44 + 6);
    }
}
