import pino from "pino";
import { describe, expect, it } from "vitest";

import { REDACT_PATHS, logger, resolveLogLevel } from "@/lib/server/logger";

describe("server logger (observability)", () => {
  it("resolveLogLevel: the test runner is silent (keeps the suite output clean)", () => {
    expect(resolveLogLevel({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe("silent");
  });

  it("resolveLogLevel: honors LOG_LEVEL outside test", () => {
    expect(
      resolveLogLevel({ NODE_ENV: "production", LOG_LEVEL: "debug" } as NodeJS.ProcessEnv)
    ).toBe("debug");
  });

  it("resolveLogLevel: defaults to info when unset or blank", () => {
    expect(resolveLogLevel({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("info");
    expect(
      resolveLogLevel({ NODE_ENV: "production", LOG_LEVEL: "   " } as NodeJS.ProcessEnv)
    ).toBe("info");
  });

  it("the module logger is wired through resolveLogLevel and never throws", () => {
    // The instance was created with resolveLogLevel(process.env) at import; assert that, rather
    // than a hardcoded level, so it holds whatever NODE_ENV the runner sets.
    expect(logger.level).toBe(resolveLogLevel(process.env));
    expect(() => logger.info({ packetId: "X" }, "noop")).not.toThrow();
    expect(() => logger.warn({ source: "GDELT DOC 2.0" }, "noop")).not.toThrow();
  });

  it("redacts the app's real secret shapes even if a caller logs a whole headers/config object", () => {
    // Build a probe from the REAL REDACT_PATHS, capturing output -- proves redaction WORKS,
    // not merely that paths are listed (the Codex C1+C2 finding: the callback header + DATABASE_URL
    // were missing).
    const chunks: string[] = [];
    const probe = pino(
      { level: "info", redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } },
      { write: (s: string) => chunks.push(s) } as unknown as pino.DestinationStream
    );
    probe.info(
      {
        headers: {
          authorization: "Bearer LEAK_BEARER",
          "x-resilix-callback-secret": "LEAK_CALLBACK"
        },
        DATABASE_URL: "postgres://user:LEAK_PW@host:5432/db",
        apiKey: "LEAK_API",
        GEMINI_API_KEY: "LEAK_GEMINI",
        GROQ_API_KEY: "LEAK_GROQ"
      },
      "redaction probe"
    );
    const out = chunks.join("");
    for (const secret of [
      "LEAK_BEARER",
      "LEAK_CALLBACK",
      "LEAK_PW",
      "LEAK_API",
      "LEAK_GEMINI",
      "LEAK_GROQ"
    ]) {
      expect(out, `leaked ${secret}`).not.toContain(secret);
    }
    expect(out).toContain("[REDACTED]");
  });

  it("redacts secret shapes carried on a logged Error (the `{ err }` serializer path)", () => {
    // The run-exception route logs `logger.error({ err: error }, ...)`. pino auto-
    // enables its `err` serializer for the `err` key, which copies an Error's
    // enumerable own-properties -- so a thrown error carrying request headers / a
    // config snapshot would otherwise surface secrets in the log. Build the probe
    // from the REAL REDACT_PATHS and prove they bite under `err.*`.
    const chunks: string[] = [];
    const probe = pino(
      { level: "error", redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } },
      { write: (s: string) => chunks.push(s) } as unknown as pino.DestinationStream
    );
    const err = Object.assign(new Error("pipeline blew up"), {
      headers: {
        authorization: "Bearer LEAK_BEARER",
        "x-resilix-callback-secret": "LEAK_CALLBACK"
      },
      APPROVAL_TOKEN: "LEAK_APPROVAL",
      N8N_CALLBACK_SECRET: "LEAK_N8N",
      GEMINI_API_KEY: "LEAK_GEMINI",
      GROQ_API_KEY: "LEAK_GROQ",
      DATABASE_URL: "postgres://user:LEAK_PW@host:5432/db",
      token: "LEAK_TOKEN",
      apiKey: "LEAK_API"
    });
    probe.error({ err, route: "run-exception" }, "run-exception pipeline failed");
    const out = chunks.join("");
    for (const secret of [
      "LEAK_BEARER",
      "LEAK_CALLBACK",
      "LEAK_APPROVAL",
      "LEAK_N8N",
      "LEAK_GEMINI",
      "LEAK_GROQ",
      "LEAK_PW",
      "LEAK_TOKEN",
      "LEAK_API"
    ]) {
      expect(out, `leaked ${secret} via err.*`).not.toContain(secret);
    }
    expect(out).toContain("[REDACTED]");
    // The non-secret error message still logs (redaction is surgical, not nuking).
    expect(out).toContain("pipeline blew up");
  });
});
