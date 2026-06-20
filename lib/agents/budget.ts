// The BUDGET HARD-STOP (D.8, R4-10). Fail-CLOSED enforcement of the
// Success_Criteria "<=$5 total LLM spend" row -- in code, not in a hope.
//
// WHY a guard, not a hope: a runaway agent loop or a mispriced model can bill far
// past the cap before anyone notices. The cap is the LAST line: before EVERY live
// call, the caller asserts that spent-so-far plus the next call's estimated cost
// stays under the cap. A breach THROWS, so the would-be billing call never fires --
// a breach can never bill. Pure + DI-friendly (spent/next/cap are all params, no
// global, no network), so the block and allow paths are unit-provable with no spend.

// The default spend cap in USD. The Success_Criteria number, named once. Callers may
// override per deployment, but the default IS the contract.
export const DEFAULT_BUDGET_CAP_USD = 5;

// The RUN-LEVEL retry reserve: the total number of EXTRA live attempts the whole pipeline
// run may spend when an agent's output fails its firewall/parse (a stochastic slip) before
// it degrades to FAILED_TO_FALLBACK. SHARED across the three LLM agents (a single pool, not
// per-agent) so the worst-case billed call count stays at the three base calls plus this
// reserve = the Success_Criteria "LLM calls per pipeline run: 3 (+2 retry reserve)" = 5
// ceiling. A per-agent reserve would let three agents each retry and blow that ceiling.
export const LIVE_RETRY_RESERVE = 2;

// Thrown when a live call would push cumulative spend past the cap. A distinct error
// type so a caller can catch THIS (the budget breach) without swallowing unrelated
// throws -- and so the audit/log can name it as a budget event, not a generic failure.
export class BudgetExceededError extends Error {
  readonly spentUsd: number;
  readonly nextEstimatedUsd: number;
  readonly capUsd: number;

  constructor(spentUsd: number, nextEstimatedUsd: number, capUsd: number) {
    super(
      `Budget hard-stop: spent $${spentUsd.toFixed(4)} + next $${nextEstimatedUsd.toFixed(
        4
      )} = $${(spentUsd + nextEstimatedUsd).toFixed(4)} would exceed the $${capUsd.toFixed(
        2
      )} cap. Live call blocked before it could bill.`
    );
    this.name = "BudgetExceededError";
    this.spentUsd = spentUsd;
    this.nextEstimatedUsd = nextEstimatedUsd;
    this.capUsd = capUsd;
  }
}

// assertWithinBudget: the fail-closed gate. Call it IMMEDIATELY BEFORE a live LLM
// call. If spent + next > cap it THROWS (BudgetExceededError), so the call is never
// made and cannot bill. Otherwise it returns (the call may proceed). Pure: the inputs
// are the only state, so a test proves both the block (would-breach) and the allow
// (under-cap) path with injected numbers and zero network.
//
// Fail-CLOSED on a non-finite input: a NaN/undefined spent or next is treated as a
// breach (throws), never as "fine to proceed" -- a guard that silently passes on bad
// input is not a guard. The cap defaults to the Success_Criteria $5.
export function assertWithinBudget(
  spentUsd: number,
  nextEstimatedUsd: number,
  capUsd: number = DEFAULT_BUDGET_CAP_USD
): void {
  const spent = Number(spentUsd);
  const next = Number(nextEstimatedUsd);
  // Non-finite cost numbers cannot be reasoned about -> fail closed, block the call.
  if (!Number.isFinite(spent) || !Number.isFinite(next)) {
    throw new BudgetExceededError(spentUsd, nextEstimatedUsd, capUsd);
  }
  if (spent + next > capUsd) {
    throw new BudgetExceededError(spent, next, capUsd);
  }
}
