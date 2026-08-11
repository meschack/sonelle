import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const requiredBooks = [
  {
    id: "small-reading-flow",
    fileName: "industrial-society-and-its-future.epub",
    sha256: "8cd009f23bd394666f79d25f61596ece4cf2e75dc1a0e1be32e26a7eb4c2387d"
  },
  {
    id: "large-reader-stress",
    fileName: "the-selfish-gene.epub",
    sha256: "810c350d5c9a74bcf97e31c0b62fd4ee2542f0859523a52c3a67f4a693b67af4"
  },
  {
    id: "structural-stress",
    fileName: "basic-economics-thomas-sowell.epub",
    sha256: "34370f18abc1a1b027b180e92a7f8c36db32e82025aae265139019cb99fc11a3"
  }
];

export const requiredBookFlows = [
  "import",
  "read",
  "navigate",
  "search",
  "bookmark",
  "listen",
  "interrupt-and-return",
  "reopen-after-restart"
];

export const requiredGates = [
  "cold-launch",
  "warm-launch",
  "import",
  "book-open",
  "chapter-switch",
  "reader-scroll",
  "reader-input",
  "search",
  "voice-pack-verification",
  "cold-model-load",
  "warm-narration-preparation",
  "first-narration-readiness",
  "prepared-narration-handoff",
  "working-memory",
  "thermal-stability",
  "battery-use",
  "background-playback",
  "lock-screen-playback",
  "audio-interruption",
  "headset-and-bluetooth",
  "process-recovery",
  "low-storage-and-pack-removal",
  "offline-restart",
  "reading-data-reliability"
];

const numericGates = new Set([
  "cold-launch",
  "warm-launch",
  "import",
  "book-open",
  "chapter-switch",
  "reader-scroll",
  "reader-input",
  "search",
  "voice-pack-verification",
  "cold-model-load",
  "warm-narration-preparation",
  "first-narration-readiness",
  "prepared-narration-handoff",
  "working-memory",
  "thermal-stability",
  "battery-use"
]);

const deviceContracts = {
  midrange: { manufacturer: "Google", model: "Pixel 8a", apiLevel: "36" },
  "lower-cost": { manufacturer: "Samsung", model: "SM-A166B", apiLevel: "34" }
};

const statuses = new Set(["pending", "pass", "fail"]);
const issuePattern = /^https:\/\/github\.com\/meschack\/sonelle\/issues\/\d+$/u;

function pendingResult() {
  return { status: "pending", evidence: [], measurement: "", followUpIssue: "" };
}

export function createDeviceTemplate(role) {
  if (!deviceContracts[role]) throw new Error(`Unknown device role: ${role}`);
  return {
    schemaVersion: 1,
    deviceRole: role,
    capturedAt: "",
    tester: "",
    build: {
      version: "",
      commitRevision: "",
      buildType: "internal-release",
      abi: "arm64-v8a",
      artifactSha256: "",
      narrationCatalogSha256: ""
    },
    device: {
      ...deviceContracts[role],
      serialSuffix: "",
      buildFingerprint: "",
      webViewVersion: ""
    },
    evidenceRoot: "",
    books: Object.fromEntries(
      requiredBooks.map((book) => [
        book.id,
        {
          fileName: book.fileName,
          sha256: book.sha256,
          flows: Object.fromEntries(requiredBookFlows.map((flow) => [flow, pendingResult()]))
        }
      ])
    ),
    gates: Object.fromEntries(requiredGates.map((gate) => [gate, pendingResult()])),
    notes: ""
  };
}

function validateResult(result, path, errors, { measurementRequired = false } = {}) {
  if (!result || !statuses.has(result.status)) {
    errors.push(`${path} must have status pending, pass, or fail`);
    return;
  }
  if (result.status === "pass" || result.status === "fail") {
    if (
      !Array.isArray(result.evidence) ||
      !result.evidence.some((item) => typeof item === "string" && item.trim())
    ) {
      errors.push(`${path} ${result.status}ed without raw evidence`);
    }
    if (measurementRequired && !result.measurement?.trim()) {
      errors.push(`${path} ${result.status}ed without a measurement`);
    }
  }
  if (result.status === "fail" && !issuePattern.test(result.followUpIssue ?? "")) {
    errors.push(`${path} failed without a focused Sonelle follow-up issue`);
  }
}

