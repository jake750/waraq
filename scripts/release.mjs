#!/usr/bin/env node
// Releases in one step: bumps the version in every file that carries it, commits on top of the current
// HEAD (which must contain origin/main) and pushes it straight to main. .github/workflows/release.yml then
// sees the new version on main, builds Windows and macOS and creates the vX.Y.Z tag. Works from a worktree.
//
//   node scripts/release.mjs [patch|minor|major|X.Y.Z] [--dry-run]
//
// --dry-run only rewrites the files in the working tree (no commit or push).
// Each file is edited in place with a targeted replace, so its line endings stay as they are.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bump = args.find((a) => !a.startsWith("--")) ?? "patch";

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opts })?.trim() ?? "";
const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

const current = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version;
const next = nextVersion(current, bump);

// [file, pattern matching the old version in context]. Each pattern must match exactly once.
const esc = current.replaceAll(".", "\\.");
const edits = [
  ["src-tauri/tauri.conf.json", new RegExp(`("version":\\s*")${esc}(")`)],
  ["package.json", new RegExp(`("version":\\s*")${esc}(")`)],
  // The root "version" and the one under packages[""].
  ["package-lock.json", new RegExp(`("name":\\s*"waraq",\\s*"version":\\s*")${esc}(")`, "g"), 2],
  ["src-tauri/Cargo.toml", new RegExp(`(\\[package\\][^\\[]*?\\nversion\\s*=\\s*")${esc}(")`)],
  ["src-tauri/Cargo.lock", new RegExp(`(name = "waraq"\\r?\\nversion = ")${esc}(")`)],
];

if (!dryRun) {
  if (run("git", ["status", "--porcelain"])) fail("working tree is not clean");
  run("git", ["fetch", "-q", "origin", "main"]);
  try {
    run("git", ["merge-base", "--is-ancestor", "origin/main", "HEAD"]);
  } catch {
    fail("HEAD does not contain origin/main: pull or rebase first");
  }
  if (run("git", ["ls-remote", "--tags", "origin", `refs/tags/v${next}`])) fail(`tag v${next} already exists`);
}

for (const [file, re, expected = 1] of edits) {
  const path = join(root, file);
  const text = readFileSync(path, "utf8");
  const count = [...text.matchAll(new RegExp(re.source, "g"))].length;
  if (count !== expected) fail(`${file}: expected ${expected} version match(es), found ${count}`);
  writeFileSync(path, text.replace(re, `$1${next}$2`));
}
console.log(`release: ${current} -> ${next}`);
if (dryRun) process.exit(0);

const files = edits.map(([f]) => f);
run("git", ["add", ...files]);
run("git", ["commit", "-q", "-m", `chore(release): v${next}

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`]);
run("git", ["push", "-q", "origin", "HEAD:main"], { stdio: "inherit" });
console.log(`release: pushed v${next} to main; the release workflow builds it and creates the tag`);

function nextVersion(version, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  fail(`unknown bump "${kind}" (patch, minor, major or X.Y.Z)`);
}
