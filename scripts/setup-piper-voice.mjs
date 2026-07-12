import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const voiceConfig = JSON.parse(
  readFileSync(join(repoRoot, "packages", "audio", "src", "narration-voices.json"), "utf8")
);
const sonelleDir = join(repoRoot, ".sonelle");
const venvDir = join(sonelleDir, "piper-venv");
const voiceDir = join(sonelleDir, "voices", "piper");
const defaultVoice = voiceConfig.defaultVoiceId;
const supportedVoices = voiceConfig.voices.map((voice) => voice.id);
const piperVoiceBaseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const defaultDownloadTimeoutMs = 5 * 60 * 1000;
const piperVoicePattern =
  /^(?<langFamily>[^-]+)_(?<langRegion>[^-]+)-(?<voiceName>[^-]+)-(?<voiceQuality>.+)$/u;
const python = resolvePythonCommand(process.env, process.platform);
const venvPython =
  process.platform === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");
const onnxRuntimeDir = join(venvDir, "Lib", "site-packages", "onnxruntime", "capi");

export function resolveVoicesToInstall(env = process.env) {
  const requestedVoices = env.SONELLE_PIPER_VOICE ?? env.SONELLE_PIPER_VOICES;
  if (requestedVoices == null || requestedVoices.trim().length === 0) return supportedVoices;

  return uniqueVoiceList(requestedVoices);
}

export function resolvePythonCommand(env = process.env, platform = process.platform) {
  return env.PYTHON ?? (platform === "win32" ? "python" : "python3");
}

export async function setupPiperVoice(env = process.env) {
  const voices = resolveVoicesToInstall(env);

  mkdirSync(sonelleDir, { recursive: true });
  mkdirSync(voiceDir, { recursive: true });

  if (existsSync(venvPython) && pythonVersion(venvPython, env) !== pythonVersion(python, env)) {
    console.warn("\n> recreating the Piper Python environment for the selected Python version");
    rmSync(venvDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 });
  }

  if (!existsSync(venvPython)) {
    run(python, ["-m", "venv", venvDir], "creating Piper Python environment", env);
  }

  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"], "updating pip", env);
  run(venvPython, ["-m", "pip", "install", "piper-tts"], "installing Piper", env);
  ensurePiperImportable(env);
  for (const voice of voices) {
    const smokePath = smokePathForVoice(voice, voices.length);
    await downloadPiperVoice(voice, env);
    run(
      venvPython,
      [
        "-m",
        "piper",
        "--data-dir",
        voiceDir,
        "-m",
        voice,
        "-f",
        smokePath,
        "--",
        "Sonelle is ready to listen."
      ],
      `testing ${voice}`,
      env
    );

    console.log(`Piper voice ready: ${voice}`);
    console.log(`Smoke audio: ${smokePath}`);
  }
  console.log(`Voice data: ${voiceDir}`);
}

export function piperVoiceFileUrl(voice, extension) {
  const match = piperVoicePattern.exec(voice);
  if (match?.groups == null) {
    throw new Error(
      `Voice '${voice}' did not match pattern: <language>-<name>-<quality> like 'en_US-lessac-medium'`
    );
  }

  const langFamily = match.groups.langFamily;
  const langCode = `${langFamily}_${match.groups.langRegion}`;
  const voiceName = match.groups.voiceName;
  const voiceQuality = match.groups.voiceQuality;
  const voiceCode = `${langCode}-${voiceName}-${voiceQuality}`;

  return `${piperVoiceBaseUrl}/${langFamily}/${langCode}/${voiceName}/${voiceQuality}/${voiceCode}${extension}?download=true`;
}

async function downloadPiperVoice(voice, env) {
  if (piperVoiceInstalled(voice)) {
    console.log(`\n> ${voice} is already ready; skipping download`);
    return;
  }

  console.log(`\n> downloading ${voice}`);
  await downloadVoiceFile(voice, ".onnx", env);
  await downloadVoiceFile(voice, ".onnx.json", env);
}

async function downloadVoiceFile(voice, extension, env) {
  const url = piperVoiceFileUrl(voice, extension);
  const outputPath = join(voiceDir, `${voice}${extension}`);
  if (voiceFileReady(voice, extension)) return;

  const timeoutMs = Number(env.SONELLE_PIPER_DOWNLOAD_TIMEOUT_MS ?? defaultDownloadTimeoutMs);
  const temporaryPath = `${outputPath}.download`;
  const resumeFrom = existsSync(temporaryPath) ? statSync(temporaryPath).size : 0;
  const response = await fetchWithRetries(url, timeoutMs, env, `${voice}${extension}`, resumeFrom);

  if (!response.ok) {
    throw new Error(`Could not download ${voice}${extension}: HTTP ${response.status}`);
  }

  const isResuming = resumeFrom > 0 && response.status === 206;
  const expectedSize = readExpectedDownloadSize(response, isResuming ? resumeFrom : 0);
  if (
    existsSync(outputPath) &&
    expectedSize != null &&
    statSync(outputPath).size === expectedSize
  ) {
    await response.body?.cancel();
    return;
  }

  if (response.body == null) {
    throw new Error(`Could not download ${voice}${extension}: empty response`);
  }

  if (!isResuming) {
    rmSync(temporaryPath, { force: true });
  }

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(temporaryPath, { flags: isResuming ? "a" : "w" })
  );

  if (expectedSize != null && statSync(temporaryPath).size !== expectedSize) {
    rmSync(temporaryPath, { force: true });
    throw new Error(`Could not download ${voice}${extension}: incomplete response`);
  }

  renameSync(temporaryPath, outputPath);
}

