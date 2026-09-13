#!/usr/bin/env node
/**
 * Apple privacy-manifest audit of a built `.app` bundle.
 *
 * Reads every `PrivacyInfo.xcprivacy` in the bundle (the app's own, and every SDK resource bundle and framework),
 * scans every Mach-O binary for the symbols behind Apple's "required reason" API categories, and reports which
 * categories each binary uses against which are declared. Exit 1 when a used category is declared nowhere Apple
 * would look — the app manifest covers the main executable and any framework without a manifest of its own;
 * a framework's own manifest covers that framework.
 *
 * Why symbols: Apple's upload check (ITMS-91053) is static — it looks for the API in the binary, not for a call
 * in the JS. A category the binary references but nobody declares is rejected whether or not the app ever runs
 * that code. So this audit asks the same question of the same artifact, before the upload does.
 *
 * Usage:
 *   node tools/release/audit-privacy-manifest.mjs <path/to/PawCue.app> [--app-manifest <PrivacyInfo.xcprivacy>]
 *
 * `--app-manifest` substitutes a manifest for the app's own — for checking a prebuild-generated manifest against
 * an artifact built before it, i.e. "would the next build pass?".
 *
 * Requires macOS (`nm`, `plutil`). Read-only; the bundle is never modified.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Apple's required-reason API categories and the symbols that reveal their use.
 * https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api
 */
