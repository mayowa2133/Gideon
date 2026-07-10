# Gideon AI avatar presenter research

**Research date:** 2026-07-10

## Decision

Gideon should keep its current deterministic logo-head presenter as the default. For a fictional-avatar prototype, use **TalkingHead** in the browser with a licensed synthetic 3D avatar, Piper narration, and the existing caption/FFmpeg render pipeline. For an offline rendered talking-image experiment, use **SadTalker** behind a Python worker. Do not ship voice cloning, arbitrary face uploads, or real-person avatar creation in the MVP.

For production, choose a modular pipeline rather than a bundled avatar app:

```text
fictional approved asset + approved TTS -> avatar worker -> private MP4/WebM
                                                   |
Gideon EDL + screen recording + captions -> FFmpeg/Remotion-style compositor -> export
```

This keeps avatar synthesis replaceable and lets Gideon reject unconsented likeness/voice inputs before generation.

## Evaluation rules

- **Commercial use** means both code and the specific model/asset weights permit the intended paid SaaS use. `Verify` means a dependency, checkpoint, or asset has a separate license.
- GPU labels: `none` means CPU is practical; `optional` means CPU works but is slow; `NVIDIA` means CUDA is the credible local path.
- Every video model can animate a user-supplied portrait. Gideon must limit production input to fictional, company-owned, or consent-verified assets.
- All avatar output must carry an on-frame and metadata disclosure such as `AI-generated brand presenter`.

## Comparison