export function validateDeviceReport(report, expectedRole) {
  const errors = [];
  const contract = deviceContracts[expectedRole];
  if (report?.schemaVersion !== 1) errors.push("unsupported schemaVersion");
  if (report?.deviceRole !== expectedRole) errors.push(`expected deviceRole ${expectedRole}`);
  for (const field of ["capturedAt", "tester", "evidenceRoot"]) {
    if (!report?.[field]?.trim()) errors.push(`${field} is required`);
  }
  for (const field of ["version", "commitRevision", "artifactSha256", "narrationCatalogSha256"]) {
    if (!report?.build?.[field]?.trim()) errors.push(`build.${field} is required`);
  }
  if (report?.build?.buildType !== "internal-release") {
    errors.push("build.buildType must be internal-release");
  }
  if (report?.build?.abi !== "arm64-v8a") errors.push("build.abi must be arm64-v8a");
  if (!/^[0-9a-f]{40}$/u.test(report?.build?.commitRevision ?? "")) {
    errors.push("build.commitRevision must be a full commit SHA");
  }
  for (const field of ["artifactSha256", "narrationCatalogSha256"]) {
    if (!/^[0-9a-f]{64}$/u.test(report?.build?.[field] ?? "")) {
      errors.push(`build.${field} must be a SHA-256 digest`);
    }
  }
  for (const [field, expected] of Object.entries(contract)) {
    if (report?.device?.[field] !== expected) {
      errors.push(`device.${field} must be ${expected}`);
    }
  }
  for (const field of ["serialSuffix", "buildFingerprint", "webViewVersion"]) {
    if (!report?.device?.[field]?.trim()) errors.push(`device.${field} is required`);
  }

  for (const book of requiredBooks) {
    const actual = report?.books?.[book.id];
    if (actual?.fileName !== book.fileName || actual?.sha256 !== book.sha256) {
      errors.push(`books.${book.id} does not match the pinned fixture`);
    }
    for (const flow of requiredBookFlows) {
      validateResult(actual?.flows?.[flow], `books.${book.id}.flows.${flow}`, errors);
    }
  }
  for (const gate of requiredGates) {
    validateResult(report?.gates?.[gate], `gates.${gate}`, errors, {
      measurementRequired: numericGates.has(gate)
    });
  }
  return errors;
}

function allResults(report) {
  return [
    ...requiredBooks.flatMap((book) =>
      requiredBookFlows.map((flow) => report?.books?.[book.id]?.flows?.[flow])
    ),
    ...requiredGates.map((gate) => report?.gates?.[gate])
  ];
}

export function assessAndroidProof(midrange, lowerCost) {
  const validationErrors = [
    ...validateDeviceReport(midrange, "midrange").map((error) => `midrange: ${error}`),
    ...validateDeviceReport(lowerCost, "lower-cost").map((error) => `lower-cost: ${error}`)
  ];
  const buildFields = [
    "version",
    "commitRevision",
    "buildType",
    "abi",
    "artifactSha256",
    "narrationCatalogSha256"
  ];
  for (const field of buildFields) {
    if (midrange?.build?.[field] !== lowerCost?.build?.[field]) {
      validationErrors.push(`devices used different build.${field}`);
    }
  }
  const results = [...allResults(midrange), ...allResults(lowerCost)].filter(Boolean);
  const failures = results.filter((result) => result.status === "fail");
  const pending = results.filter((result) => result.status !== "pass" && result.status !== "fail");
  return {
    eligible: validationErrors.length === 0 && failures.length === 0 && pending.length === 0,
    validationErrors,
    failureIssues: [...new Set(failures.map((result) => result.followUpIssue).filter(Boolean))],
    failureCount: failures.length,
    pendingCount: pending.length
  };
}

