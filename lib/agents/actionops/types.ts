import type {
  ActionItem,
  AgentRun,
  ExposureResult,
  GatekeeperReport,
  Playbook,
  PublicSignal,
  Simulation,
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
  playbooks: Playbook[];
  supplierMessages: SupplierMessageDraft[];
  actionItems: ActionItem[];
  gatekeeper: GatekeeperReport;
  agentRuns: AgentRun[];
};
