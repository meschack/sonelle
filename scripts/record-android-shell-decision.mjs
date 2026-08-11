import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessAndroidProof,
  requiredBookFlows,
  requiredBooks,
  requiredGates
} from "./report-android-core-flow.mjs";

const decisions = new Set(["continue-tauri", "native-reader-fallback"]);
const owners = new Set([
  "webview-reader",
  "import-adapter",
  "storage-adapter",
  "narration-adapter",
  "playback-adapter",
  "lifecycle-adapter"
]);
const remediationStates = new Set(["passed", "exhausted", "pending"]);

function resultRecords(report, deviceRole) {
  return [
    ...requiredBooks.flatMap((book) =>
      requiredBookFlows.map((flow) => ({
        deviceRole,
        path: `books.${book.id}.flows.${flow}`,
        result: report?.books?.[book.id]?.flows?.[flow]
      }))
    ),
    ...requiredGates.map((gate) => ({
      deviceRole,
      path: `gates.${gate}`,
      result: report?.gates?.[gate]
    }))
  ];
}

export function validateArchitectureDecision(midrange, lowerCost, decision) {
  const assessment = assessAndroidProof(midrange, lowerCost);
  const records = [
    ...resultRecords(midrange, "midrange"),
    ...resultRecords(lowerCost, "lower-cost")
  ];
  const failures = records.filter(({ result }) => result?.status === "fail");
  const errors = [...assessment.validationErrors];

  if (decision?.schemaVersion !== 1) errors.push("unsupported decision schemaVersion");
  if (assessment.pendingCount > 0) {
    errors.push(`physical-device evidence still has ${assessment.pendingCount} pending results`);
  }
  if (!decisions.has(decision?.decision))
    errors.push("decision must continue Tauri or authorize the native reader fallback");
  if (
    !/^https:\/\/github\.com\/meschack\/sonelle\/issues\/131(?:#|$)/u.test(
      decision?.evidenceReport ?? ""
    )
  ) {
    errors.push("evidenceReport must link the published issue #131 report");
  }
  if (decision?.rustDomainBoundary !== "shared-book-domain") {
    errors.push("rustDomainBoundary must preserve the shared book domain");
  }
  if (!Array.isArray(decision?.acceptedLimitations)) {
    errors.push("acceptedLimitations must be an array");
  } else if (
    decision.acceptedLimitations.some((item) => typeof item !== "string" || !item.trim())
  ) {
    errors.push("acceptedLimitations entries must be non-empty strings");
  }
  if (!Array.isArray(decision?.requiredRemediation)) {
    errors.push("requiredRemediation must be an array");
  } else if (
    decision.requiredRemediation.some((item) => typeof item !== "string" || !item.trim())
  ) {
    errors.push("requiredRemediation entries must be non-empty strings");
  }
  if (!["ready", "deferred"].includes(decision?.iosPlanning)) {
    errors.push("iosPlanning must be ready or deferred");
  }

  const attributions = Array.isArray(decision?.failureAttributions)
    ? decision.failureAttributions
    : [];
  const failureKeys = new Set(failures.map(({ deviceRole, path }) => `${deviceRole}:${path}`));
  const attributionKeys = new Set();
  for (const attribution of attributions) {
    const key = `${attribution?.deviceRole}:${attribution?.resultPath}`;
    if (!failureKeys.has(key))
      errors.push(`failure attribution ${key} does not match the device report`);
    if (attributionKeys.has(key)) errors.push(`failure attribution ${key} is duplicated`);
    attributionKeys.add(key);
    if (!owners.has(attribution?.owner))
      errors.push(`failure attribution ${key} has an unknown owner`);
    if (!remediationStates.has(attribution?.boundedRemediation)) {
      errors.push(`failure attribution ${key} has an invalid boundedRemediation`);
    }
    if (!attribution?.finding?.trim()) errors.push(`failure attribution ${key} needs a finding`);
  }
  for (const key of failureKeys) {
    if (!attributionKeys.has(key)) errors.push(`failed result ${key} has no boundary attribution`);
  }

  if (decision?.decision === "continue-tauri") {
    if (failures.length > 0)
      errors.push("Tauri continuation requires a fully passing two-device report");
    if (decision?.iosPlanning !== "ready") {
      errors.push("a passing Tauri decision must mark Android evidence ready for iOS planning");
    }
  }

  if (decision?.decision === "native-reader-fallback") {
    const webviewFailures = attributions.filter(({ owner }) => owner === "webview-reader");
    if (failures.length === 0)
      errors.push("native fallback cannot be authorized by a passing report");
    if (webviewFailures.length === 0) {
      errors.push("native fallback requires a measured WebView reader failure");
    }
    if (webviewFailures.some(({ boundedRemediation }) => boundedRemediation !== "exhausted")) {
      errors.push("every WebView reader failure must exhaust bounded remediation before fallback");
    }
    if (!decision?.requiredRemediation?.some((item) => item?.trim())) {
      errors.push("native fallback must list required remediation");
    }
    if (decision?.iosPlanning !== "deferred") {
      errors.push("native fallback must defer iOS planning until the Android core flow passes");
    }
  }

  return { errors, assessment, failures, attributions };
}

