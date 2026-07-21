// S4 -- lexical-first retrieval over the committed policy corpus.
//
// Okapi BM25 (Robertson/Sparck-Jones), the practitioner-respected lexical default
// for a small, already-page-cited corpus (live-verified 2026-07-08: BM25 before any
// embedding pipeline). Pure, deterministic, in-process, no DB, no keys -- it fits
// the $0/keyless demo posture exactly. pg_textsearch is the documented enterprise
// swap (same query shape, a Postgres index instead of this in-memory one).
//
// Deterministic ordering: ties broken by chunk id so the same query always returns
// the same ranking (a golden suite over a nondeterministic ranker would be flaky).

import { POLICY_CORPUS, type PolicyChunk } from "@/lib/agents/customsdesk/policy-corpus";

// BM25 free parameters (standard defaults; k1 term-frequency saturation, b length
// normalization). Named, not magic -- the values are the literature defaults.
const K1 = 1.5;
const B = 0.75;

// A domain stopword set kept SMALL: only true function words. Customs terms
// (duty, loss, penalty, disclosure) must never be dropped -- they are the signal.
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "of", "for", "to", "and", "or", "on", "in",
  "what", "how", "much", "does", "do", "if", "my", "i", "with", "at", "by"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

interface IndexedChunk {
  chunk: PolicyChunk;
  tokens: string[];
  length: number;
  tf: Map<string, number>;
}

function buildIndex(corpus: PolicyChunk[]) {
  const docs: IndexedChunk[] = corpus.map((chunk) => {
    const tokens = tokenize(`${chunk.text} ${chunk.id.replace(/-/g, " ")}`);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { chunk, tokens, length: tokens.length, tf };
  });
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / Math.max(docs.length, 1);
  // Document frequency per term.
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const term of new Set(d.tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  return { docs, avgLen, df, N: docs.length };
}

const INDEX = buildIndex(POLICY_CORPUS);

function idf(term: string): number {
  const n = INDEX.df.get(term) ?? 0;
  // BM25 idf with the +1 smoothing so a term in every doc still scores >= 0.
  return Math.log(1 + (INDEX.N - n + 0.5) / (n + 0.5));
}

export interface RetrievedChunk {
  chunk: PolicyChunk;
  score: number;
}

// Retrieve the top-k cited chunks for a query, BM25-scored. Deterministic: a
// zero-signal query (no query term appears in the corpus) returns an empty list
// rather than an arbitrary chunk -- retrieval must not fabricate relevance.
export function retrievePolicy(query: string, k = 3): RetrievedChunk[] {
  const qTerms = tokenize(query);
  if (qTerms.length === 0) return [];
  const scored = INDEX.docs.map((d) => {
    let score = 0;
    for (const term of qTerms) {
      const f = d.tf.get(term) ?? 0;
      if (f === 0) continue;
      const denom = f + K1 * (1 - B + (B * d.length) / INDEX.avgLen);
      score += idf(term) * ((f * (K1 + 1)) / denom);
    }
    return { chunk: d.chunk, score };
  });
  const results = scored
    .filter((s) => s.score > 0)
    // Codepoint compare (not localeCompare) so the tie-break is locale-independent
    // by construction -- the ids are ASCII, and the ranking must be deterministic
    // regardless of the runtime's locale.
    .sort((a, b) => (b.score - a.score) || (a.chunk.id < b.chunk.id ? -1 : a.chunk.id > b.chunk.id ? 1 : 0))
    .slice(0, k);
  // Serve-time citation guard (2026-07-16 re-review, D-10): the structural "every chunk
  // is cited" invariant is test-pinned, but the serving boundary must not DEPEND on the
  // test having run — an uncited chunk here is a corpus regression and fails loud rather
  // than surfacing an uncited claim to a caller.
  for (const r of results) {
    if (r.chunk.citation.sourceId.trim().length === 0 || r.chunk.citation.section.trim().length === 0) {
      throw new Error(`retrievePolicy: chunk "${r.chunk.id}" has no usable citation (corpus regression — fail closed)`);
    }
  }
  return results;
}
