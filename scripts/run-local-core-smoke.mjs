#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const { GideonStore } = require("../dist/main/main/store.js");
const { probeRecording } = require("../dist/main/main/media.js");
const { createGideonJobExecutor } = require("../dist/main/main/jobExecutor.js");
const { createPrivateObjectStorage } = require("../dist/main/main/storage.js");
const { callTool } = require("../dist/mcp/server.js");

const keepOutput = process.argv.includes("--keep-output");
const outputRoot = path.resolve(process.env.GIDEON_LOCAL_CORE_SMOKE_DIR || path.join("tmp", "local-core-smoke"));
const runRoot = path.join(outputRoot, new Date().toISOString().replace(/[:.]/g, "-"));
const userDataDir = path.join(runRoot, "user-data");
const projectsDir = path.join(runRoot, "projects");
const storageRoot = path.join(runRoot, "private-storage");
const storePath = path.join(userDataDir, "gideon-store.json");
const recordingPath = path.join(runRoot, "long-form-screen-recording.mp4");

await fs.mkdir(runRoot, { recursive: true });

try {
  await createSyntheticScreenRecording(recordingPath);

  const store = new GideonStore({
    userDataDir,
    storePath,
    projectsDir,
    storageRoot
  });
  const state = await store.load();
  const userId = state.activeUserId;
  const workspaceId = state.activeWorkspaceId;
  if (!userId || !workspaceId) {
    throw new Error("Local smoke could not initialize a default local user/workspace.");
  }

  let project = await store.createProject({
    name: "Local core smoke — Screenflow",
    profile: {
      productName: "Screenflow CRM",
      targetCustomer: "founders recording product walkthroughs for launch content",
      productDescription:
        "Screenflow CRM turns a long product recording into proof-backed short-form demo clips with reviewed scripts and private exports.",
      preferredTone: "direct",
      toneGuidance: "Plainspoken, concrete, and founder-led.",
      platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
      walkthroughNotes:
        "The recording shows importing a screen recording, selecting proof moments, creating launch scripts, and exporting a vertical demo."
    }
  });

  const sourceStorage = createPrivateObjectStorage({ localRootDir: storageRoot });
  const storedSource = await sourceStorage.putFile({
    workspaceId,
    projectId: project.id,
    kind: "source_recording",
    sourcePath: recordingPath,
    originalFileName: path.basename(recordingPath),
    contentType: "video/mp4"
  });
  const recording = await probeRecording(storedSource.filePath);
  project = await store.attachRecording(project.id, {
    ...recording,
    originalFilePath: recordingPath,
    artifactId: storedSource.artifact.id,
    storageKey: storedSource.artifact.storageKey,
    sha256: storedSource.artifact.sha256
  });
  project = await store.appendArtifact(project.id, storedSource.artifact);

  const executor = createGideonJobExecutor({ store });
  const analysisJob = await store.createAnalysisJobForSession({ userId, workspaceId, projectId: project.id });
  project = await executor.runAnalysisJob(project.id, analysisJob.job.id);
  assert(project.moments.length >= 4, "analysis should create at least four moments");
  project = await store.generateConcepts(project.id);
  assert(project.concepts.some((concept) => concept.selected), "analysis should create selected concepts");
  project = await store.generateScripts(project.id);
  assert(project.scripts.length >= 1, "analysis should create script drafts");
  assert(project.frameEvidence.length >= 1, "analysis should create frame evidence");

  const projectBeforeMcp = await callTool("gideon_get_project", {
    storePath,
    projectId: project.id
  });
  const firstScript = project.scripts[0];
  const firstMoment = project.moments[0];
  if (!firstScript || !firstMoment) {
    throw new Error("Local smoke expected at least one script and moment before MCP edits.");
  }

  await callTool("gideon_generate_video_edit_plan", {
    storePath,
    projectId: project.id,
    instruction: "Make this short-form demo feel like a direct founder launch clip."
  });
  await callTool("gideon_update_script", {
    storePath,
    projectId: project.id,
    scriptId: firstScript.id,
    hook: "I turned a long product walkthrough into three launch-ready clips.",
    voiceoverText:
      "Here is the fast version. Upload the screen recording, let Gideon find the proof moments, review the script, then export a vertical demo your audience can understand in seconds.",
    cta: "Export the strongest clip and share it with your launch list."
  });
  await callTool("gideon_update_moment", {
    storePath,
    projectId: project.id,
    momentId: firstMoment.id,
    label: "Upload the long recording",
    evidence: "The recording visibly starts from the imported walkthrough before Gideon creates short-form assets.",
    enabled: true
  });

  const editedStore = new GideonStore({
    userDataDir,
    storePath,
    projectsDir,
    storageRoot
  });
  project = await editedStore.getProject(project.id);
  const editedScript = project.scripts.find((script) => script.id === firstScript.id);
  assert(
    editedScript?.hook === "I turned a long product walkthrough into three launch-ready clips.",
    "MCP direct-store script edit should persist"
  );

  const editedExecutor = createGideonJobExecutor({ store: editedStore });
  const renderJob = await editedStore.createRenderJobForSession({ userId, workspaceId, projectId: project.id });
  project = await editedExecutor.runRenderJob(project.id, renderJob.job.id);
  const completedRenders = project.renders.filter((render) => render.status === "completed");
  assert(completedRenders.length >= 1, "render should create at least one completed video");
  const render = completedRenders[0];
  assert(render?.validation?.width === 1080 && render.validation.height === 1920, "render should be vertical 1080x1920");
  assert(render.outputPath, "completed render should have an output path");

  const exportStorage = createPrivateObjectStorage({ localRootDir: storageRoot });
  const storedExport = await exportStorage.putFile({
    workspaceId,
    projectId: project.id,
    kind: "export",
    sourcePath: render.outputPath,
    originalFileName: "local-core-smoke-export.mp4",
    contentType: "video/mp4"
  });
  project = await editedStore.createExportForSession({
    userId,
    workspaceId,
    projectId: project.id,
    renderId: render.id,
    artifact: storedExport.artifact
  });

  const exportArtifact = await editedStore.getExportArtifactForSession({
    userId,
    workspaceId,
    projectId: project.id,
    exportId: storedExport.artifact.id
  });
  const audit = await callTool("gideon_get_audit_log", {
    storePath,
    projectId: project.id,
    limit: 20
  });
  const auditText = JSON.stringify(audit);
  assert(auditText.includes("mcp_agent"), "MCP edits should write mcp_agent audit events");
  assert(JSON.stringify(projectBeforeMcp).includes(project.id), "MCP project inspection should return the smoke project");

  const summary = {
    status: "passed",
    storePath,
    projectId: project.id,
    recording: {
      path: storedSource.filePath,
      durationMs: recording.durationMs,
      width: recording.width,
      height: recording.height,
      sha256: storedSource.artifact.sha256
    },
    analysis: {
      moments: project.moments.length,
      concepts: project.concepts.length,
      scripts: project.scripts.length,
      frameEvidence: project.frameEvidence.length
    },
    mcp: {
      scriptEdited: editedScript?.hook,
      auditContainsMcpAgent: auditText.includes("mcp_agent")
    },
    render: {
      id: render.id,
      path: render.outputPath,
      bytes: render.sizeBytes,
      validation: render.validation
    },
    export: {
      id: exportArtifact.id,
      path: exportArtifact.localPath,
      bytes: exportArtifact.byteSize,
      sha256: exportArtifact.sha256
    }
  };
  const summaryPath = path.join(runRoot, "summary.json");
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));

  if (!keepOutput) {
    await removeOlderRuns(outputRoot, runRoot);
  }
} catch (error) {
  console.error("Local core smoke failed:");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  console.error(`Smoke artifacts were left in ${runRoot}`);
  process.exit(1);
}

