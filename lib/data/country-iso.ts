import { CountryCodeSchema, type CountryCode } from "@/lib/schemas";

// Minimal ISO-3166 alpha-2 name normalization for the common full-name spellings that
// appear in either a human-uploaded supplier CSV or a public-signal feed (GDELT/NWS emit
// "United States" / "Japan", not "US" / "JP"). NOT a full ISO table -- the goal is that a
// FIXABLE value (a lowercase code or a common country name) is normalized rather than
// silently dropped. Anything outside this map plus the alpha-2 regex is treated as
// unknown (null), never guessed. Single source of truth: the supplier-CSV ingest and the
// Verifier's geo-coherence check both normalize through here, so "United States" vs "US"
// can never be read as a geographic disagreement in one path and an agreement in another.
export const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  germany: "DE",
  france: "FR",
  china: "CN",
  japan: "JP",
  "south korea": "KR",
  korea: "KR",
  taiwan: "TW",
  india: "IN",
  mexico: "MX",
  canada: "CA",
  netherlands: "NL",
  vietnam: "VN",
  malaysia: "MY",
  singapore: "SG"
};

// normalizeCountryToIso: a raw country string (an ISO alpha-2 code OR a common full name)
// -> the canonical ISO alpha-2 code, or null when it is neither (blank/whitespace, an
// unknown name, junk). This is the "is this a COMPARABLE country" predicate the Verifier's
// three-state geo check keys off: only a value that resolves to a real ISO code can create
// an AGREES or a CONFLICT; everything else is UNCONFIRMED (cannot confirm or deny), never a
// phantom conflict. That precision is load-bearing -- a source emitting "United States"
// against a threat country "US" must read AGREES, not CONFLICT (Codex [P1]: a raw-string
// compare false-vetoed real US/JP findings).
export function normalizeCountryToIso(raw: string | null | undefined): CountryCode | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // An already-ISO alpha-2 code (case-insensitive) wins directly.
  const direct = CountryCodeSchema.safeParse(trimmed.toUpperCase());
  if (direct.success) return direct.data;
  // Else a known full-name spelling -> its ISO code (re-validated so the map can never
  // emit a non-code).
  const named = COUNTRY_NAME_TO_ISO[trimmed.toLowerCase()];
  if (named) {
    const parsed = CountryCodeSchema.safeParse(named);
    if (parsed.success) return parsed.data;
  }
  return null;
}
