import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const applicationId = "app.sonelle.reader";
const activity = `${applicationId}/.MainActivity`;

export function parseConnectedDevices(output) {
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/u);
      return { serial, state, details: details.join(" ") };
    });
}

export function selectPhysicalDevice(devices, requestedSerial) {
  const ready = devices.filter((device) => device.state === "device");
  const selected = requestedSerial
    ? ready.find((device) => device.serial === requestedSerial)
    : ready.length === 1
      ? ready[0]
      : undefined;

  if (!selected) {
    const reason = requestedSerial
      ? `ADB device ${requestedSerial} is not connected and ready.`
      : `Expected exactly one ready ADB device; found ${ready.length}. Pass --serial when needed.`;
    throw new Error(reason);
  }
  if (/^emulator-/u.test(selected.serial) || /model:.*sdk.*x86/iu.test(selected.details)) {
    throw new Error(`Refusing emulator ${selected.serial}; issue #86 requires physical hardware.`);
  }
  return selected;
}

export function parseStartTime(output) {
  const value = /^TotalTime:\s*(\d+)$/mu.exec(output)?.[1];
  if (value == null) throw new Error(`Android did not report TotalTime:\n${output}`);
  return Number(value);
}

export function summarizeSamples(samples) {
  if (samples.length === 0) throw new Error("At least one timing sample is required.");
  const ordered = [...samples].sort((left, right) => left - right);
  const percentile = (ratio) => ordered[Math.ceil(ordered.length * ratio) - 1];
  return {
    count: ordered.length,
    min: ordered[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: ordered.at(-1)
  };
}

export function renderWorksheet({ metadata, cold, warm, artifactName }) {
  const line = (label, value = "") => `${label}: ${value}`;
  return `# Android Device QA — Fixture Reader Baseline

${line("Date/time and timezone", metadata.capturedAt)}
${line("Tester")}
${line("Device role", "midrange | lower-cost")}
${line("Manufacturer/model/model code", `${metadata.manufacturer} / ${metadata.model} / ${metadata.device}`)}
${line("Serial suffix", metadata.serialSuffix)}
${line("Chipset and memory")}
${line("Android version/API/security patch/build fingerprint", `${metadata.androidVersion} / API ${metadata.apiLevel} / ${metadata.securityPatch} / ${metadata.fingerprint}`)}
${line("Android System WebView version", metadata.webViewVersion)}
${line("Available storage before/after")}
${line("Battery level/health and charger state")}
${line("Display refresh/brightness/font scale/display scale")}
${line("Network and airplane-mode state")}
${line("Thermal status at start/end")}
${line("Sonelle version/commit/build type/artifact SHA-256", `${metadata.commit} / release-like / ${metadata.artifactSha256}`)}
${line("EPUB filename/SHA-256/chapter count/sentence count", "embedded fixture / n/a / 2 / 8")}
${line("Narration adapter", "not included in this reader-shell baseline")}
${line("Voice-pack ID/revision/quantization/artifact SHA-256", "not installed")}
${line("Voice/style/language/speed/preparation revision", "not configured")}
${line("Raw artifact directory", metadata.outputDirectory)}

## Automated startup samples

| Scenario | Artifact | Samples | Min (ms) | p50 (ms) | p95 (ms) | Max (ms) | Gate | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Cold fixture launch | \`startup-cold.json\` | ${cold.count} | ${cold.min} | ${cold.p50} | ${cold.p95} | ${cold.max} | p95 <= 3,000 ms | ${cold.p95 <= 3000 ? "pass" : "fail"} |
| Warm fixture launch | \`startup-warm.json\` | ${warm.count} | ${warm.min} | ${warm.p50} | ${warm.p95} | ${warm.max} | p95 <= 1,000 ms | ${warm.p95 <= 1000 ? "pass" : "fail"} |

Artifact: \`${artifactName}\`

## Captured resource evidence

- Frame timing: \`frame-timing.txt\`
- Memory: \`memory.txt\`
- CPU: \`cpu.txt\`
- Battery/package power accounting: \`battery.txt\`
- Thermal state: \`thermal.txt\`
- Device and package metadata: \`device-metadata.json\`, \`package.txt\`, \`webview.txt\`

## Manual fixture-reader check

- [ ] Chapter 1 text is readable.
- [ ] Selecting Chapter 2 changes the visible chapter and content.
- [ ] Scroll and controls remain responsive.
- [ ] No crash, ANR, or incorrect persisted position was observed.

## Notes and deviations

Record every deviation from \`docs/qa/android-benchmark-contract.md\` here. This fixture baseline does
not replace the later real-book, narration, background, interruption, or 60-minute stability gates.
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
  const options = { samples: 10 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--fresh-install") options.freshInstall = true;
    else if (["--artifact", "--serial", "--samples", "--output"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      options[argument.slice(2)] = argument === "--samples" ? Number(value) : value;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.artifact || !options.freshInstall) {
    throw new Error(
      "Usage: pnpm profile:android -- --artifact <release-like.apk> --fresh-install [--serial <serial>] [--samples 10] [--output <directory>]"
    );
  }
  if (!Number.isInteger(options.samples) || options.samples < 1) {
    throw new Error("--samples must be a positive integer.");
  }
  return options;
}

function captureText(path, operation) {
  try {
    writeFileSync(path, operation());
  } catch (error) {
    writeFileSync(
      path,
      `Capture failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
}

function measureColdStarts(serial, count) {
  return Array.from({ length: count }, () => {
    adb(serial, "shell", "am", "force-stop", applicationId);
    return parseStartTime(adb(serial, "shell", "am", "start", "-W", "-n", activity));
  });
}

function measureWarmStarts(serial, count) {
  adb(serial, "shell", "am", "start", "-W", "-n", activity);
  return Array.from({ length: count }, () => {
    adb(serial, "shell", "input", "keyevent", "KEYCODE_HOME");
    return parseStartTime(adb(serial, "shell", "am", "start", "-W", "-n", activity));
  });
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const artifact = resolve(options.artifact);
  if (!existsSync(artifact)) throw new Error(`APK not found: ${artifact}`);

  const device = selectPhysicalDevice(
    parseConnectedDevices(run("adb", ["devices", "-l"])),
    options.serial
  );
  if (property(device.serial, "ro.kernel.qemu") === "1") {
    throw new Error(`Refusing ${device.serial}; Android reports that it is an emulator.`);
  }

  const commit = run("git", ["rev-parse", "--short=12", "HEAD"]).trim();
  const capturedAt = new Date().toISOString();
  const model = property(device.serial, "ro.product.model").replace(/[^a-z0-9]+/giu, "-");
  const outputDirectory = resolve(
    options.output ?? `artifacts/android-device/${capturedAt.slice(0, 10)}-${model}-${commit}`
  );
  mkdirSync(outputDirectory, { recursive: true });

  console.log(
    `Fresh-installing ${basename(artifact)} on ${device.serial}; existing Sonelle app data will be removed.`
  );
  try {
    adb(device.serial, "uninstall", applicationId);
  } catch {
    // A missing prior installation is already a clean state.
  }
  adb(device.serial, "install", artifact);

  const metadata = {
    capturedAt,
    commit,
    artifact: basename(artifact),
    artifactSha256: sha256(artifact),
    outputDirectory,
    serialSuffix: device.serial.slice(-6),
    manufacturer: property(device.serial, "ro.product.manufacturer"),
    model: property(device.serial, "ro.product.model"),
    device: property(device.serial, "ro.product.device"),
    androidVersion: property(device.serial, "ro.build.version.release"),
    apiLevel: property(device.serial, "ro.build.version.sdk"),
    securityPatch: property(device.serial, "ro.build.version.security_patch"),
    fingerprint: property(device.serial, "ro.build.fingerprint"),
    webViewVersion:
      adb(device.serial, "shell", "dumpsys", "webviewupdate")
        .split("\n")
        .find((line) => line.includes("Current WebView package"))
        ?.trim() ?? "not reported"
  };
  writeFileSync(
    `${outputDirectory}/device-metadata.json`,
    `${JSON.stringify(metadata, null, 2)}\n`
  );

  const coldSamples = measureColdStarts(device.serial, options.samples);
  const warmSamples = measureWarmStarts(device.serial, options.samples);
  writeFileSync(`${outputDirectory}/startup-cold.json`, `${JSON.stringify(coldSamples)}\n`);
  writeFileSync(`${outputDirectory}/startup-warm.json`, `${JSON.stringify(warmSamples)}\n`);

  captureText(`${outputDirectory}/frame-timing.txt`, () =>
    adb(device.serial, "shell", "dumpsys", "gfxinfo", applicationId, "framestats")
  );
  captureText(`${outputDirectory}/memory.txt`, () =>
    adb(device.serial, "shell", "dumpsys", "meminfo", applicationId)
  );
  captureText(`${outputDirectory}/cpu.txt`, () =>
    adb(device.serial, "shell", "dumpsys", "cpuinfo")
  );
  captureText(`${outputDirectory}/battery.txt`, () =>
    adb(device.serial, "shell", "dumpsys", "batterystats", "--charged", applicationId)
  );
  captureText(`${outputDirectory}/thermal.txt`, () =>
    adb(device.serial, "shell", "dumpsys", "thermalservice")
  );
  captureText(`${outputDirectory}/package.txt`, () =>
    adb(device.serial, "shell", "dumpsys", "package", applicationId)
  );
  captureText(`${outputDirectory}/webview.txt`, () =>
    adb(device.serial, "shell", "dumpsys", "webviewupdate")
  );

  writeFileSync(
    `${outputDirectory}/worksheet.md`,
    renderWorksheet({
      metadata,
      cold: summarizeSamples(coldSamples),
      warm: summarizeSamples(warmSamples),
      artifactName: basename(artifact)
    })
  );
  console.log(`Device evidence written to ${outputDirectory}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
