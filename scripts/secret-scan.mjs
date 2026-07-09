import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const root = process.cwd();
const execFileAsync = promisify(execFile);

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results"
]);

const ignoredFiles = new Set(["package-lock.json"]);

const binaryExtensions = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".pdf",
  ".png",
  ".webp",
  ".zip"
]);

// Known non-secret literals in the shape the generic rule below matches. Each
// entry is a RECORDED exception scoped to the FILE BASENAME(S) it may appear in
// (Codex F5 round-2 residual: a value-only allowlist would let the same fake
// token be reused in an UNEXPECTED file and skipped silently). The same literal
// in any other file trips CI. (Security read L1, 2026-07-09: provider-prefix
// patterns alone are structurally blind to a generic `X_TOKEN = "<value>"` paste.)
const allowlistedAssignments = new Map([
  // test-only MCP bearer for the e2e webServer; read-only fixture access on localhost.
  ["e2e-mcp-test-token-0123456789abcdef", ["playwright.config.ts", "mcp.spec.ts"]],
  // fake approval bearer the auth tests present.
  ["test-approval-token-0001", ["action-execution-route.test.ts", "security-fail-closed.test.ts"]],
  // an ambient key a test sets ONLY to assert it is never called.
  ["fake-ambient-key-should-not-be-called", ["actionops-investigator.test.ts"]],
  // placeholder key for a mocked pipeline.
  ["test-key-not-real", ["actionops-live-pipeline.test.ts"]],
  // fake callback secrets for the fail-closed tests.
  ["callback-secret-for-test", ["n8n-callback.test.ts"]],
  ["a-strong-callback-secret-value", ["security-fail-closed.test.ts"]],
  // obviously-fake Slack bot token (the literal word SECRET, not a real xoxb credential).
  ["xoxb-SECRET-TOKEN", ["slack-transport.test.ts"]],
  // fake MCP token for the prod-misconfig predicate tests.
  ["a-strong-token-1234567890", ["mcp-server.test.ts"]]
]);

function isAllowlisted(value, relativePath) {
  const allowedFiles = allowlistedAssignments.get(value);
  if (!allowedFiles) return false;
  const base = path.basename(relativePath);
  return allowedFiles.includes(base);
}

const patterns = [
  {
    name: "Google API key",
    regex: /AIza[0-9A-Za-z_-]{20,}/g
  },
  {
    name: "OpenAI-style API key",
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g
  },
  {
    name: "Groq API key",
    regex: /\bgsk_[A-Za-z0-9]{20,}\b/g
  },
  {
    name: "GitHub token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g
  },
  {
    name: "GitHub fine-grained token",
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g
  },
  {
    name: "Private key block",
    regex: /-----BEGIN (?:RSA |OPENSSH |EC |PRIVATE )?PRIVATE KEY-----/g
  },
  {
    // Generic credential assignment: a token/secret/key/password field = "<16+ chars>".
    // Catches the class the provider prefixes miss (a real bearer pasted into a
    // config). Codex F5: case-INSENSITIVE + camelCase keys (apiKey/botToken/
    // accessToken/authToken as well as UPPER_SNAKE) so a lowercase paste is not a
    // false negative. Value charset stays conservative ([A-Za-z0-9_-]) ON PURPOSE:
    // broadening to . / + = to catch JWT/base64 shapes false-positives across the
    // codebase (import paths, hashes, URLs) -- the provider-prefix rules already
    // cover the structured-secret shapes, and the lockfile/CI review is the
    // backstop for exotic formats. Allowlisted values above are recorded exceptions.
    name: "Generic credential assignment",
    regex:
      /(?:[A-Za-z0-9]*(?:token|secret|password|api[_-]?key|access[_-]?key|auth[_-]?key))\s*[:=]\s*["']([A-Za-z0-9_-]{16,})["']/gi,
    allowlistGroup: 1
  }
];

const findings = [];

for (const relativePath of await listCandidateFiles()) {
  await scanFile(path.join(root, relativePath), relativePath);
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(
      `${finding.file}:${finding.line}: possible ${finding.pattern} committed`
    );
  }
  process.exit(1);
}

console.log("No high-confidence secret patterns found.");

async function listCandidateFiles() {
  try {
    const { stdout } = await execFileAsync("git", [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z"
    ], { cwd: root, maxBuffer: 10 * 1024 * 1024 });

    return stdout
      .split("\0")
      .filter(Boolean)
      .filter((file) => !ignoredFiles.has(path.basename(file)))
      .filter((file) => !binaryExtensions.has(path.extname(file).toLowerCase()));
  } catch {
    return scanDirectory(root);
  }
}

async function scanDirectory(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = path.relative(root, fullPath);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await scanDirectory(fullPath)));
      }
      continue;
    }

    if (!entry.isFile() || ignoredFiles.has(entry.name)) {
      continue;
    }

    if (binaryExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    const fileStat = await stat(fullPath);
    if (fileStat.size > 1_000_000) {
      continue;
    }

    files.push(relativePath);
  }

  return files;
}

async function scanFile(fullPath, relativePath) {
  const content = await readFile(fullPath, "utf8").catch(() => undefined);
  if (content === undefined) {
    return;
  }

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (const match of content.matchAll(pattern.regex)) {
      // A recorded exception (file-scoped, see allowlistedAssignments) is not a finding.
      if (
        pattern.allowlistGroup !== undefined &&
        isAllowlisted(match[pattern.allowlistGroup], relativePath)
      ) {
        continue;
      }
      findings.push({
        file: relativePath,
        line: lineForIndex(content, match.index ?? 0),
        pattern: pattern.name
      });
    }
  }
}

function lineForIndex(content, index) {
  return content.slice(0, index).split("\n").length;
}
