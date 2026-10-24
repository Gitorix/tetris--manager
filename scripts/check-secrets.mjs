import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Values are never included in diagnostics, including for history and CI logs.
const git = (...args) => execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
const args = process.argv.slice(2);
const history = args.includes("--history");
const staged = args.includes("--staged");
const dist = args.includes("--dist");
const forbiddenFiles = /(^|\/)(\.env(?:\..+)?|\.npmrc|\.netrc|credentials\.json|service-account[^/]*\.json|id_(?:rsa|ed25519|ecdsa)|[^/]+\.(?:pem|key|p12|pfx))$/i;
const secretPatterns = [
  ["AWS access key", /(?:AKIA|ASIA)[0-9A-Z]{16}/g],
  ["Google API key", /AIza[0-9A-Za-z_-]{20,}/g],
  ["GitHub token", /(?:gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,})/g],
  ["OpenAI-style key", /sk-[A-Za-z0-9_-]{20,}/g],
  ["Slack token", /xox[baprs]-[0-9A-Za-z-]{10,}/g],
  ["Stripe secret", /(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/g],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
  ["Credential assignment", /\b(?:api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\s*[=:]\s*["'][A-Za-z0-9_+\/.=-]{16,}["']/gi],
];
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const allowedEmail = (email) => email === "noreply@github.com" || /@(?:users\.noreply\.github\.com|noreply\.github\.com|example\.(?:com|org|net))$/i.test(email);
const findings = new Set();
let scanned = 0;
const check = (file, buffer, location = file) => {
  scanned += 1;
  if (forbiddenFiles.test(file) && !/(^|\/)\.env\.example$/i.test(file)) {
    findings.add(`${location}: forbidden secret-bearing filename`);
  }
  if (buffer.includes(0)) return;
  const text = buffer.toString("utf8");
  for (const [label, pattern] of secretPatterns) {
    for (const match of text.matchAll(pattern)) {
      findings.add(`${location}:${text.slice(0, match.index).split("\n").length}: possible ${label}`);
    }
  }
  for (const match of text.matchAll(emailPattern)) {
    if (!allowedEmail(match[0])) findings.add(`${location}:${text.slice(0, match.index).split("\n").length}: personal email address`);
  }
};

if (dist) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Build artifact contains a symlink");
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) check(file, readFileSync(file));
    }
  };
  walk("dist");
} else if (history) {
  // Commit metadata is public too, even when no file contains an email.
  const commits = git("log", "--all", "--format=%H%x09%ae%x09%ce").toString("utf8").trim().split("\n");
  for (const row of commits) {
    const [hash, ...emails] = row.split("\t");
    if (emails.some((email) => !/@users\.noreply\.github\.com$/i.test(email) && email !== "noreply@github.com")) {
      findings.add(`${hash.slice(0, 12)}: personal email in commit metadata; use GitHub noreply`);
    }
  }
  const rows = git("rev-list", "--objects", "--all").toString("utf8").trim().split("\n");
  for (const row of rows) {
    const split = row.indexOf(" ");
    if (split < 0) continue;
    const hash = row.slice(0, split);
    const file = row.slice(split + 1);
    if (git("cat-file", "-t", hash).toString().trim() !== "blob") continue;
    check(file, git("cat-file", "blob", hash), `${hash.slice(0, 12)}:${file}`);
  }
} else {
  const fileArgs = staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    : ["ls-files", "-z", "-c", "-o", "--exclude-standard"];
  const files = new Set(git(...fileArgs).toString("utf8").split("\0").filter(Boolean));
  for (const file of files) {
    if (staged) check(file, git("show", `:${file}`));
    else {
      let info;
      try { info = lstatSync(file); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
      if (info.isSymbolicLink()) { findings.add(`${file}: symlink requires security review`); continue; }
      if (info.isFile()) check(file, readFileSync(file));
    }
  }
}

if (args.includes("--identity")) {
  for (const kind of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
    const ident = git("var", kind).toString("utf8");
    const email = ident.match(/<([^>]+)>/)?.[1] ?? "";
    if (!/@users\.noreply\.github\.com$/i.test(email)) findings.add(`${kind}: use your GitHub noreply address`);
  }
}

if (findings.size > 0) {
  console.error("Potential secrets or private information detected (values hidden):");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else console.log(`Security scan passed (${scanned} ${history ? "historical blobs" : dist ? "build artifacts" : staged ? "staged files" : "working files"} scanned).`);
