import { cn } from "@/lib/utils";

// Tones map to the design tokens (globals.css @theme). The original five tones
// (neutral/success/warning/critical/info) are kept so existing callers and tests
// stay valid; severity tones (low/medium/high/critical-sev) drive the threat /
// exposure ramp. Every tone carries one meaning -- no decorative color.
type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "critical"
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical-sev"
  | "accent";

// Foreground tokens are the AA-compliant *-ink severity inks (>=4.5:1 small-text
// contrast on the matching -soft fill); border/background tokens carry the calm
// severity ramp. The "success" tone now reads in the steel-blue accent -- the
// green status family was dropped in the 2026 retheme ("validated" is calm
// confidence in the one accent, not a green light); it clears AA on accent-soft
// (6.73). critical keeps its red status family (4.89 on danger-soft).
const tones: Record<BadgeTone, string> = {
  neutral: "border-line-strong bg-sink text-ink-muted",
  success: "border-positive/30 bg-positive-soft text-positive",
  warning: "border-caution/30 bg-caution-soft text-caution-ink",
  critical: "border-danger/30 bg-danger-soft text-danger",
  info: "border-accent/25 bg-accent-soft text-accent-strong",
  accent: "border-accent/25 bg-accent-soft text-accent-strong",
  low: "border-sev-low/30 bg-sev-low-soft text-sev-low-ink",
  medium: "border-sev-medium/35 bg-sev-medium-soft text-sev-medium-ink",
  high: "border-sev-high/35 bg-sev-high-soft text-sev-high-ink",
  "critical-sev":
    "border-sev-critical/35 bg-sev-critical-soft text-sev-critical-ink"
};

export function Badge({
  children,
  tone = "neutral",
  className
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        // A crisp uppercase chip. The inset top highlight catches the canvas's
        // "lit from above" wash so the badge reads as a tactile token, not flat
        // ink; the tone classes (border/bg/text) are untouched so contrast and
        // the severity meaning stay exactly as measured.
        "inline-flex h-[1.375rem] items-center gap-1 rounded-md border px-2 text-[0.6875rem] font-semibold tracking-wide uppercase shadow-[inset_0_1px_0_oklch(1_0_0/0.35)]",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
