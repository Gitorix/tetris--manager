import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const forbiddenFiles = /(^|\/)(\.env(?:\..+)?|credentials\.json|service-account[^/]*\.json)$/i;
const secretPatterns = [
  ["AWS access key", /AKIA[0-9A-Z]{16}/g],
  ["Google API key", /AIza[0-9A-Za-z_-]{20,}/g],
  ["GitHub token", /(?:gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,})/g],
  ["OpenAI-style key", /sk-[A-Za-z0-9_-]{20,}/g],
  ["Slack token", /xox[baprs]-[0-9A-Za-z-]{10,}/g],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];

const files = execFileSync("git", ["ls-files", "-z", "-c", "-o", "--exclude-standard"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const findings = [];

for (const file of files) {
  if (forbiddenFiles.test(file)) {
    findings.push(`${file}: forbidden secret-bearing filename`);
    continue;
  }

  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");

  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push(`${file}:${line}: possible ${label}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets detected (values intentionally hidden):");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(`Secret check passed (${files.length} tracked files scanned).`);
