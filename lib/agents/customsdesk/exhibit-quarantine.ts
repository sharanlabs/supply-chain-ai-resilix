// Per-exhibit quarantine (plan §5 D2, Codex plan-gate R1 #1).
//
// THE INVARIANT (the moat, transplanted): an exhibit's BODY is third-party free text
// and is structurally untrusted -- it may carry instruction injections, planted
// figures, or fabricated assurances. Nothing from a body ever flows into packet
// prose, dispositions, or figures. What crosses the boundary is this module's
// STRUCTURED output only: enum-typed fields and code-derived flags. The body itself
// travels onward solely as a length + digest (provenance trail, not content).
//
// Deterministic prototype note: detection flags below are for AUDIT VISIBILITY, not
// for safety -- safety comes from the structural rule (bodies never cross), which
// holds even for payloads the patterns miss.

import { createHash } from "node:crypto";
import type { SyntheticExhibit } from "./synthetic-entries";

export interface QuarantinedExhibit {
  kind: SyntheticExhibit["kind"];
  declaredOrigin: string;
  consistentWithEntry: boolean;
  bodyLength: number;
  bodyDigest: string; // provenance fingerprint; not reversible to content
  injectionSignals: string[]; // audit flags; NEVER gates the disposition
}

// SHA-256 (first 16 hex chars) -- collision-resistant provenance fingerprint (2026-07-16
// re-review, D-11: this digest is cross-referenced in the exported audit appendix, so it
// earns a real hash; the prior FNV-1a 32-bit stays acceptable only for harmless-collision
// fingerprints per lessons.md P2.5, which an audit identifier is not).
function sha256Fingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

const INJECTION_PATTERNS: Array<{ signal: string; pattern: RegExp }> = [
  { signal: "instruction-override", pattern: /ignore (all )?(prior|previous) instructions/i },
  { signal: "disposition-steering", pattern: /no disclosure is needed|do not refuse|must proceed/i },
  { signal: "figure-steering", pattern: /penalty (exposure|amount)? ?(as|is|=) ?\$?0\b/i },
  { signal: "role-hijack", pattern: /you are (now|a) |system prompt/i },
];

// SYNTHETIC-TRUST BOUNDARY (recorded, 2026-07-16 re-review): `consistentWithEntry` and
// `declaredOrigin` are GENERATOR-SET ground truth of the synthetic case world (the generator
// decides whether an exhibit contradicts its entry) -- not verdicts derivable from the body,
// which is opaque by quarantine design. A real evidence layer would replace these copied fields
// with a real structured extractor AT THIS WALL; the wall itself (bodies never cross) is the
// invariant that carries over unchanged.
export function quarantineExhibit(exhibit: SyntheticExhibit): QuarantinedExhibit {
  const injectionSignals = INJECTION_PATTERNS.filter((p) => p.pattern.test(exhibit.body)).map(
    (p) => p.signal
  );
  return {
    kind: exhibit.kind,
    declaredOrigin: exhibit.declaredOrigin,
    consistentWithEntry: exhibit.consistentWithEntry,
    bodyLength: exhibit.body.length,
    bodyDigest: sha256Fingerprint(exhibit.body),
    injectionSignals,
  };
}

export function quarantineAll(exhibits: SyntheticExhibit[]): QuarantinedExhibit[] {
  return exhibits.map(quarantineExhibit);
}
