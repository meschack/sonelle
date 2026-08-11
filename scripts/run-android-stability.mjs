import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConnectedDevices, selectPhysicalDevice } from "./profile-android-device.mjs";

const applicationId = "app.sonelle.reader";
const activity = `${applicationId}/.MainActivity`;
const minute = 60_000;
const deviceContracts = {
  midrange: { model: "Pixel 8a", apiLevel: "36", peakPssMiB: 550, batteryPercent: 12 },
  "lower-cost": { model: "SM-A166B", apiLevel: "34", peakPssMiB: 420, batteryPercent: 15 }
};

export const sessionSchedule = [
  [0, "Read and scroll the large book; confirm the visible sentence and position."],
  [10, "Start continuous narration and follow sentence-by-sentence highlighting."],
  [20, "Pause and resume three times; confirm each action advances at most once."],
  [25, "Background Sonelle while narration continues."],
  [30, "Lock the screen and leave narration running."],
  [35, "Unlock and return; confirm playback, highlight, and position agree."],
  [40, "Disconnect and reconnect the active headset; confirm safe pause and one resume."],
  [45, "Trigger an audio-focus interruption, then return to Sonelle."],
  [50, "Lock the screen for five minutes of background listening."],
  [55, "Return to the reader, scroll, pause, resume, and verify the saved position."],
  [60, "Stop playback and record the final sentence, position, and any anomaly."]
];

export function parseTotalPssKiB(output) {
  const summary = /TOTAL PSS:\s*([\d,]+)/u.exec(output)?.[1];
  const table = /^\s*TOTAL\s+([\d,]+)\s+/mu.exec(output)?.[1];
  const value = summary ?? table;
  if (value == null) throw new Error("Android meminfo did not report TOTAL PSS.");
  return Number(value.replaceAll(",", ""));
}

export function parseBatterySnapshot(output) {
  const read = (name) => new RegExp(`^\\s*${name}:\\s*(\\d+)$`, "mu").exec(output)?.[1];
  const level = read("level");
  const plugged = read("plugged");
  if (level == null || plugged == null) {
    throw new Error("Android battery service did not report level and plugged state.");
  }
  return { level: Number(level), plugged: Number(plugged) };
}

export function parseThermalStatus(output) {
  const overall = /Thermal Status:\s*(\d+)/iu.exec(output)?.[1];
  const sensorStatuses = [...output.matchAll(/mStatus=(\d+)/gu)].map((match) => Number(match[1]));
  if (overall == null && sensorStatuses.length === 0) {
    throw new Error("Android thermal service did not report a status.");
  }
  return Math.max(overall == null ? 0 : Number(overall), ...sensorStatuses);
}

export function verifyBuildMetadata(metadata, artifact) {
  const errors = [];
  if (metadata.schemaVersion !== 1) errors.push("unsupported metadata schema");
  if (metadata.applicationId !== applicationId) errors.push("wrong application ID");
  if (metadata.buildType !== "internal-release") errors.push("not an internal release build");
  if (metadata.abi !== "arm64-v8a") errors.push("not an ARM64 build");
  if (metadata.artifact?.fileName !== basename(artifact.path))
    errors.push("artifact filename mismatch");
  if (metadata.artifact?.sizeBytes !== artifact.sizeBytes) errors.push("artifact size mismatch");
  if (metadata.artifact?.sha256 !== artifact.sha256) errors.push("artifact SHA-256 mismatch");
  if (!/^[0-9a-f]{40}$/u.test(metadata.commitRevision ?? ""))
    errors.push("invalid commit revision");
  if (errors.length > 0) throw new Error(`Internal build metadata rejected: ${errors.join(", ")}.`);
  return metadata;
}

export function evaluateStability({ samples, deviceRole, durationMinutes }) {
  if (samples.length === 0) throw new Error("At least one stability sample is required.");
  const contract = deviceContracts[deviceRole];
  if (!contract) throw new Error(`Unknown device role: ${deviceRole}`);
  const peakPssMiB = Math.max(...samples.map((sample) => sample.totalPssKiB)) / 1024;
  const finalWindow = samples.filter((sample) => sample.elapsedMinutes >= durationMinutes - 15);
  const finalPss = finalWindow.map((sample) => sample.totalPssKiB);
  const finalMinimum = Math.min(...finalPss);
  const finalRangePercent =
    finalMinimum === 0
      ? Number.POSITIVE_INFINITY
      : ((Math.max(...finalPss) - finalMinimum) / finalMinimum) * 100;
  const batteryUsed = samples[0].batteryLevel - samples.at(-1).batteryLevel;
  const maximumThermalStatus = Math.max(...samples.map((sample) => sample.thermalStatus));
  const processIds = new Set(samples.map((sample) => sample.processId));
  const processStayedAlive = !processIds.has(null) && processIds.size === 1;
  const stayedUnplugged = samples.every((sample) => sample.plugged === 0);
  const conformingDuration = durationMinutes === 60;

  return {
    conformingDuration,
    peakPssMiB,
    peakPssPassed: peakPssMiB <= contract.peakPssMiB,
    finalRangePercent,
    finalRangePassed: conformingDuration && finalWindow.length >= 15 && finalRangePercent <= 5,
    batteryUsed,
    batteryPassed: batteryUsed >= 0 && batteryUsed <= contract.batteryPercent,
    maximumThermalStatus,
    thermalPassed: maximumThermalStatus < 3,
    processStayedAlive,
    stayedUnplugged,
    automatedPassed:
      conformingDuration &&
      peakPssMiB <= contract.peakPssMiB &&
      finalWindow.length >= 15 &&
      finalRangePercent <= 5 &&
      batteryUsed >= 0 &&
      batteryUsed <= contract.batteryPercent &&
      maximumThermalStatus < 3 &&
      processStayedAlive &&
      stayedUnplugged
  };
}