| Tool | What it does / inputs / output | Local + GPU + speed | License, model, commercial status | Custom avatar / clone / languages | Gideon recommendation |
|---|---|---|---|---|---|
| [OpenShorts](https://github.com/mutonby/openshorts) | Full self-hosted shorts orchestrator; prompt/URL/photo plus provider assets; produces vertical UGC shorts. | Docker local, but its AI actors/lipsync default to fal.ai and narration to ElevenLabs; speed is provider-bound. | MIT application; generated-actor providers and assets are separately licensed. Commercial app code yes; end-to-end cost/terms depend on providers. | Gallery/photo upload; provider-dependent avatars/voices; multilingual depends on providers. | Study its Remotion/service orchestration only. Do not fork: it publishes a gallery and enables social posting, both outside Gideon’s privacy/MVP rules. |
| [Duix Avatar](https://github.com/duixcom/Duix-Avatar) | Offline digital-human app/API; trains/drives a portrait from text or audio. | Local Windows/Docker-oriented; NVIDIA GPU strongly expected; non-real-time batch quality. | Code and model terms are separate; repo includes a community model agreement and commercial thresholds. **Legal review required.** | Explicit appearance and voice cloning; language depends on TTS/model. | Reject for MVP and default production: powerful cloning surface and nontrivial model terms. Consider only for a consent-gated enterprise evaluation. |
| [ai-avatar-system](https://github.com/PunithVT/ai-avatar-system) | FastAPI/Next.js reference stack: photo -> XTTS -> MuseTalk lip-sync, with streaming. | Local or AWS; README reports CPU lip-sync as tens of seconds per sentence and GPU as practical. | MIT application, but MuseTalk/XTTS weights and any LLM are separate; XTTS-v2 is non-commercial. | Any frontal photo; zero-shot voice clone; claims 18-language UX. | Useful reference architecture, not a dependency. Its default cloning and XTTS licensing conflict with Gideon. |
| [MuseTalk](https://github.com/TMElyralab/MuseTalk) | Audio-driven lip-sync for video, one image, or image sequence. | Local CUDA; official claim is 30fps+ on V100; high-quality mouth sync. | Code/weights published, but pin/check the chosen release and upstream components before commercial launch. | Custom portrait/video; no voice synthesis or cloning; language follows supplied audio. | Best lip-sync component candidate for a future GPU worker after a license/security review. Fit is good for compositing an avatar MP4 into Gideon. |
| [SadTalker](https://github.com/OpenTalker/SadTalker) | Single portrait image + audio -> talking-head video with head pose/expression. | Local; CPU possible but slow, NVIDIA GPU recommended for batch output. | Apache-2.0 repository; README says non-commercial restriction was removed. Verify bundled third-party weights for exact release. | Custom fictional image; no native voice cloning; language is audio/TTS dependent. | **MVP offline avatar prototype** for a batch worker. Quality is dated versus diffusion systems but predictable enough for a labeled experimental template. |
| [Wav2Lip](https://github.com/Rudrabha/Wav2Lip) | Audio + face video/image -> accurate mouth sync. | Local CUDA preferred; fast/established, but lower resolution and limited motion. | Open source repository, but official LRS2-trained weights are strictly non-commercial. | Any identity/CGI face; no voice synthesis; multilingual audio. | Do not use in Gideon production. Treat as a research baseline only. |
| Wav2Lip-HD | Name covers community forks/upscalers rather than one canonical upstream release. | Usually local CUDA; quality/speed/model provenance varies by fork. | No single license/model answer; many forks inherit Wav2Lip’s non-commercial weight issue. | Same as Wav2Lip, sometimes enhancement. | Do not select without a specific pinned repository, weights, dataset provenance, and legal review. |
| [Hallo / Hallo2](https://github.com/fudan-generative-vision/hallo) | Audio-driven portrait animation; Hallo2 targets long, high-resolution clips. | Local CUDA, substantial VRAM; slower diffusion-style batch rendering. | Check each repo/checkpoint and base-model terms; code and weights can differ. | Single portrait plus audio; no native TTS/clone; multilingual audio. | Future research only: stronger motion/long-form potential, but operational cost and license stack are too high for MVP. |
| [Hallo3](https://github.com/fudan-generative-vision/hallo3) | Diffusion-transformer portrait animation with dynamic motion. | Local multi-GPU/high-VRAM practical path; high quality but slow. | MIT repo, but derivative CogVideo-5B terms also apply to model use. | Single portrait + audio; no native voice cloning; multilingual audio. | **Future premium generation** research candidate, not baseline production. Require GPU cost benchmark, model-license approval, and abuse controls. |
| [AniPortrait](https://github.com/scutzzj/AniPortrait) | Audio-driven photorealistic portrait animation. | Local CUDA; diffusion workflow, slower than lip-sync-only systems. | Code/model publication exists; verify exact model-card/license and all base-model dependencies. | Portrait + audio; no native TTS/clone; multilingual audio. | Research benchmark only. High visual promise, insufficient operational/license certainty for an initial service. |
| [LivePortrait](https://github.com/KlingAIResearch/LivePortrait) | Efficient image/video portrait animation and retargeting controls. | Local CUDA; comparatively efficient, suitable for preview experiments. | Repository has a custom/project license and explicit ethics warning; verify current model terms. | Custom portrait/driving video; not a TTS or voice-cloning tool. | Strong future animation component for *fictional* pre-approved avatars; not a direct audio-to-video production choice without a driving-motion design. |
| [TalkingHead](https://github.com/met4citizen/TalkingHead) | Browser JS class for real-time 3D full-body GLB avatars, visemes, expressions, and Mixamo animation. | Fully web-native; no GPU server required for normal preview; real-time. | MIT code. Avatar, font, and animation assets each have their own terms. | Custom rigged GLB; no voice clone; built-ins support several languages and external timestamp/viseme TTS. | **Best web-native avatar preview.** Use only Gideon-created or commercially cleared GLB assets; render a captured canvas/video through the normal pipeline. |
| [Linly-Talker](https://github.com/Kedreamix/Linly-Talker) | End-to-end LLM/ASR/TTS/talking-human demo integrating SadTalker/Wav2Lip/other components. | Local; GPU requirements follow selected backends; interactive demo orientation. | MIT wrapper but explicitly requires compliance with every referenced model/component. | Face upload and voice-clone integrations; multilingual varies. | Study system wiring only. Avoid as a production dependency because its inherited component/legal surface is large. |
| [OpenVoice](https://github.com/myshell-ai/OpenVoice) | Instant voice-style transfer/voice cloning with tone-color and language controls. | Local; GPU improves latency, CPU possible for batch. | V1/V2 documentation says MIT and commercial use, but pin current repo/weights and review terms. | Voice clone from reference audio; V2 supports English, Spanish, French, Chinese, Japanese, Korean. | Do not enable for customers in MVP. Potential future **consent-gated** enterprise feature only, with verified source consent, abuse detection, and revocation. |
| [Piper](https://github.com/OHF-Voice/piper1-gpl) | Fast local ONNX TTS from text -> WAV. | CPU practical and fast; small models. | Current successor is GPL-3.0; every voice has its own model card/license. | No zero-shot cloning; many language voices. | Use a process-isolated adapter only after license review, or retain Gideon’s existing provider adapter. Good low-risk fictional narration when a commercial-cleared voice is selected. |
| [Coqui TTS](https://github.com/coqui-ai/TTS) / XTTS-v2 | TTS toolkit; XTTS-v2 provides multilingual zero-shot voice cloning. | Local CUDA preferred; CPU is slow. | Code and models differ. XTTS-v2 weights use CPML, which restricts commercial use and outputs. | Strong custom voice clone; multilingual. | Do not use XTTS-v2 commercially. Existing non-cloning models still need per-model review. |
| [Bark](https://github.com/suno-ai/bark) | Generative multilingual text-to-audio, including non-speech sounds. | Local; GPU recommended, comparatively slow and stochastic. | MIT code/checkpoints per upstream; verify at release pin. | Voice presets/history prompts rather than reliable consent-safe clone; multilingual. | Not for core narration: less deterministic timing/quality. Optional offline sound-design research only. |

## Pipeline fit and quality notes

### What can integrate with Gideon

- **FFmpeg/Remotion-compatible batch renderers:** MuseTalk, SadTalker, Wav2Lip, Hallo variants, AniPortrait, LivePortrait. Treat them as Python worker jobs returning a private video artifact. Gideon then composites that artifact with product footage according to the EDL.
- **Web-native preview:** TalkingHead. Use it only as an interactive preview layer; record/capture the finished animation to a private artifact before final FFmpeg composition.
- **Orchestration references, not engines:** OpenShorts, Duix Avatar, ai-avatar-system, Linly-Talker. They package useful ideas but introduce providers, cloning, public-gallery, or component-license risks.
- **Voice engines:** Piper is the safest no-clone local direction once voice licenses are individually approved. Bark is generative/stochastic. OpenVoice and XTTS are cloning systems and require a separate consent product, not a hidden implementation toggle.

### Expected quality and speed

1. **TalkingHead:** clean stylized 3D, real-time, not photorealistic. Best for web preview and fictional hosts.
2. **MuseTalk/Wav2Lip:** strong mouth sync; MuseTalk is more modern, while official Wav2Lip weights are unusable commercially.
3. **SadTalker:** acceptable portrait/head movement for a prototype; less natural than current diffusion systems.
4. **LivePortrait:** good controllable animation, needs driving motion rather than speech directly.
5. **Hallo/AniPortrait:** highest potential for expressive photorealistic motion, but GPU cost, latency, and model/legal complexity make them premium research paths.

## Safety and product controls

Before any non-logo avatar is enabled, Gideon needs:

1. A fictional-avatar catalog with provenance, license, and allowed-use records. Do not default to user face uploads.
2. Explicit verified consent for any real face or voice; separate consent for voice cloning; revocation and deletion that remove derived assets.
3. A hard block on public figures, creators, and deceptive identity claims; perceptual matching/face-name moderation for uploads.
4. `AI-generated presenter` visual disclosure in the first viewport and export metadata; no implied endorsement.
5. Private storage, short-lived authorized delivery, source/reference retention limits, immutable audit events, and no raw reference audio in logs.
6. A worker-level allowlist of approved model versions, weights, and assets; model-license record attached to every render artifact.
7. Human review before export, especially for avatar/voice combinations, and no automatic social publishing.

## Recommendations by use case

| Need | Recommendation | Why |
|---|---|---|
| MVP avatar prototype | SadTalker + fictional catalog + non-cloning TTS | Minimal batch worker contract: image/audio in, private MP4 out; avoid real-person upload and cloning. |
| Production avatar pipeline | Modular GPU worker with MuseTalk or a commercially cleared equivalent + Piper/provider narration | Separates lipsync, narration, compositing, and policy; avoids locking Gideon into an orchestration app or non-commercial checkpoint. |
| Web-native avatar preview | TalkingHead + licensed GLB + word/viseme timestamps | Real-time, browser-native, fictional 3D host; easy to keep visibly non-human and branded. |
| Future premium avatar generation | Hallo3 and AniPortrait benchmark program | Higher motion realism, but only after hardware benchmarks, model/asset legal approval, consent system, and deepfake red-team review. |

## Explicit non-recommendations

- Do not use official Wav2Lip weights or XTTS-v2 in commercial Gideon output.
- Do not expose Duix, OpenVoice, or ai-avatar-system voice-cloning paths until consent, fraud prevention, and support operations exist.
- Do not ship OpenShorts’ public-gallery or automatic-posting behavior in Gideon.
- Do not call any third-party model “commercially usable” from its code license alone; model weights, datasets, avatar assets, and output terms must all be pinned and approved.

## Primary sources

- [OpenShorts repository](https://github.com/mutonby/openshorts)
- [Duix Avatar repository and license files](https://github.com/duixcom/Duix-Avatar)
- [ai-avatar-system repository](https://github.com/PunithVT/ai-avatar-system)
- [MuseTalk repository](https://github.com/TMElyralab/MuseTalk)
- [SadTalker repository](https://github.com/OpenTalker/SadTalker)
- [Wav2Lip repository and commercial-use notice](https://github.com/Rudrabha/Wav2Lip)
- [Hallo repository](https://github.com/fudan-generative-vision/hallo), [Hallo2 paper](https://arxiv.org/abs/2410.07718), [Hallo3 repository](https://github.com/fudan-generative-vision/hallo3)
- [AniPortrait paper/repository](https://arxiv.org/abs/2403.17694)
- [LivePortrait repository](https://github.com/KlingAIResearch/LivePortrait)
- [TalkingHead repository](https://github.com/met4citizen/TalkingHead)
- [Linly-Talker repository](https://github.com/Kedreamix/Linly-Talker)
- [OpenVoice documentation](https://docs.myshell.ai/technology/openvoice)
- [Piper repository and voice-model guidance](https://github.com/OHF-Voice/piper1-gpl)
- [XTTS-v2 model license](https://huggingface.co/coqui/XTTS-v2/blob/main/LICENSE.txt)
- [Bark repository](https://github.com/suno-ai/bark)
