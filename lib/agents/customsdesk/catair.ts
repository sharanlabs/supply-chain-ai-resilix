// CATAIR Entry Summary (AE) fixed-width record subset -- builders + validators.
//
// PRIMARY SOURCE (never from memory): "ACE CATAIR Entry Summary Create/Update",
// Revision 108, September 9 2025, fetched 2026-07-02 via the `catair` machine door
// (data/customs/corpus-manifest.json). The plan referenced "Rev 106" -- 106 was the
// revision at research time; 108 is the live document, so 108 is what binds here.
//
// SCOPE (a declared subset, not the whole chapter): the four records a minimal
// Add/Replace Entry Summary needs -- 10 (Header Control), 11 (Header Content,
// Importer of Record field), 40 (Line Item Header), 50 (Tariff/Value/Quantity).
// Field positions/classes below cite the Rev-108 layout tables verbatim; anything
// this module does not model is OUT of declared coverage (the generator space-fills
// only where the spec says "space fill if not used").

export const CATAIR_SOURCE = {
  document: "ACE CATAIR Entry Summary Create/Update (AE/AX)",
  revision: 108,
  revisionDate: "2025-09-09",
  fetchedAsOf: "2026-07-02",
  door: "catair",
} as const;

// --- AE Table 1: check-digit computation ------------------------------------------
// Letters map A-I=1-9, J-R=1-9, S-Z=2-9; base = 3-char filer code + 7-digit sequence;
// even positions doubled (+1 if product > 9), ones digits summed with odd positions;
// check digit = (10 - ones(total)) with 10 -> 0.
const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9,
  J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

export function entryNumberCheckDigit(filerCode: string, sequence7: string): number {
  if (!/^[A-Z0-9]{3}$/.test(filerCode)) {
    throw new Error(`filer code must be 3 alphanumerics, got '${filerCode}'`);
  }
  if (!/^\d{7}$/.test(sequence7)) {
    throw new Error(`entry sequence must be 7 digits, got '${sequence7}'`);
  }
  const base = `${filerCode}${sequence7}`
    .split("")
    .map((ch) => (/[A-Z]/.test(ch) ? LETTER_VALUES[ch] : Number(ch)));
  let total = 0;
  base.forEach((digit, idx) => {
    const position = idx + 1;
    if (position % 2 === 0) {
      let product = digit * 2;
      if (product > 9) product += 1; // spec's "+1 adjust", then ones digit below
      total += product % 10;
    } else {
      total += digit;
    }
  });
  return (10 - (total % 10)) % 10;
}

// --- fixed-width helpers ------------------------------------------------------------
function padAN(value: string, width: number, label: string): string {
  if (value.length > width) throw new Error(`${label} exceeds ${width} chars: '${value}'`);
  return value.padEnd(width, " ");
}

