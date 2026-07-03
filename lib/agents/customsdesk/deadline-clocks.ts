// Deadline clocks (plan §5 D1) -- pure date arithmetic over the policy table's
// deadline rules. No system clock: "today" is always an explicit parameter, so the
// same inputs always produce the same clocks (replay-first discipline).

import { DEADLINE_RULES, type DeadlineRule } from "./policy-table";

export interface NoticeEvent {
  kind: DeadlineRule["kind"];
  mailedOn: string; // ISO date (YYYY-MM-DD), the regulatory trigger date
}

export interface DeadlineClock {
  kind: DeadlineRule["kind"];
  mailedOn: string;
  dueOn: string;
  windowDays: number;
  sourceStatus: DeadlineRule["sourceStatus"];
  citation: string; // human-readable, e.g. "19 CFR 171.2(b)(2)"
  note: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string, label: string): Date {
  if (!ISO_DATE.test(value)) throw new Error(`${label} must be YYYY-MM-DD, got '${value}'`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is not a real date: '${value}'`);
  return date;
}

function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso, "date");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function computeDeadlines(events: NoticeEvent[]): DeadlineClock[] {
  return events.map((event) => {
    const rule = DEADLINE_RULES.find((r) => r.kind === event.kind);
    if (!rule) throw new Error(`no deadline rule for '${event.kind}'`);
    return {
      kind: event.kind,
      mailedOn: event.mailedOn,
      dueOn: addDaysIso(event.mailedOn, rule.windowDays),
      windowDays: rule.windowDays,
      sourceStatus: rule.sourceStatus,
      citation: rule.citation ? rule.citation.section : "UNSOURCED — assumption",
      note: rule.note,
    };
  });
}

export function daysUntil(dueOn: string, today: string): number {
  const due = parseIsoDate(dueOn, "dueOn").getTime();
  const now = parseIsoDate(today, "today").getTime();
  return Math.round((due - now) / 86_400_000);
}
