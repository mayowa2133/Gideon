# `viseme2d` local canary evidence

**Run date:** 2026-07-20
**Media:** generated, non-sensitive fixture only
**Command:** `pnpm avatar:local:canary`

## Result

- `/usr/bin/say` generated a real narration, converted locally to mono 24 kHz 16-bit PCM WAV with deliberate leading/trailing silence.
- Narration duration: 10,908 ms; energy cue count: 98; deterministic blink count: 3.
- Orbit: H.264, 720×720, 30 fps, 10,900 ms (8 ms difference from WAV).
- Nova: H.264, 720×720, 30 fps, 10,900 ms (8 ms difference from WAV).
- Full Gideon render: H.264/AAC, 1080×1920, 30 fps; video 27,766 ms and audio 27,806 ms (40 ms A/V difference).
- No API key, network request, Docker container, GPU, model endpoint, or downloaded model was used.

Generated evidence is intentionally ignored under `tmp/viseme2d-canary/`: `orbit.mp4`, `nova.mp4`, narration, product fixture, FFprobe JSON, receipt/report JSON, extracted review frames, and the final Gideon MP4.

## Visual inspection

Frames were extracted at 0.200 s (silence/rest), 0.600 s (active speech), and 1.981 s (first deterministic blink) for both presenters.

- Orbit and Nova showed closed/resting lips during silence and visibly open, different mouth shapes during active speech.
- Both blink frames showed fully closed eyes; the video also uses a small deterministic sinusoidal x/y offset, visible between sampled frames.
- Both presenters retained frontal shoulders-up framing and stable fictional identity.
- The full render removed the green background without an obvious green box around Orbit.
- The lower-right presenter did not obscure the left-aligned caption words or primary product evidence; both remained readable.
- `AI-generated brand presenter` remained visible below the presenter.
- The presenter mouth timing began with narration speech and returned to rest for the deliberate silence; no obvious start drift was visible.

The canary recreates all evidence from generated inputs, so no private user media or absolute private paths are committed.