function padNum(value: number, width: number, label: string): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`);
  }
  const s = String(value);
  if (s.length > width) throw new Error(`${label} exceeds ${width} digits: ${value}`);
  return s.padStart(width, "0");
}

// --- record shapes (validated inputs; the wire format is the fixed-width line) ------
export interface EntryHeaderControl {
  actionCode: "A" | "R"; // D (delete) is out of declared coverage
  filerCode: string; // 3AN, pos 4-6
  entrySequence: string; // 7 digits; check digit appended per AE Table 1
  portOfEntry: string; // 4AN, pos 18-21
  brokerReference?: string; // 9X, pos 22-30
  entryTypeCode: "01" | "03"; // consumption / AD-CVD (subset of AE Table 2)
  modeOfTransport?: string; // 2AN, pos 36-37
}

export interface EntryHeaderContent {
  importerOfRecord: string; // 12X, pos 3-14
}

export interface LineItemHeader {
  lineItemIdentifier: string; // 3X, pos 5-7
  countryOfOrigin: string; // 2X ISO or '**', pos 9-10
  countryOfExport?: string; // 2AN ISO, pos 11-12
  dateOfExportation?: string; // 6D MMDDYY, pos 13-18
  spiClaimCode?: string; // 2AN, pos 25-26
  chargesAmount?: number; // 10N whole USD, pos 27-36
  foreignPortOfLading?: string; // 5AN, pos 37-41
  grossShippingWeightKg?: number; // 10N, pos 42-51
}

export interface TariffValueQuantity {
  htsNumber: string; // 10AN, pos 3-12 (dots stripped)
  dutyAmountCents: number; // 10N implied 2dp, pos 14-23
  valueOfGoodsUsd: number; // 10N whole USD, pos 25-34
  quantity1Hundredths?: number; // 12N implied 2dp, pos 36-47
  unitOfMeasure1: string; // 3AN, pos 48-50
}

export function buildEntryNumber(filerCode: string, sequence7: string): string {
  return `${sequence7}${entryNumberCheckDigit(filerCode, sequence7)}`;
}

export function build10Record(h: EntryHeaderControl): string {
  const entryNumber = buildEntryNumber(h.filerCode, h.entrySequence);
  return (
    "10" +
    h.actionCode +
    padAN(h.filerCode, 3, "filerCode") +
    "  " + // pos 7-8 filler
    padAN(entryNumber, 8, "entryNumber") +
    " " + // pos 17 filler
    padAN(h.portOfEntry, 4, "portOfEntry") +
    padAN(h.brokerReference ?? "", 9, "brokerReference") +
    "   " + // pos 31-33 filler
    padAN(h.entryTypeCode, 2, "entryTypeCode") +
    padAN(h.modeOfTransport ?? "", 2, "modeOfTransport")
  );
}

export function build11Record(c: EntryHeaderContent): string {
  return "11" + padAN(c.importerOfRecord, 12, "importerOfRecord");
}

export function build40Record(l: LineItemHeader): string {
  return (
    "40" +
    "  " + // pos 3-4 filler
    padAN(l.lineItemIdentifier, 3, "lineItemIdentifier") +
    " " + // pos 8 article-set indicator, space = not part of a set
    padAN(l.countryOfOrigin, 2, "countryOfOrigin") +
    padAN(l.countryOfExport ?? "", 2, "countryOfExport") +
    padAN(l.dateOfExportation ?? "", 6, "dateOfExportation") +
    "      " + // pos 19-24 textile export date, space fill (out of coverage)
    padAN(l.spiClaimCode ?? "", 2, "spiClaimCode") +
    (l.chargesAmount === undefined
      ? "          "
      : padNum(l.chargesAmount, 10, "chargesAmount")) +
    padAN(l.foreignPortOfLading ?? "", 5, "foreignPortOfLading") +
    padNum(l.grossShippingWeightKg ?? 0, 10, "grossShippingWeightKg")
  );
}

export function build50Record(t: TariffValueQuantity): string {
  const hts = t.htsNumber.replace(/\./g, "");
  return (
    "50" +
    padAN(hts, 10, "htsNumber") +
    " " + // pos 13 filler
    padNum(t.dutyAmountCents, 10, "dutyAmountCents") +
    " " + // pos 24 filler
    padNum(t.valueOfGoodsUsd, 10, "valueOfGoodsUsd") +
    " " + // pos 35 filler
    (t.quantity1Hundredths === undefined
      ? "            "
      : padNum(t.quantity1Hundredths, 12, "quantity1Hundredths")) +
    padAN(t.unitOfMeasure1, 3, "unitOfMeasure1")
  );
}

// --- validators (structural, position-anchored to the Rev-108 tables) ---------------
export interface RecordViolation {
  record: string;
  field: string;
  problem: string;
}

function checkPattern(
  violations: RecordViolation[],
  record: string,
  field: string,
  value: string,
  pattern: RegExp,
  note: string
) {
  if (!pattern.test(value)) {
    violations.push({ record, field, problem: `'${value}' fails ${note}` });
  }
}

export function validate10Record(line: string): RecordViolation[] {
  const v: RecordViolation[] = [];
  if (line.slice(0, 2) !== "10") v.push({ record: "10", field: "control", problem: "must be '10'" });
  checkPattern(v, "10", "actionCode", line.slice(2, 3), /^[AR]$/, "A|R (declared subset)");
  const filer = line.slice(3, 6);
  checkPattern(v, "10", "filerCode", filer, /^[A-Z0-9]{3}$/, "3AN");
  checkPattern(v, "10", "filler7-8", line.slice(6, 8), /^ {2}$/, "space fill");
  const entryNumber = line.slice(8, 16);
  checkPattern(v, "10", "entryNumber", entryNumber, /^\d{8}$/, "8 digits (numeric sequence + check digit)");
  if (/^\d{8}$/.test(entryNumber) && /^[A-Z0-9]{3}$/.test(filer)) {
    const expected = entryNumberCheckDigit(filer, entryNumber.slice(0, 7));
    if (Number(entryNumber[7]) !== expected) {
      v.push({
        record: "10",
        field: "entryNumber",
        problem: `check digit ${entryNumber[7]} != computed ${expected} (AE Table 1)`,
      });
    }
  }
  checkPattern(v, "10", "portOfEntry", line.slice(17, 21), /^[A-Z0-9]{4}$/, "4AN");
  checkPattern(v, "10", "entryTypeCode", line.slice(33, 35), /^(01|03)$/, "01|03 (declared subset)");
  return v;
}

export function validate11Record(line: string): RecordViolation[] {
  const v: RecordViolation[] = [];
  if (line.slice(0, 2) !== "11") v.push({ record: "11", field: "control", problem: "must be '11'" });
  checkPattern(v, "11", "importerOfRecord", line.slice(2, 14), /^[A-Z0-9-]{2,12} *$/, "12X importer number");
  return v;
}

export function validate40Record(line: string): RecordViolation[] {
  const v: RecordViolation[] = [];
  if (line.slice(0, 2) !== "40") v.push({ record: "40", field: "control", problem: "must be '40'" });
  checkPattern(v, "40", "lineItemIdentifier", line.slice(4, 7), /^[A-Z0-9]{3}$/, "3X");
  checkPattern(v, "40", "countryOfOrigin", line.slice(8, 10), /^([A-Z]{2}|\*\*)$/, "ISO code or '**'");
  checkPattern(v, "40", "countryOfExport", line.slice(10, 12), /^([A-Z]{2}| {2})$/, "ISO code or space fill");
  checkPattern(v, "40", "dateOfExportation", line.slice(12, 18), /^(\d{6}| {6})$/, "6D MMDDYY or space fill");
  checkPattern(v, "40", "chargesAmount", line.slice(26, 36), /^(\d{10}| {10})$/, "10N or space fill");
  checkPattern(v, "40", "grossShippingWeightKg", line.slice(41, 51), /^\d{10}$/, "10N (zeroes if unused)");
  return v;
}

export function validate50Record(line: string): RecordViolation[] {
  const v: RecordViolation[] = [];
  if (line.slice(0, 2) !== "50") v.push({ record: "50", field: "control", problem: "must be '50'" });
  checkPattern(v, "50", "htsNumber", line.slice(2, 12), /^\d{10}$/, "10-digit HTS");
  checkPattern(v, "50", "dutyAmountCents", line.slice(13, 23), /^\d{10}$/, "10N implied 2dp");
  checkPattern(v, "50", "valueOfGoodsUsd", line.slice(24, 34), /^\d{10}$/, "10N whole USD");
  checkPattern(v, "50", "quantity1", line.slice(35, 47), /^(\d{12}| {12})$/, "12N implied 2dp or space fill");
  checkPattern(v, "50", "unitOfMeasure1", line.slice(47, 50), /^[A-Z0-9.]{1,3} *$/, "3AN per HTS");
  return v;
}

export interface SyntheticEntrySummary {
  header: string; // 10-record line
  headerContent: string; // 11-record line
  lines: Array<{ lineItem: string; tariff: string }>; // 40 + 50 record lines
}

export function validateEntrySummary(entry: SyntheticEntrySummary): RecordViolation[] {
  const violations = [
    ...validate10Record(entry.header),
    ...validate11Record(entry.headerContent),
  ];
  if (entry.lines.length === 0) {
    violations.push({ record: "40", field: "grouping", problem: "line grouping is MANDATORY for A/R" });
  }
  for (const line of entry.lines) {
    violations.push(...validate40Record(line.lineItem), ...validate50Record(line.tariff));
  }
  return violations;
}
