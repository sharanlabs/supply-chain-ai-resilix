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

import type { SyntheticExhibit } from "./synthetic-entries";

export interface QuarantinedExhibit {
  kind: SyntheticExhibit["kind"];
  declaredOrigin: string;
  consistentWithEntry: boolean;
  bodyLength: number;
  bodyDigest: string; // provenance fingerprint; not reversible to content
  injectionSignals: string[]; // audit flags; NEVER gates the disposition
}

// FNV-1a 32-bit -- tiny, deterministic, dependency-free fingerprint.
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const INJECTION_PATTERNS: Array<{ signal: string; pattern: RegExp }> = [
  { signal: "instruction-override", pattern: /ignore (all )?(prior|previous) instructions/i },
  { signal: "disposition-steering", pattern: /no disclosure is needed|do not refuse|must proceed/i },
  { signal: "figure-steering", pattern: /penalty (exposure|amount)? ?(as|is|=) ?\$?0\b/i },
  { signal: "role-hijack", pattern: /you are (now|a) |system prompt/i },
];

export function quarantineExhibit(exhibit: SyntheticExhibit): QuarantinedExhibit {
  const injectionSignals = INJECTION_PATTERNS.filter((p) => p.pattern.test(exhibit.body)).map(
    (p) => p.signal
  );
  return {
    kind: exhibit.kind,
    declaredOrigin: exhibit.declaredOrigin,
    consistentWithEntry: exhibit.consistentWithEntry,
    bodyLength: exhibit.body.length,
    bodyDigest: fnv1a(exhibit.body),
    injectionSignals,
  };
}

export function quarantineAll(exhibits: SyntheticExhibit[]): QuarantinedExhibit[] {
  return exhibits.map(quarantineExhibit);
}
