#!/usr/bin/env python3
"""Measure reproducible local pitch and energy features for narration WAV files."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import librosa
import numpy as np


def percentile(values: np.ndarray, value: float) -> float:
    if values.size == 0:
        return 0.0
    return float(np.percentile(values, value))


def analyze(file_path: str) -> dict[str, object]:
    y, sample_rate = librosa.load(file_path, sr=22050, mono=True)
    if y.size == 0:
        raise ValueError(f"Audio is empty: {file_path}")
    non_silent, _ = librosa.effects.trim(y, top_db=42)
    analysis = non_silent if non_silent.size > 0 else y
    rms = librosa.feature.rms(y=analysis, frame_length=2048, hop_length=256)[0]
    rms_db = librosa.amplitude_to_db(np.maximum(rms, 1e-8), ref=1.0)
    f0, voiced_flag, voiced_probability = librosa.pyin(
        analysis,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("F4"),
        sr=sample_rate,
        frame_length=2048,
        hop_length=256,
    )
    voiced_f0 = f0[np.isfinite(f0)] if f0 is not None else np.array([], dtype=float)
    if voiced_f0.size > 0:
        median_f0 = float(np.median(voiced_f0))
        semitones = 12.0 * np.log2(voiced_f0 / median_f0)
        pitch_range = percentile(semitones, 90) - percentile(semitones, 10)
        pitch_std = float(np.std(semitones))
        median_pitch = median_f0
    else:
        pitch_range = 0.0
        pitch_std = 0.0
        median_pitch = 0.0
    energy_range = percentile(rms_db, 90) - percentile(rms_db, 10)
    voiced_ratio = float(np.mean(voiced_flag)) if voiced_flag is not None and voiced_flag.size else 0.0
    mean_voiced_probability = (
        float(np.nanmean(voiced_probability))
        if voiced_probability is not None and voiced_probability.size
        else 0.0
    )
    edge_frames = max(1, min(8, rms_db.size // 4))
    start_energy = float(np.mean(rms_db[:edge_frames]))
    end_energy = float(np.mean(rms_db[-edge_frames:]))
    return {
        "audioPath": str(Path(file_path).resolve()),
        "durationMs": round(len(y) / sample_rate * 1000),
        "pitchRangeSemitones": round(pitch_range, 4),
        "pitchStdSemitones": round(pitch_std, 4),
        "medianPitchHz": round(median_pitch, 4),
        "energyRangeDb": round(energy_range, 4),
        "meanEnergyDb": round(float(np.mean(rms_db)), 4),
        "startEnergyDb": round(start_energy, 4),
        "endEnergyDb": round(end_energy, 4),
        "voicedRatio": round(voiced_ratio, 4),
        "meanVoicedProbability": round(mean_voiced_probability, 4),
        "flatPitch": pitch_range < 2.5,
    }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: analyze_narration_prosody.py AUDIO [AUDIO ...]")
    print(json.dumps({"schemaVersion": "1", "files": [analyze(value) for value in sys.argv[1:]]}))


if __name__ == "__main__":
    main()