export function renderReport({ metadata, device, samples, evaluation, outputDirectory }) {
  const result = (passed) => (passed ? "pass" : "fail");
  return `# Android 60-minute reading and listening stability report

Status: **${evaluation.automatedPassed ? "automated gates passed; manual correctness review required" : "failed or incomplete"}**

- Build: Sonelle ${metadata.version}, commit \`${metadata.commitRevision}\`, \`${metadata.buildType}\`, \`${metadata.abi}\`
- Artifact: \`${metadata.artifact.fileName}\`, SHA-256 \`${metadata.artifact.sha256}\`
- Device: ${device.manufacturer} ${device.model}, Android ${device.androidVersion} / API ${device.apiLevel}, serial suffix ${device.serialSuffix}
- Device role: ${device.role}
- Duration: ${samples.at(-1).elapsedMinutes.toFixed(1)} minutes (${evaluation.conformingDuration ? "contract run" : "non-contract smoke run"})
- Raw evidence: \`${outputDirectory}\`

## Automated gates

| Gate | Result | Measurement |
| --- | --- | --- |
| Peak total PSS | ${result(evaluation.peakPssPassed)} | ${evaluation.peakPssMiB.toFixed(1)} MiB |
| Final 15-minute memory range <= 5% | ${result(evaluation.finalRangePassed)} | ${evaluation.finalRangePercent.toFixed(2)}% |
| Battery budget | ${result(evaluation.batteryPassed)} | ${evaluation.batteryUsed}% used |
| No severe thermal state | ${result(evaluation.thermalPassed)} | maximum status ${evaluation.maximumThermalStatus} |
| One process remained alive | ${result(evaluation.processStayedAlive)} | ${samples.length} samples |
| Device remained unplugged | ${result(evaluation.stayedUnplugged)} | every battery sample |

## Manual correctness review

These checks are intentionally not auto-passed. Compare the recording notes with \`events.log\`,
\`samples.json\`, \`logcat.txt\`, and \`exit-info-after.txt\`.

- [ ] The representative large book was used for the whole session.
- [ ] Every visible highlight matched the audible sentence.
- [ ] No sentence skipped, repeated, or advanced twice.
- [ ] Scrolling and playback controls remained responsive.
- [ ] Pause and resume behaved exactly once at every checkpoint.
- [ ] Backgrounding and lock-screen playback followed the documented policy.
- [ ] Headset disconnect paused before audio could spill through the phone speaker.
- [ ] Returning to the reader restored the correct book, sentence, and position.
- [ ] No crash, ANR, process restart, or unexplained audio stop appears in raw evidence.

## Verdict

Record **pass** only after all automated gates and every manual correctness check pass. Attach this
report and the complete raw evidence directory to issue #130. Any missing measurement is a failure,
not a creative-writing opportunity.
`;
}

function run(program, args, options = {}) {
  return execFileSync(program, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });
}

function adb(serial, ...args) {
  return run("adb", ["-s", serial, ...args]);
}

