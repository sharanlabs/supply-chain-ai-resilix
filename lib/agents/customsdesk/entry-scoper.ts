// Entry-population scoper (plan §5 D1): given a set of CATAIR entry summaries,
// select the lines a disclosure covers and aggregate the figures the penalty math
// needs. Parsing reads the SAME Rev-108 positions the validators check -- one source
// of truth for the wire layout (catair.ts), pure code, no I/O.

import type { SyntheticEntrySummary } from "./catair";

export interface ScopeCriteria {
  htsPrefix?: string; // digits, e.g. "8541"
  countryOfOrigin?: string; // as declared on the 40-record
  portOfEntry?: string;
}

export interface EntryPopulationSummary {
  entryCount: number;
  lineCount: number;
  totalEnteredValueCents: number;
  totalDeclaredDutyCents: number;
  byCountryOfOrigin: Record<string, number>; // line counts
  matchedEntryNumbers: string[];
}

interface ParsedLine {
  countryOfOrigin: string;
  htsNumber: string;
  dutyCents: number;
  valueUsd: number;
}

// Strict fixed-width numeric parse (2026-07-16 re-review, C-04): Number("") and
// Number("   ") are 0, not NaN — so a truncated/blank slice slipped the NaN guard and
// became an authoritative zero-valued figure. A numeric field must be a non-empty
// digits-only token (space padding tolerated) inside a record long enough to contain it.
function parseNumericField(record: string, start: number, end: number, label: string): number {
  if (record.length < end) {
    throw new Error(`50-record too short for ${label} (len ${record.length} < ${end})`);
  }
  const raw = record.slice(start, end).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error(`50-record ${label} is not a digits-only field: "${record.slice(start, end)}"`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`50-record ${label} exceeds safe-integer range: "${raw}"`);
  }
  return parsed;
}

function parseLine(lineItem: string, tariff: string): ParsedLine {
  return {
    countryOfOrigin: lineItem.slice(8, 10),
    htsNumber: tariff.slice(2, 12),
    dutyCents: parseNumericField(tariff, 13, 23, "dutyCents"), // 10N, implied 2dp -> already cents
    valueUsd: parseNumericField(tariff, 24, 34, "valueUsd"), // 10N whole USD
  };
}

export function scopeEntryPopulation(
  entries: SyntheticEntrySummary[],
  criteria: ScopeCriteria
): EntryPopulationSummary {
  const summary: EntryPopulationSummary = {
    entryCount: 0,
    lineCount: 0,
    totalEnteredValueCents: 0,
    totalDeclaredDutyCents: 0,
    byCountryOfOrigin: {},
    matchedEntryNumbers: [],
  };

  for (const entry of entries) {
    const port = entry.header.slice(17, 21);
    if (criteria.portOfEntry && port !== criteria.portOfEntry) continue;
    let entryMatched = false;
    for (const line of entry.lines) {
      // parseLine fails loud on blank/short/non-digit numeric fields (C-04) — no NaN
      // check needed here; Number("") === 0 was the hole the strict parse closes.
      const parsed = parseLine(line.lineItem, line.tariff);
      if (criteria.htsPrefix && !parsed.htsNumber.startsWith(criteria.htsPrefix)) continue;
      if (criteria.countryOfOrigin && parsed.countryOfOrigin !== criteria.countryOfOrigin) continue;
      entryMatched = true;
      summary.lineCount += 1;
      summary.totalEnteredValueCents += parsed.valueUsd * 100;
      summary.totalDeclaredDutyCents += parsed.dutyCents;
      summary.byCountryOfOrigin[parsed.countryOfOrigin] =
        (summary.byCountryOfOrigin[parsed.countryOfOrigin] ?? 0) + 1;
    }
    if (entryMatched) {
      summary.entryCount += 1;
      summary.matchedEntryNumbers.push(entry.header.slice(8, 16));
    }
  }
  return summary;
}
