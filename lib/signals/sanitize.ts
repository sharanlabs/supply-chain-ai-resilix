// Shared trust-boundary helpers for the signal layer. EVERY external source (GDELT
// articles, NWS alerts) crosses these before its text / urls / ids reach a
// PublicSignal -- so untrusted content can't carry control chars, unbounded length,
// or non-http(s) link schemes downstream into agent prompts (Law 11). One copy, used
// by both fetchers, so a new source can't quietly skip the boundary.

export const MAX_SUMMARY_LEN = 500;
export const MAX_FIELD_LEN = 120;

// Strip control chars (C0/DEL/C1) to a space (a numeric codepoint scan, not a
// control-char regex), collapse whitespace, trim, cap length. Non-strings -> "".
export function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

// True when the string carries any C0/DEL/C1 control character -- the same codepoint
// class sanitizeText strips. Exported as a PREDICATE so schema-level validation (e.g.
// SupplierSchema's display fields, S-02) can REJECT fail-loud at the trust boundary
// instead of silently repairing (lessons P2.3); one codepoint definition, two postures.
export function containsControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

// Only http/https urls are safe to render as a sourceUrl link (no javascript:/data:).
export function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
