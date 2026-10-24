import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const scanner = resolve("scripts/check-secrets.mjs");
const fakeKey = ["sk", "testfixture".repeat(4)].join("-");
const privateEmail = ["fixture", "invalid.test"].join("@");
function fixture(run) {
  const cwd = mkdtempSync(join(tmpdir(), "tetris-security-test-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe" });
  const scan = (...args) => spawnSync(process.execPath, [scanner, ...args], { cwd, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.name", "Security test");
    git("config", "user.email", "fixture@users.noreply.github.com");
    run({ cwd, git, scan });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
test("safe source, GitHub noreply and example documentation pass", () => fixture(({ cwd, scan }) => {
  writeFileSync(join(cwd, "safe.txt"), ["fixture@users.noreply.github.com", "fixture@example.com", "noreply@github.com"].join("\n"));
  assert.equal(scan().status, 0);
}));
test("untracked key and private email fail without echoing values", () => fixture(({ cwd, scan }) => {
  writeFileSync(join(cwd, "unsafe.txt"), fakeKey + "\n" + privateEmail);
  const result = scan();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /OpenAI-style key/);
  assert.match(result.stderr, /personal email/);
  assert.ok(!result.stderr.includes(fakeKey) && !result.stderr.includes(privateEmail));
}));
test("staged content is inspected even when working copy is clean", () => fixture(({ cwd, git, scan }) => {
  writeFileSync(join(cwd, "staged.txt"), fakeKey);
  git("add", "staged.txt");
  writeFileSync(join(cwd, "staged.txt"), "safe");
  assert.equal(scan("--staged").status, 1);
  assert.equal(scan().status, 0);
}));
test("deleted credentials in old commits are detected", () => fixture(({ cwd, git, scan }) => {
  writeFileSync(join(cwd, "old.txt"), fakeKey);
  git("add", "."); git("commit", "-qm", "fixture");
  git("rm", "old.txt"); git("commit", "-qm", "remove fixture");
  assert.equal(scan().status, 0);
  assert.equal(scan("--history").status, 1);
}));
test("private commit identity is rejected", () => fixture(({ git, scan }) => {
  git("config", "user.email", privateEmail);
  const result = scan("--identity");
  assert.equal(result.status, 1);
  assert.ok(!result.stderr.includes(privateEmail));
}));
test("credential-bearing filenames and published artifact keys fail", () => fixture(({ cwd, scan }) => {
  writeFileSync(join(cwd, ".env.production"), "placeholder");
  assert.equal(scan().status, 1);
  rmSync(join(cwd, ".env.production"));
  execFileSync(process.execPath, ["-e", "require('fs').mkdirSync('dist')"], { cwd });
  writeFileSync(join(cwd, "dist", "bundle.js"), fakeKey);
  assert.equal(scan("--dist").status, 1);
}));

test("private email in old commit metadata fails even with safe source", () => fixture(({ cwd, git, scan }) => {
  git("config", "user.email", privateEmail);
  writeFileSync(join(cwd, "safe.txt"), "safe source");
  git("add", "."); git("commit", "-qm", "fixture");
  git("config", "user.email", "fixture@users.noreply.github.com");
  const result = scan("--history");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /commit metadata/);
  assert.ok(!result.stderr.includes(privateEmail));
}));
