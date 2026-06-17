// Resolve a claim's `sourcePath` against the structured decision packet.
//
// A Dispatcher claim (ClaimSchema) carries `{ value, unit, sourcePath }`. The
// sourcePath addresses the value's origin inside the packet, e.g.
//   "simulation.horizons[0].revenueAtRiskUsd"
//   "exposureResults[2].exposureScore"
// The citation grader walks that path to confirm the cited number actually
// resolves to the stated value (catching a wrong-context number: same value, same
// unit, but pointing at an unrelated field).
//
// The grammar is the one the existing V2 fixture (P2.3 `decision-packet-v2.ts`)
// already uses -- dotted keys plus `[n]` array indices -- so the Dispatcher
// (Phase 7) INHERITS this contract; the eval does not invent a new syntax.
//
// The resolver is TOTAL: any malformed, dangling, or out-of-range path returns
// `{ resolved: false }` rather than throwing, so a grader built on it reports an
// unsourced/mis-sourced claim as a graded failure instead of crashing the run
// (same never-throw discipline the signal layer holds for untrusted input).

export type PathResolution =
  | { resolved: true; value: unknown }
  | { resolved: false; value: undefined };

const UNRESOLVED: PathResolution = { resolved: false, value: undefined };

// One dotted segment: an identifier key, optionally followed by one or more `[n]`
// indices (e.g. `horizons[0]`). Anchored (^...$) so a stray character -- spaces,
// an empty segment from `a..b`, `foo[bar]`, `foo[-1]` -- fails to match and the
// whole path is rejected, never silently half-walked.
const SEGMENT = /^([A-Za-z_$][A-Za-z0-9_$]*)((?:\[\d+\])*)$/;
const INDEX = /\[(\d+)\]/g;

// Prototype keys are syntactically valid identifiers but must never be traversed
// -- the packet is plain JSON data and we only ever read own, enumerable fields.
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveSourcePath(root: unknown, path: string): PathResolution {
  if (typeof path !== "string" || path.length === 0) return UNRESOLVED;

  let current: unknown = root;
  for (const segment of path.split(".")) {
    const match = SEGMENT.exec(segment);
    if (!match) return UNRESOLVED;

    const key = match[1];
    if (FORBIDDEN_KEYS.has(key)) return UNRESOLVED;
    if (
      !isPlainObject(current) ||
      !Object.prototype.hasOwnProperty.call(current, key)
    ) {
      return UNRESOLVED;
    }
    current = current[key];

    // Apply the segment's `[n]` indices left to right against real arrays only.
    const indices = match[2];
    if (indices) {
      INDEX.lastIndex = 0;
      let idx: RegExpExecArray | null;
      while ((idx = INDEX.exec(indices)) !== null) {
        const i = Number(idx[1]);
        if (!Array.isArray(current) || i >= current.length) return UNRESOLVED;
        current = current[i];
      }
    }
  }

  return { resolved: true, value: current };
}
