import { retrievePolicy } from "@/lib/agents/customsdesk/retrieval";

// S4 consumer -- the customs-desk EVIDENCE SPINE made queryable. Given a plain-
// language question (the `?ask=` searchParam, server-rendered like the rest of the
// desk), retrieve the top cited policy chunks (lexical/BM25) and render each with
// its primary-source citation. This is the retrieval feeding the desk's evidence
// story: every answer is a cited chunk, never an uncited paraphrase -- the same
// citation-or-nothing discipline the packet numbers obey. No client JS, no keys,
// no DB; a GET form submits the query as a URL param.

const SUGGESTED = [
  "penalty for a negligent duty-loss violation",
  "how much if I file a prior disclosure",
  "days to respond to a prepenalty notice"
];

export function PolicyLookup({ ask }: { ask?: string }) {
  const query = ask?.trim() ?? "";
  const results = query ? retrievePolicy(query, 3) : [];

  return (
    <section
      aria-labelledby="lookup-h"
      className="reveal panel mt-8 rounded-(--radius-card) p-6"
      style={{ "--d": 240 } as React.CSSProperties}
    >
      <h2
        id="lookup-h"
        className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-faint uppercase"
      >
        Ask the policy corpus
      </h2>
      <p className="mt-2 max-w-[60ch] text-[0.8125rem] leading-6 text-ink-muted">
        Lexical retrieval over the committed, page-cited penalty-defense corpus (19 USC 1592
        dispositions, prior disclosure, mitigating and aggravating factors, response deadlines,
        EO&nbsp;14411). Every result carries its primary-source citation &mdash; the same
        citation-or-nothing rule the packet numbers follow.
      </p>

      {/* A plain GET form -- the query becomes ?ask=, server-rendered. No client JS. */}
      <form method="get" className="mt-4 flex flex-wrap gap-2" role="search">
        <label htmlFor="ask" className="sr-only">
          Ask a customs penalty-defense question
        </label>
        <input
          id="ask"
          name="ask"
          type="search"
          defaultValue={query}
          placeholder="e.g. penalty for a negligent duty-loss violation"
          className="min-w-[18rem] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-[var(--shadow-e1)] focus-visible:border-accent"
        />
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-lg border border-accent-strong bg-accent px-4 text-sm font-semibold text-accent-ink shadow-[var(--shadow-e2),inset_0_1px_0_oklch(1_0_0/0.18)] hover:bg-accent-strong"
        >
          Retrieve
        </button>
      </form>

      {!query ? (
        <div className="mt-4 flex flex-wrap gap-2" data-testid="lookup-suggested">
          {SUGGESTED.map((s) => (
            <a
              key={s}
              href={`/customs?ask=${encodeURIComponent(s)}`}
              className="rounded-full border border-line bg-sink px-3 py-1.5 text-[0.8125rem] text-ink-muted hover:text-ink"
            >
              {s}
            </a>
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted" data-testid="lookup-no-match">
          No policy chunk matched that query. Retrieval returns nothing rather than an uncited
          guess &mdash; try one of the terms above.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3" data-testid="lookup-results">
          {results.map((r) => (
            <li key={r.chunk.id} className="rounded-lg border border-line bg-sink/60 p-4">
              <p className="text-[0.875rem] leading-6 text-ink">{r.chunk.text}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] text-ink-faint">
                <span className="rounded-md border border-line bg-surface px-2 py-0.5 text-accent-strong">
                  {r.chunk.citation.sourceId}
                </span>
                <span>{r.chunk.citation.section}</span>
                <span>· as of {r.chunk.citation.asOf}</span>
                <span>· {r.chunk.citation.layer}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
