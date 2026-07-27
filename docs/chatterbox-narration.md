# Local Chatterbox narration

Gideon can synthesize English narration locally with the official MIT-licensed Resemble AI Chatterbox package. The preferred pilot model is `ResembleAI/chatterbox-turbo` through `chatterbox-tts==0.1.7`. Generated files and model weights remain private under ignored `tmp/` paths.

Official sources: [Resemble AI Chatterbox](https://github.com/resemble-ai/chatterbox), [Turbo model](https://huggingface.co/ResembleAI/chatterbox-turbo), and [PyPI package](https://pypi.org/project/chatterbox-tts/).

## Install and verify

Requirements are macOS on Apple Silicon, Python 3.11, `uv`, FFmpeg/FFprobe, and enough local disk for the isolated environment and model cache.

```sh
pnpm chatterbox:setup
pnpm chatterbox:canary
pnpm test:narration
```

Setup creates `tmp/chatterbox-runtime/.venv`, pins `chatterbox-tts==0.1.7` and `setuptools==80.9.0`, downloads the official Turbo snapshot once, and performs a real inference. Setuptools is pinned because the current `resemble-perth` package still imports `pkg_resources`; without it, official Chatterbox fails before inference. Normal provider runs use the already downloaded snapshot and fail closed if it is absent.

The local pilot was verified on an Apple M2 Pro with 16 GB unified memory using PyTorch MPS. The first real canary loaded model revision `749d1c1a46eb10492095d68fbcf55691ccf137cd` in 23.38 seconds and generated a 3.64-second, 24 kHz sample in 34.48 seconds. These are one-machine canary measurements, not general performance promises. The installed isolated runtime plus model cache used approximately 4.9 GB during verification.

The local bridge receives bounded JSON over stdin, runs with `shell: false`, allowlists model/device choices, restricts output to an approved private directory, loads the model once for all semantic beats, and records package/model/revision/device/seed/timing provenance. Chatterbox applies the official PerTh audio watermark.

Set `GIDEON_CHATTERBOX_CANARY_DIR` to move private canary output. The provider constructor accepts an explicit `device: "mps" | "cpu"` and model-cache root; it never silently changes the recorded device. Turbo was selected over the 500M general and multilingual models because this English narration pilot benefits from its smaller 350M footprint, built-in model voice, and lower local inference cost. Multilingual V3 is unnecessary for the current English script. Nano is a promising official CPU-oriented option, but it is not part of the pinned `chatterbox-tts==0.1.7` runtime used by this verified path.

## Solomon pilot and fallback

```sh
pnpm presenter:pilot:chatterbox
```

This writes a new version under `tmp/solomon-masked-presenter-chatterbox-v1` and does not overwrite the Samantha baseline in `tmp/solomon-masked-presenter-v1`. Chatterbox is preferred. Samantha is an explicit local fallback, and fallback use is recorded in narration provenance. A failed or unavailable fallback is a hard failure.

The narration is generated per approved semantic beat. Approved text is preserved separately from prepared text. Compact beats may replace an internal full-stop pause with a comma without changing the approved copy. Leading and trailing model silence is removed without touching internal speech pauses. Timing correction is capped at 1.08×; a beat that cannot fit naturally fails with an instruction to revise or regenerate instead of receiving aggressive `atempo` compression. The final narration bed is explicitly resampled to 48 kHz.

## Voice and consent policy

The shipped pilot uses Chatterbox's model-default voice. It does not clone a person. Reference audio is rejected unless the request includes a matching SHA-256 and an explicit consent record scoped to Gideon product narration. References are size-bounded, hash-verified by both the TypeScript contract and Python bridge, and must stay in private storage. Publication still requires human editorial review of pronunciation, pacing, artifacts, claims, and voice suitability.

## Reusable integrations

`NarrationProvider` is the provider-neutral, beat-aware interface. `ChatterboxNarrationProvider` provides local inference and content caching; `MacOsSayNarrationProvider` is the review fallback; `NarrationProviderChain` makes fallback explicit. `createChatterboxCaptureNarrationProvider` adapts the same provider to Gideon's capture-presentation contract.

Cache identity covers provider/package version, model, device, seed, beat, prepared text, voice mode, reference hash, and consent lineage. Changing any inference-relevant input produces a new cache entry.

Each immutable cache WAV has an atomic JSON sidecar containing its SHA-256, format, model revision, device, and generation timing. Hits re-open the WAV, validate its header, and verify the checksum before reuse. Failed synthesis is written separately and cannot replace the prior validated cache entry.

To regenerate a beat, change an inference-relevant input (approved text, prepared pacing, pronunciation, seed, model, or approved voice) and run the pilot again. Gideon generates a new key and leaves the prior immutable artifact available for comparison.

## Approved reference recordings

Use a private absolute WAV path containing one consenting speaker for roughly 10–20 seconds. Record in a quiet room with minimal echo, no music, no clipping, and a natural neutral-to-expressive range. The request must carry the file SHA-256 and a consent record scoped to `gideon_product_narration`; file presence alone is never consent. Reference audio and consent evidence must remain in private storage. The first Solomon pilot intentionally uses the model-provided voice because no approved reference was supplied.

## Removal

Quit any running Gideon inference, then remove the ignored `tmp/chatterbox-runtime` directory to uninstall the Python environment and model cache. Remove `tmp/solomon-masked-presenter-chatterbox-v1` separately if the generated review media is no longer needed. This does not change Gideon source or the Samantha baseline.

## Known limitations and human decisions

- MPS output is seeded and cached, but bit-for-bit identity across different hardware is not promised.
- Turbo does not support every expression control exposed by the general model; Gideon uses conservative temperature and punctuation shaping.
- The published PerTh dependency currently requires the explicit Setuptools compatibility pin.
- Local automated checks cannot reliably judge pronunciation, hallucinated spoken words, breaths, laughter, or subjective naturalness without adding another heavyweight speech model.
- A human must listen to the complete A/B file and approve naturalness, pronunciation, voice suitability, claims, and publication.
