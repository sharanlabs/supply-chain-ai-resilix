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
