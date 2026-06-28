import type {
  ActionItem,
  AgentRun,
  ExposureResult,
  GatekeeperReport,
  MissingEvidence,
  Playbook,
  PublicSignal,
  Recommendation,
  RecoveryOption,
  Simulation,
  SkepticGateOutcome,
  Supplier,
  SupplierMessageDraft,
  ThreatCard
} from "@/lib/schemas";
import type { ActionOpsScenario } from "@/lib/data/actionops-scenarios";

// The shared input every ActionOps agent reads. The pipeline (run-exception)
// assembles it once -- the resolved scenario, the fetched public signals, the
// in-memory seed suppliers, and the run "as of" instant -- then threads it through
// the agents. Agents receive validated, structured fields; only Sentinel will see
// raw signal text (D.5), and that text never crosses to a later agent.
export type ActionOpsContext = {
  scenario: ActionOpsScenario;
  signals: PublicSignal[];
  suppliers: Supplier[];
  baseDateIso: string;
  // Explicit per-invocation live-AI opt-in (default false/absent). The 3 LLM agents
  // bill ONLY when this is true AND liveAiEnabled() (flag + key). The page render
  // passes false, so a homepage load never bills even with ENABLE_LIVE_AI on; the only
  // billable path is the authenticated /api/run-exception POST. Agents ignore this
  // field -- the orchestrator (index.ts) reads it to pick the live vs deterministic body.
  live?: boolean;
};

// What runActionOpsAgents returns: the V2 slices the pipeline assembles into a
// DecisionPacketV2, plus the per-agent run records. dataTier is read from the
// scenario by the pipeline, so it is not duplicated here.
export type ActionOpsResult = {
  threatCard: ThreatCard;
  publicSignals: PublicSignal[];
  exposureResults: ExposureResult[];
  simulation?: Simulation;
  dataGaps: string[];
  // The act/refuse decision (decideRecommendation). NO_ACTION = the pipeline refused
  // to draft outbound action on a lone uncorroborated low-confidence source; playbooks
  // and supplierMessages are then withheld and missingEvidence states the gap.
  recommendation: Recommendation;
  missingEvidence: MissingEvidence[];
  // The cross-family Skeptic gate outcome (ACCEPTED / ANNOTATED / VETOED). Present ONLY when a
  // genuine cross-family critic actually ran (absent on the deterministic affirmative pass), so a
  // key-OFF packet stays byte-identical to before. ANNOTATED = the critic objected but the finding
  // was independently strong (corroborated + above the floor + a real-sector exposure), so the gate
  // downgraded the veto to a recorded caution rather than hard-vetoing it.
  skepticGateOutcome?: SkepticGateOutcome;
  playbooks: Playbook[];
  // Scored, structured mitigation options (deterministic; see recovery.ts). Withheld
  // (empty) on a NO_ACTION refusal, exactly like playbooks and supplierMessages.
  recoveryOptions: RecoveryOption[];
  supplierMessages: SupplierMessageDraft[];
  actionItems: ActionItem[];
  gatekeeper: GatekeeperReport;
  agentRuns: AgentRun[];
};