export function renderArchitectureDecision(midrange, lowerCost, decision) {
  const validation = validateArchitectureDecision(midrange, lowerCost, decision);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join("\n"));
  }

  const records = [
    ...resultRecords(midrange, "midrange"),
    ...resultRecords(lowerCost, "lower-cost")
  ];
  const passedGates = records.filter(
    ({ path, result }) => path.startsWith("gates.") && result.status === "pass"
  ).length;
  const failedGates = records.filter(
    ({ path, result }) => path.startsWith("gates.") && result.status === "fail"
  ).length;
  const decisionText =
    decision.decision === "continue-tauri"
      ? "Sonelle continues with the Tauri mobile shell and shared Solid reader on Android."
      : "Sonelle authorizes a native Kotlin Android reader fallback while preserving the shared Rust book domain and engine-independent behavior.";
  const failureRows = validation.failures.length
    ? validation.failures
        .map(({ deviceRole, path, result }) => {
          const attribution = validation.attributions.find(
            (item) => item.deviceRole === deviceRole && item.resultPath === path
          );
          return `- ${deviceRole} \`${path}\`: ${attribution.owner}; ${attribution.finding}; bounded remediation ${attribution.boundedRemediation}; ${result.followUpIssue}`;
        })
        .join("\n")
    : "- None. Every required result passed on both devices.";
  const limitations = decision.acceptedLimitations.length
    ? decision.acceptedLimitations.map((item) => `- ${item}`).join("\n")
    : "- None accepted.";
  const remediation = decision.requiredRemediation.length
    ? decision.requiredRemediation.map((item) => `- ${item}`).join("\n")
    : "- None required by this decision.";
  const iosText =
    decision.iosPlanning === "ready"
      ? "The Android evidence is sufficient to begin iOS planning. iOS still requires its own adapters and physical-device evidence."
      : "Android evidence is not sufficient to begin iOS planning; iOS remains deferred until the Android core flow passes after the authorized remediation.";

  return `# 0041: Android Shell Continuation

## Status

Accepted.

## Context

This decision uses the complete two-device report at [Android core-flow architecture evidence](${decision.evidenceReport}). Both devices used commit \`${midrange.build.commitRevision}\` and artifact \`${midrange.build.artifactSha256}\`.

Across the two devices, ${passedGates} performance and reliability gate results passed and ${failedGates} failed. Import, storage, narration, playback, and lifecycle failures were treated as adapter failures unless the attached evidence measured the shared WebView reader as the blocker.

## Decision

${decisionText}

The EPUB model, normalized text, reading position, bookmarks, search, and engine-independent narration behavior remain in the shared Rust book domain regardless of the Android UI choice.

## Failed gates and boundary attribution

${failureRows}

## Accepted limitations

${limitations}

## Required remediation

${remediation}

## iOS planning

${iosText}

## Related evidence

- [Android benchmark contract](../qa/android-benchmark-contract.md)
- [Android core-flow evidence procedure](../qa/android-core-flow-report.md)
- [Android-first mobile architecture](0035-android-first-mobile-architecture.md)
`;
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!["--midrange", "--lower-cost", "--decision", "--output"].includes(name) || !value) {
      throw new Error(
        "Usage: pnpm decide:android-shell -- --midrange <json> --lower-cost <json> --decision <json> --output <markdown>"
      );
    }
    options[name.slice(2).replace("-", "")] = value;
  }
  if (!options.midrange || !options.lowercost || !options.decision || !options.output) {
    throw new Error(
      "Usage: pnpm decide:android-shell -- --midrange <json> --lower-cost <json> --decision <json> --output <markdown>"
    );
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const midrange = JSON.parse(readFileSync(resolve(options.midrange), "utf8"));
  const lowerCost = JSON.parse(readFileSync(resolve(options.lowercost), "utf8"));
  const decision = JSON.parse(readFileSync(resolve(options.decision), "utf8"));
  const rendered = renderArchitectureDecision(midrange, lowerCost, decision);
  writeFileSync(resolve(options.output), rendered);
  console.log(`Android shell decision written to ${resolve(options.output)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