function property(serial, name) {
  return adb(serial, "shell", "getprop", name).trim();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseArguments(args) {
  const options = { durationMinutes: 60, sampleSeconds: 60, startDelaySeconds: 60 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--confirm-ready", "--install-update"].includes(argument))
      options[argument.slice(2)] = true;
    else if (
      [
        "--artifact",
        "--metadata",
        "--serial",
        "--device-role",
        "--duration-minutes",
        "--sample-seconds",
        "--start-delay-seconds",
        "--output"
      ].includes(argument)
    ) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      const key = argument.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
      options[key] = ["durationMinutes", "sampleSeconds", "startDelaySeconds"].includes(key)
        ? Number(value)
        : value;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (
    !options.artifact ||
    !options.metadata ||
    !options.serial ||
    !options.deviceRole ||
    !options.confirmReady ||
    !options.installUpdate
  ) {
    throw new Error(
      "Usage: pnpm stability:android -- --artifact <signed.apk> --metadata <build-metadata.json> --serial <serial> --device-role <midrange|lower-cost> --install-update --confirm-ready"
    );
  }
  if (!deviceContracts[options.deviceRole])
    throw new Error("--device-role must be midrange or lower-cost.");
  if (
    !(options.durationMinutes > 0) ||
    !(options.sampleSeconds > 0) ||
    options.startDelaySeconds < 0
  ) {
    throw new Error("Duration and sample values must be positive; start delay cannot be negative.");
  }
  return options;
}

function capture(serial, name, ...args) {
  try {
    return adb(serial, "shell", ...args);
  } catch (error) {
    throw new Error(
      `${name} capture failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const artifactPath = resolve(options.artifact);
  const metadataPath = resolve(options.metadata);
  if (!existsSync(artifactPath)) throw new Error(`APK not found: ${artifactPath}`);
  if (!existsSync(metadataPath)) throw new Error(`Build metadata not found: ${metadataPath}`);
  const metadata = verifyBuildMetadata(JSON.parse(readFileSync(metadataPath, "utf8")), {
    path: artifactPath,
    sizeBytes: statSync(artifactPath).size,
    sha256: sha256(artifactPath)
  });
  run("apksigner", ["verify", "--verbose", artifactPath]);

  const deviceSelection = selectPhysicalDevice(
    parseConnectedDevices(run("adb", ["devices", "-l"])),
    options.serial
  );
  if (property(deviceSelection.serial, "ro.kernel.qemu") === "1") {
    throw new Error(`Refusing ${deviceSelection.serial}; Android reports that it is an emulator.`);
  }
  const contract = deviceContracts[options.deviceRole];
  const model = property(deviceSelection.serial, "ro.product.model");
  const apiLevel = property(deviceSelection.serial, "ro.build.version.sdk");
  if (model !== contract.model || apiLevel !== contract.apiLevel) {
    throw new Error(
      `${options.deviceRole} baseline requires ${contract.model} on API ${contract.apiLevel}; found ${model} on API ${apiLevel}.`
    );
  }

  const capturedAt = new Date().toISOString();
  const outputDirectory = resolve(
    options.output ??
      `artifacts/android-stability/${capturedAt.slice(0, 10)}-${model.replace(/[^a-z0-9]+/giu, "-")}-${metadata.commitRevision.slice(0, 12)}`
  );
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(`${outputDirectory}/build-metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);
  writeFileSync(
    `${outputDirectory}/schedule.md`,
    `${sessionSchedule.map(([at, action]) => `- Minute ${at}: ${action}`).join("\n")}\n`
  );

  console.log(
    `Updating Sonelle from the verified signed artifact on ${model}. Existing reader data is preserved.`
  );
  if (!adb(deviceSelection.serial, "shell", "pm", "path", applicationId).trim()) {
    throw new Error(
      "Sonelle is not already installed with the prepared book and voice. Complete the prerequisite device scenarios first."
    );
  }
  adb(deviceSelection.serial, "install", "-r", artifactPath);
  const packageState = capture(
    deviceSelection.serial,
    "package",
    "dumpsys",
    "package",
    applicationId
  );
  if (/DEBUGGABLE/iu.test(packageState))
    throw new Error("Installed package is debuggable; release evidence rejected.");
  if (!packageState.includes(`versionName=${metadata.version}`)) {
    throw new Error(`Installed package does not report expected version ${metadata.version}.`);
  }

  const device = {
    role: options.deviceRole,
    manufacturer: property(deviceSelection.serial, "ro.product.manufacturer"),
    model,
    apiLevel,
    androidVersion: property(deviceSelection.serial, "ro.build.version.release"),
    securityPatch: property(deviceSelection.serial, "ro.build.version.security_patch"),
    fingerprint: property(deviceSelection.serial, "ro.build.fingerprint"),
    serialSuffix: deviceSelection.serial.slice(-6)
  };
  writeFileSync(`${outputDirectory}/device.json`, `${JSON.stringify(device, null, 2)}\n`);
  writeFileSync(
    `${outputDirectory}/exit-info-before.txt`,
    capture(
      deviceSelection.serial,
      "initial exit info",
      "dumpsys",
      "activity",
      "exit-info",
      applicationId
    )
  );
  writeFileSync(
    `${outputDirectory}/storage-before.txt`,
    capture(deviceSelection.serial, "initial storage", "df", "-k", "/data")
  );
  adb(deviceSelection.serial, "shell", "am", "start", "-W", "-n", activity);

  if (options.startDelaySeconds > 0) {
    console.log(
      `Open the large book with its verified voice ready. Capture starts in ${options.startDelaySeconds} seconds.`
    );
    await delay(options.startDelaySeconds * 1000);
  }

  const logPath = `${outputDirectory}/logcat.txt`;
  const logDescriptor = openSync(logPath, "w");
  const logcat = spawn(
    "adb",
    [
      "-s",
      deviceSelection.serial,
      "logcat",
      "-v",
      "threadtime",
      "AndroidRuntime:E",
      "ActivityManager:W",
      "WindowManager:E",
      "chromium:E",
      "*:S"
    ],
    { stdio: ["ignore", logDescriptor, logDescriptor] }
  );
  const startedAt = Date.now();
  const endsAt = startedAt + options.durationMinutes * minute;
  const samples = [];
  let scheduleIndex = 0;
  try {
    while (true) {
      const elapsedMinutes = (Date.now() - startedAt) / minute;
      while (
        scheduleIndex < sessionSchedule.length &&
        elapsedMinutes >= sessionSchedule[scheduleIndex][0]
      ) {
        const [at, action] = sessionSchedule[scheduleIndex];
        const event = `${new Date().toISOString()} | minute ${at} | ${action}`;
        console.log(event);
        writeFileSync(`${outputDirectory}/events.log`, `${event}\n`, { flag: "a" });
        scheduleIndex += 1;
      }

      const memory = capture(deviceSelection.serial, "memory", "dumpsys", "meminfo", applicationId);
      const battery = capture(deviceSelection.serial, "battery", "dumpsys", "battery");
      const thermal = capture(deviceSelection.serial, "thermal", "dumpsys", "thermalservice");
      const cpu = capture(deviceSelection.serial, "CPU", "dumpsys", "cpuinfo");
      const cpuFrequency = capture(
        deviceSelection.serial,
        "CPU frequency",
        "cat",
        "/sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq"
      );
      let processId = null;
      try {
        processId =
          Number(adb(deviceSelection.serial, "shell", "pidof", "-s", applicationId).trim()) || null;
      } catch {
        processId = null;
      }
      const batterySnapshot = parseBatterySnapshot(battery);
      samples.push({
        capturedAt: new Date().toISOString(),
        elapsedMinutes,
        totalPssKiB: parseTotalPssKiB(memory),
        batteryLevel: batterySnapshot.level,
        plugged: batterySnapshot.plugged,
        thermalStatus: parseThermalStatus(thermal),
        processId
      });
      writeFileSync(`${outputDirectory}/samples.json`, `${JSON.stringify(samples, null, 2)}\n`);
      writeFileSync(
        `${outputDirectory}/memory-${String(samples.length).padStart(3, "0")}.txt`,
        memory
      );
      writeFileSync(
        `${outputDirectory}/thermal-${String(samples.length).padStart(3, "0")}.txt`,
        thermal
      );
      writeFileSync(`${outputDirectory}/cpu-${String(samples.length).padStart(3, "0")}.txt`, cpu);
      writeFileSync(
        `${outputDirectory}/cpu-frequency-${String(samples.length).padStart(3, "0")}.txt`,
        cpuFrequency
      );
      if (Date.now() >= endsAt) break;
      await delay(Math.min(options.sampleSeconds * 1000, Math.max(0, endsAt - Date.now())));
    }
  } finally {
    logcat.kill("SIGINT");
    await Promise.race([
      new Promise((resolveExit) => logcat.once("exit", resolveExit)),
      delay(2_000)
    ]);
    closeSync(logDescriptor);
  }

  writeFileSync(
    `${outputDirectory}/exit-info-after.txt`,
    capture(
      deviceSelection.serial,
      "final exit info",
      "dumpsys",
      "activity",
      "exit-info",
      applicationId
    )
  );
  writeFileSync(
    `${outputDirectory}/battery-stats.txt`,
    capture(
      deviceSelection.serial,
      "battery statistics",
      "dumpsys",
      "batterystats",
      "--charged",
      applicationId
    )
  );
  writeFileSync(
    `${outputDirectory}/cpu-final.txt`,
    capture(deviceSelection.serial, "CPU", "dumpsys", "cpuinfo")
  );
  writeFileSync(
    `${outputDirectory}/storage-after.txt`,
    capture(deviceSelection.serial, "final storage", "df", "-k", "/data")
  );
  const evaluation = evaluateStability({
    samples,
    deviceRole: options.deviceRole,
    durationMinutes: options.durationMinutes
  });
  writeFileSync(
    `${outputDirectory}/automated-result.json`,
    `${JSON.stringify(evaluation, null, 2)}\n`
  );
  writeFileSync(
    `${outputDirectory}/report.md`,
    renderReport({ metadata, device, samples, evaluation, outputDirectory })
  );
  console.log(`Stability evidence written to ${outputDirectory}`);
  if (!evaluation.automatedPassed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
