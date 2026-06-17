"use client";

import { useRef } from "react";

export type TabKey = "events" | "exposure" | "simulation" | "packet";

type TabDef = { key: TabKey; label: string; hint: string; pip?: string };

// Stable, shared id helpers so the tab's aria-controls and the panel's
// aria-labelledby resolve against the SAME single swapping panel (there is one
// panel, not four). Both the tablist and the panel import these.
export const tabId = (key: TabKey) => `actionops-tab-${key}`;
export const PANEL_ID = "actionops-tabpanel";

// Accessible tablist: roving focus with arrow-key navigation, aria-selected,
// and tab/panel wiring. The 4-tab spine of the ActionOps flow. Styled to the
// iter-3 command-center bar — a mono section index, a teal underline on the
// selected tab, and an optional status pip (e.g. the packet's READY).
export function TabNav({
  tabs,
  active,
  onChange
}: {
  tabs: TabDef[];
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + delta + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Action packet sections"
      className="flex gap-1 overflow-x-auto border-b border-line"
    >
      {tabs.map((tab, index) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="tab"
            id={tabId(tab.key)}
            aria-selected={selected}
            aria-controls={PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`relative inline-flex shrink-0 items-center gap-2 px-3.5 py-3 text-[0.84375rem] font-medium transition-colors duration-200 ${
              selected ? "text-ink" : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            <span
              aria-hidden="true"
              className="font-mono text-[0.625rem] text-ink-faint opacity-70"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            {tab.label}
            {tab.pip ? (
              <span className="rounded-full bg-accent-soft px-1.5 py-px font-mono text-[0.625rem] font-medium tracking-wide text-accent-strong">
                {tab.pip}
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className={`absolute inset-x-3.5 -bottom-px h-0.5 rounded-full transition-colors ${
                selected ? "bg-accent" : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