export function renderAndroidProofReport(midrange, lowerCost, assessment) {
  const status = (result) => result?.status ?? "missing";
  const evidence = (result) => result?.evidence?.join(", ") || "—";
  const measurement = (result) => result?.measurement || "—";
  const gateRows = requiredGates
    .map(
      (gate) =>
        `| ${gate} | ${status(midrange?.gates?.[gate])} | ${measurement(midrange?.gates?.[gate])} | ${status(lowerCost?.gates?.[gate])} | ${measurement(lowerCost?.gates?.[gate])} |`
    )
    .join("\n");
  const bookRows = requiredBooks
    .flatMap((book) =>
      requiredBookFlows.map(
        (flow) =>
          `| ${book.id} | ${flow} | ${status(midrange?.books?.[book.id]?.flows?.[flow])} | ${evidence(midrange?.books?.[book.id]?.flows?.[flow])} | ${status(lowerCost?.books?.[book.id]?.flows?.[flow])} | ${evidence(lowerCost?.books?.[book.id]?.flows?.[flow])} |`
      )
    )
    .join("\n");
  const errors = assessment.validationErrors.map((error) => `- ${error}`).join("\n") || "- None";
  const issues = assessment.failureIssues.map((issue) => `- ${issue}`).join("\n") || "- None";
  return `# Android core-flow architecture evidence

Verdict: **${assessment.eligible ? "eligible for the Tauri continuation decision" : "not yet eligible for the Tauri continuation decision"}**

- Build version: ${midrange?.build?.version || "missing"}
- Commit: \`${midrange?.build?.commitRevision || "missing"}\`
- Artifact SHA-256: \`${midrange?.build?.artifactSha256 || "missing"}\`
- Midrange evidence: \`${midrange?.evidenceRoot || "missing"}\`
- Lower-cost evidence: \`${lowerCost?.evidenceRoot || "missing"}\`
- Failed checks: ${assessment.failureCount}
- Pending checks: ${assessment.pendingCount}

## Validation errors

${errors}

## Performance and reliability gates

| Gate | Pixel 8a | Measurement | Galaxy A16 5G | Measurement |
| --- | --- | --- | --- | --- |
${gateRows}

## Representative EPUB core flows

| Book | Flow | Pixel 8a | Evidence | Galaxy A16 5G | Evidence |
| --- | --- | --- | --- | --- | --- |
${bookRows}

## Focused follow-up issues

${issues}

This report only establishes whether the evidence is complete enough for the architecture decision.
It does not make the Tauri-versus-native decision by itself, and it never lets one device excuse the
other one's failure.
`;
}

function parseArguments(args) {
  if (args[0] === "--init" && args[1] && args.length === 2) return { init: args[1] };
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!["--midrange", "--lower-cost", "--output"].includes(name) || !value) {
      throw new Error(
        "Usage: pnpm report:android-core -- --init <directory> OR --midrange <json> --lower-cost <json> --output <markdown>"
      );
    }
    options[name.slice(2).replace("-", "")] = value;
  }
  if (!options.midrange || !options.lowercost || !options.output) {
    throw new Error(
      "Usage: pnpm report:android-core -- --init <directory> OR --midrange <json> --lower-cost <json> --output <markdown>"
    );
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.init) {
    const directory = resolve(options.init);
    mkdirSync(directory, { recursive: true });
    const pixelPath = join(directory, "pixel-8a.json");
    const galaxyPath = join(directory, "galaxy-a16-5g.json");
    if (existsSync(pixelPath) || existsSync(galaxyPath)) {
      throw new Error(
        `Refusing to overwrite existing Android core-flow manifests in ${directory}.`
      );
    }
    writeFileSync(pixelPath, `${JSON.stringify(createDeviceTemplate("midrange"), null, 2)}\n`);
    writeFileSync(galaxyPath, `${JSON.stringify(createDeviceTemplate("lower-cost"), null, 2)}\n`);
    console.log(`Android core-flow templates written to ${directory}`);
    return;
  }
  const midrange = JSON.parse(readFileSync(resolve(options.midrange), "utf8"));
  const lowerCost = JSON.parse(readFileSync(resolve(options.lowercost), "utf8"));
  const assessment = assessAndroidProof(midrange, lowerCost);
  writeFileSync(resolve(options.output), renderAndroidProofReport(midrange, lowerCost, assessment));
  console.log(`Android architecture evidence report written to ${resolve(options.output)}`);
  if (!assessment.eligible) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