function readExpectedDownloadSize(response, resumeFrom) {
  const contentRange = response.headers.get("content-range");
  const totalSize = contentRange?.match(/\/(?<size>\d+)$/u)?.groups?.size;
  if (totalSize != null) return Number(totalSize);

  const contentLength = readContentLength(response);
  return contentLength == null ? null : resumeFrom + contentLength;
}

function readContentLength(response) {
  const header = response.headers.get("content-length");
  if (header == null) return null;

  const length = Number(header);
  return Number.isFinite(length) && length > 0 ? length : null;
}

async function fetchWithRetries(url, timeoutMs, env, label, resumeFrom = 0) {
  const attempts = Number(env.SONELLE_PIPER_DOWNLOAD_RETRIES ?? 3);
  let lastError;
  const headers = resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(`Retrying ${label} download (${attempt + 1}/${attempts})`);
      }
    }
  }

  throw lastError;
}

function piperVoiceInstalled(voice) {
  return isPiperVoiceReady(voice);
}

export function isPiperVoiceReady(voice, directory = voiceDir) {
  return (
    voiceFileReady(voice, ".onnx", directory) && voiceFileReady(voice, ".onnx.json", directory)
  );
}

function voiceFileReady(voice, extension, directory = voiceDir) {
  const path = join(directory, `${voice}${extension}`);
  if (!existsSync(path)) return false;

  const size = statSync(path).size;
  if (extension === ".onnx") return size > 10 * 1024 * 1024;
  return size > 0;
}

function uniqueVoiceList(value) {
  const voices = value
    .split(/[,\s;]+/u)
    .map((voice) => voice.trim())
    .filter(Boolean);

  return [...new Set(voices.length > 0 ? voices : [defaultVoice])];
}

function isPiperImportable(env) {
  const result = spawnSync(venvPython, ["-c", "import piper"], {
    cwd: repoRoot,
    env,
    stdio: "ignore"
  });

  return result.error == null && result.status === 0;
}

function ensurePiperImportable(env) {
  if (isPiperImportable(env)) return;

  if (process.platform === "win32" && installAppLocalWindowsRuntime(env)) {
    console.log("\n> using the Visual C++ runtime from the local Visual Studio installation");
    if (isPiperImportable(env)) return;
  }

  console.error("Piper could not load its native audio runtime.");
  if (process.platform === "win32") {
    console.error(
      "Install the latest Microsoft Visual C++ x64 Redistributable from https://aka.ms/vc14/vc_redist.x64.exe, then retry."
    );
  }
  process.exit(1);
}

function installAppLocalWindowsRuntime(env) {
  const runtimeDir = findWindowsRuntimeDirectory(env);
  if (runtimeDir == null || !existsSync(runtimeDir) || !existsSync(onnxRuntimeDir)) return false;

  const runtimeFiles = readdirSync(runtimeDir).filter((name) =>
    /^(?:msvcp140.*|vcruntime140.*)\.dll$/iu.test(name)
  );
  if (!runtimeFiles.includes("msvcp140.dll") || !runtimeFiles.includes("vcruntime140.dll")) {
    return false;
  }

  for (const name of runtimeFiles) {
    copyFileSync(join(runtimeDir, name), join(onnxRuntimeDir, name));
  }
  return true;
}

function findWindowsRuntimeDirectory(env) {
  if (env.SONELLE_MSVC_RUNTIME_DIR != null) {
    return env.SONELLE_MSVC_RUNTIME_DIR;
  }

  const programFilesX86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const vswhere = join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (!existsSync(vswhere)) return null;

  const result = spawnSync(
    vswhere,
    ["-latest", "-products", "*", "-property", "installationPath"],
    { cwd: repoRoot, encoding: "utf8", env }
  );
  const installationPath = result.status === 0 ? result.stdout.trim() : "";
  if (installationPath.length === 0) return null;

  const redistRoot = join(installationPath, "VC", "Redist", "MSVC");
  if (existsSync(redistRoot)) {
    const versions = readdirSync(redistRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    for (const version of versions) {
      const directory = join(redistRoot, version, "x64", "Microsoft.VC143.CRT");
      if (existsSync(directory)) return directory;
    }
  }

  const ideDirectory = join(installationPath, "Common7", "IDE");
  return existsSync(ideDirectory) ? ideDirectory : null;
}

function pythonVersion(command, env) {
  const result = spawnSync(
    command,
    ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
    { cwd: repoRoot, encoding: "utf8", env }
  );

  return result.status === 0 ? result.stdout.trim() : null;
}

function smokePathForVoice(voice, voiceCount) {
  if (voiceCount === 1) return join(sonelleDir, "piper-smoke.wav");
  return join(sonelleDir, `piper-smoke-${voice}.wav`);
}

function run(command, args, label, env) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit"
  });

  if (result.error != null) {
    console.error(`Failed while ${label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Failed while ${label}.`);
    process.exit(result.status ?? 1);
  }
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await setupPiperVoice();
}