export const REQUIRED_REASON_APIS = {
  NSPrivacyAccessedAPICategoryFileTimestamp: [
    /^_NSFileCreationDate$/,
    /^_NSFileModificationDate$/,
    /^_NSURLContentModificationDateKey$/,
    /^_NSURLCreationDateKey$/,
    /^_(stat|fstat|lstat|fstatat|getattrlist|getattrlistbulk|fgetattrlist|getattrlistat)\$?$/,
    /contentModificationDateKey/,
    /creationDateKey/,
  ],
  NSPrivacyAccessedAPICategorySystemBootTime: [
    /^_mach_absolute_time$/,
    /systemUptime/,
  ],
  NSPrivacyAccessedAPICategoryDiskSpace: [
    /volumeAvailableCapacity/,
    /volumeTotalCapacity/,
    /^_NSFileSystemFreeSize$/,
    /^_NSFileSystemSize$/,
    /^_(statfs|statvfs|fstatfs|fstatvfs)$/,
  ],
  NSPrivacyAccessedAPICategoryActiveKeyboards: [/activeInputModes/],
  NSPrivacyAccessedAPICategoryUserDefaults: [/^_OBJC_CLASS_\$_NSUserDefaults$/],
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function isMachO(file) {
  try {
    const fd = readFileSync(file, { flag: "r" });
    const magic = fd.readUInt32BE(0);
    // FAT (0xCAFEBABE), MH_MAGIC_64 (0xFEEDFACF, stored LE), MH_MAGIC (0xFEEDFACE).
    return (
      magic === 0xcafebabe ||
      fd.readUInt32LE(0) === 0xfeedfacf ||
      fd.readUInt32LE(0) === 0xfeedface
    );
  } catch {
    return false;
  }
}

function readManifest(path) {
  const json = execFileSync("plutil", ["-convert", "json", "-o", "-", path], {
    encoding: "utf8",
  });
  return JSON.parse(json);
}

function undefinedSymbols(binary) {
  const out = execFileSync("nm", ["-u", binary], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function categoriesUsedBy(symbols) {
  const used = new Set();
  for (const [category, patterns] of Object.entries(REQUIRED_REASON_APIS)) {
    if (symbols.some((s) => patterns.some((p) => p.test(s))))
      used.add(category);
  }
  return used;
}

export function declaredCategories(manifest) {
  return new Set(
    (manifest?.NSPrivacyAccessedAPITypes ?? []).map(
      (t) => t.NSPrivacyAccessedAPIType,
    ),
  );
}

/** The manifest that covers a binary: the framework's own if it has one, else the app's. */
function manifestFor(binary, appRoot, manifests) {
  const frameworkMatch = binary.match(/^(.*\.framework)\//);
  if (frameworkMatch) {
    const own = manifests.find((m) =>
      m.path.startsWith(frameworkMatch[1] + "/"),
    );
    if (own) return { source: own.path, manifest: own.manifest };
  }
  const app = manifests.find((m) => m.path === "PrivacyInfo.xcprivacy");
  return app
    ? { source: "PrivacyInfo.xcprivacy (app)", manifest: app.manifest }
    : { source: "(none)", manifest: null };
}

export function audit(appRoot, { appManifestOverride } = {}) {
  const files = walk(appRoot);
  const manifests = files
    .filter((f) => f.endsWith("PrivacyInfo.xcprivacy"))
    .map((f) => ({ path: relative(appRoot, f), manifest: readManifest(f) }));

  if (appManifestOverride) {
    const idx = manifests.findIndex((m) => m.path === "PrivacyInfo.xcprivacy");
    const entry = {
      path: "PrivacyInfo.xcprivacy",
      manifest: readManifest(appManifestOverride),
    };
    if (idx >= 0) manifests[idx] = entry;
    else manifests.push(entry);
  }

  const binaries = files.filter((f) => {
    const rel = relative(appRoot, f);
    if (rel.includes("/_CodeSignature/") || rel.startsWith("_CodeSignature/"))
      return false;
    return isMachO(f);
  });

  const findings = [];
  const declaredAnywhere = new Set();
  for (const m of manifests) {
    for (const c of declaredCategories(m.manifest)) declaredAnywhere.add(c);
  }

  for (const binary of binaries) {
    const rel = relative(appRoot, binary);
    const used = categoriesUsedBy(undefinedSymbols(binary));
    const covering = manifestFor(rel, appRoot, manifests);
    const declared = declaredCategories(covering.manifest);
    const missing = [...used].filter((c) => !declared.has(c));
    findings.push({
      binary: rel,
      used: [...used],
      coveredBy: covering.source,
      missing,
    });
  }

  const tracking = manifests.filter(
    (m) => m.manifest?.NSPrivacyTracking === true,
  );
  const trackingDomains = manifests.flatMap((m) =>
    (m.manifest?.NSPrivacyTrackingDomains ?? []).map((d) => `${m.path}: ${d}`),
  );
  const collected = manifests.flatMap((m) =>
    (m.manifest?.NSPrivacyCollectedDataTypes ?? []).map((t) => ({
      manifest: m.path,
      type: t.NSPrivacyCollectedDataType,
      linked: t.NSPrivacyCollectedDataTypeLinked,
      tracking: t.NSPrivacyCollectedDataTypeTracking,
      purposes: t.NSPrivacyCollectedDataTypePurposes,
    })),
  );

  return {
    manifests: manifests.map((m) => m.path),
    findings,
    tracking: tracking.map((m) => m.path),
    trackingDomains,
    collected,
    declaredAnywhere: [...declaredAnywhere],
  };
}

function main() {
  const args = process.argv.slice(2);
  const appRoot = args[0];
  if (!appRoot || !existsSync(appRoot)) {
    console.error(
      "usage: audit-privacy-manifest.mjs <path/to/App.app> [--app-manifest <PrivacyInfo.xcprivacy>]",
    );
    process.exit(2);
  }
  const overrideIdx = args.indexOf("--app-manifest");
  const appManifestOverride =
    overrideIdx >= 0 ? args[overrideIdx + 1] : undefined;

  const result = audit(appRoot, { appManifestOverride });

  console.log(`Privacy manifests found (${result.manifests.length}):`);
  for (const m of result.manifests) console.log(`  ${m}`);
  if (appManifestOverride)
    console.log(`  (app manifest substituted from ${appManifestOverride})`);

  console.log("\nRequired-reason API use per binary:");
  let failed = false;
  for (const f of result.findings) {
    const status = f.missing.length === 0 ? "ok " : "MISSING";
    if (f.missing.length > 0) failed = true;
    console.log(
      `  [${status}] ${f.binary}\n           uses: ${f.used.length ? f.used.map((c) => c.replace("NSPrivacyAccessedAPICategory", "")).join(", ") : "—"}\n           covered by: ${f.coveredBy}${f.missing.length ? `\n           undeclared: ${f.missing.map((c) => c.replace("NSPrivacyAccessedAPICategory", "")).join(", ")}` : ""}`,
    );
  }

  console.log(
    `\nNSPrivacyTracking=true in: ${result.tracking.length ? result.tracking.join(", ") : "none"}`,
  );
  console.log(
    `Tracking domains: ${result.trackingDomains.length ? result.trackingDomains.join(", ") : "none"}`,
  );
  if (result.tracking.length || result.trackingDomains.length) failed = true;

  console.log("\nCollected data types declared:");
  for (const c of result.collected) {
    console.log(
      `  ${c.type.replace("NSPrivacyCollectedDataType", "")} — linked=${c.linked} tracking=${c.tracking} purposes=${(c.purposes ?? []).map((p) => p.replace("NSPrivacyCollectedDataTypePurpose", "")).join("/")}  (${c.manifest})`,
    );
  }

  console.log(failed ? "\nRESULT: FAIL" : "\nRESULT: PASS");
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("audit-privacy-manifest.mjs")) {
  main();
}