async function createSyntheticScreenRecording(outputPath) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const width = 1280;
  const height = 720;
  const duration = "75";
  await execFileAsync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=${width}x${height}:rate=30:duration=${duration}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=880:sample_rate=44100:duration=${duration}`,
      "-vf",
      [
        "drawbox=x=60:y=60:w=1160:h=600:color=0x111827@0.82:t=fill",
        "drawbox=x=100:y=110:w=1080:h=72:color=0x2563eb@0.95:t=fill",
        "drawbox=x=100:y=220:w=500:h=110:color=0x10b981@0.90:t=fill",
        "drawbox=x=640:y=220:w=500:h=110:color=0xf59e0b@0.90:t=fill",
        "drawbox=x=100:y=380:w=1040:h=180:color=0xf9fafb@0.92:t=fill",
        "drawbox=x=140:y=430:w=220:h=24:color=0x111827@0.95:t=fill",
        "drawbox=x=140:y=475:w=760:h=20:color=0x111827@0.82:t=fill",
        "drawbox=x=140:y=515:w=620:h=20:color=0x111827@0.72:t=fill"
      ].join(","),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath
    ],
    { timeout: 180_000 }
  );
  const bytes = await fs.readFile(outputPath);
  if (bytes.length < 10_000) {
    throw new Error("Synthetic recording was unexpectedly small.");
  }
  return createHash("sha256").update(bytes).digest("hex");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function removeOlderRuns(root, currentRun) {
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((entryPath) => entryPath !== currentRun)
    .sort()
    .slice(0, -4);
  await Promise.all(dirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
}
