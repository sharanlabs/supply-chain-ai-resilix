import type { DecisionPacketV2 } from "@/lib/schemas";

// enumerateOutputProseSurfaces -- the SINGLE source of truth for "every drafted-output prose
// surface a leak scanner must cover" (EV-03/04, 2026-07-16 re-review).
//
// Before this, TWO scanners enumerated these surfaces independently and had DRIFTED apart:
//   - outputProseSurfaces (lib/evals/injection-redteam.ts) covered recoveryOptions but NOT
//     exposure rationales -- it feeds the red-team scan + the trajectory outcome term.
//   - gradeInjectionQuarantine's draftedProse (lib/evals/graders.ts) covered exposure rationales
//     but NOT recoveryOptions.
// So a laundered instruction in a recovery-option summary was invisible to the quarantine grader,
// and a leak in an exposure rationale was invisible to the trajectory outcome term -- with a stale
// "Mirrors gradeInjectionQuarantine's draftedProse scope" comment masking the divergence. Both
// consumers now derive their surfaces from this ONE union, so a new output surface is added in a
// single place and neither scanner can silently miss it (the structural "a new surface can't skip
// the boundary" fix, lessons.md P3.2).
//
// SCOPE = the DRAFTED OUTPUT that leaves the building: supplier messages, exposure rationales,
// playbooks, action items, recovery options. It deliberately EXCLUDES the threat-card / signal
// RECORDS (where Sentinel-sanitized event prose legitimately lives) and the wider rendered-prose
// set gradeEvidence.renderedProse scans for URL provenance (a different job -- do not fold it in).
// Subject and body are separate entries (finer failure localization; identical detection for a
// contiguous needle).
export function enumerateOutputProseSurfaces(
  packet: DecisionPacketV2
): { where: string; text: string }[] {
  return [
    ...packet.supplierMessages.flatMap((m) => [
      { where: `message ${m.id} subject`, text: m.subject ?? "" },
      { where: `message ${m.id} body`, text: m.body }
    ]),
    ...packet.exposureResults.map((e) => ({
      where: `exposure ${e.id} rationale`,
      text: e.rationale
    })),
    ...packet.playbooks.flatMap((p) => [
      { where: `playbook ${p.id} summary`, text: p.summary },
      ...p.steps.map((s, i) => ({ where: `playbook ${p.id} step ${i}`, text: s }))
    ]),
    ...packet.actionItems.map((a) => ({ where: `action item ${a.id}`, text: a.title })),
    ...(packet.recoveryOptions ?? []).flatMap((r) => [
      { where: `recovery ${r.id} title`, text: r.title },
      { where: `recovery ${r.id} summary`, text: r.summary }
    ]),
    // Agent-run summaries render on the glass (packet + loop views) and can embed
    // model-controlled text: a live firewall REJECTION quotes the offending model value
    // (e.g. a hostile supplierId) into its reason, which becomes AgentRun.summary. The
    // Codex cross-model pass caught this surface missing from the union -- both scanners
    // shared the same blind spot, which is exactly why the list must be exhaustive.
    ...packet.agentRuns.map((r) => ({
      where: `agent run ${r.agentName} summary`,
      text: r.summary
    }))
  ];
}
