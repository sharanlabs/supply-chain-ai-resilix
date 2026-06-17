import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetGdeltStateForTest,
  fetchGdeltSignals,
  type GdeltArticle
} from "@/lib/signals/gdelt";

// Deterministic: a fake fetch (DI) + an injected clock. No network, no real waits.
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? "Too Many Requests" : "",
    json: async () => body
  } as unknown as Response;
}
function fetchReturning(body: unknown, status = 200): typeof fetch {
  return (async () => jsonResponse(body, status)) as unknown as typeof fetch;
}
function fetchThrowing(err: Error): typeof fetch {
  return (async () => {
    throw err;
  }) as unknown as typeof fetch;
}

const STALE_UNKNOWN_MINUTES = 7 * 24 * 60;
const ARTICLE: GdeltArticle = {
  url: "https://example.com/a",
  title: "Port congestion disrupts supply chain",
  seendate: "20260615T063000Z",
  domain: "example.com",
  language: "English",
  sourcecountry: "United States"
};

let clock: number;
const now = () => clock;

beforeEach(() => {
  __resetGdeltStateForTest();
  clock = 1_790_000_000_000; // fixed epoch ms (~2026-09), after the article's 2026-06 seendate
});
afterEach(() => __resetGdeltStateForTest());

describe("P3.1 GDELT fetcher -- happy path + mapping", () => {
  it("maps a live article to a valid PublicSignal (status LIVE)", async () => {
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [ARTICLE] }), now });
    expect(r.status).toBe("LIVE");
    expect(r.signals).toHaveLength(1);
    const s = r.signals[0];
    expect(s.source).toBe("GDELT DOC 2.0");
    expect(s.sourceUrl).toBe("https://example.com/a");
    expect(s.summary).toContain("Port congestion");
    expect(s.id).toMatch(/^SIG-GDELT-[0-9a-f]{16}$/);
    expect(s.status).toBe("LIVE");
    expect(s.location.country).toBe("United States");
    expect(s.freshnessMinutes).toBeGreaterThan(0);
  });
  it("derives a deterministic id from the url", async () => {
    const a = await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [ARTICLE] }), now });
    __resetGdeltStateForTest();
    const b = await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [ARTICLE] }), now });
    expect(a.signals[0].id).toBe(b.signals[0].id);
  });
  it("a valid empty result (articles: []) -> LIVE with 0 signals", async () => {
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [] }), now });
    expect(r.status).toBe("LIVE");
    expect(r.signals).toHaveLength(0);
  });
});

describe("P3.1 GDELT fetcher -- graceful degradation (never throws)", () => {
  it("429 with no cache -> FAILED", async () => {
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({}, 429), now });
    expect(r.status).toBe("FAILED");
    expect(r.note).toContain("429");
  });
  it("500 -> FAILED", async () => {
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({}, 500), now });
    expect(r.status).toBe("FAILED");
  });
  it("network error -> FAILED, no throw", async () => {
    const r = await fetchGdeltSignals({ fetchImpl: fetchThrowing(new Error("ECONNREFUSED")), now });
    expect(r.status).toBe("FAILED");
    expect(r.note).toContain("ECONNREFUSED");
  });
  it("a throwing injected clock degrades to Date.now (no crash)", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [ARTICLE] }),
      now: () => {
        throw new Error("clock blew up");
      }
    });
    expect(r.status).toBe("LIVE");
    expect(r.signals).toHaveLength(1);
  });
  it("an out-of-range injected clock (1e20) degrades to Date.now (no toISOString crash)", async () => {
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [ARTICLE] }), now: () => 1e20 });
    expect(r.status).toBe("LIVE");
    expect(r.signals).toHaveLength(1);
  });
  it("malformed JSON on a 200 -> FAILED (not a cached empty LIVE)", async () => {
    const bad = (async () => ({
      ok: true,
      status: 200,
      statusText: "",
      json: async () => {
        throw new Error("invalid json");
      }
    })) as unknown as typeof fetch;
    const r = await fetchGdeltSignals({ fetchImpl: bad, now });
    expect(r.status).toBe("FAILED");
    expect(r.note).toContain("malformed");
  });
  it("a 200 with no articles array -> FAILED (API drift)", async () => {
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({ status: "ok" }), now });
    expect(r.status).toBe("FAILED");
    expect(r.note).toContain("malformed");
  });
  it("429 after a prior success past TTL -> degrades to the stale cache, re-stamped CACHED", async () => {
    await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [ARTICLE] }), now });
    clock += 6 * 60_000; // past the 5min TTL, within the 60min stale bound
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({}, 429), now });
    expect(r.status).toBe("CACHED");
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0].status).toBe("CACHED"); // re-stamped, not left as LIVE
    expect(r.note).toContain("429");
  });
});

describe("P3.1 GDELT fetcher -- per-article validation + sanitization", () => {
  it("skips an article with no url, counts it", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [{ title: "x" }, ARTICLE] }),
      now
    });
    expect(r.signals).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });
  it("skips an invalid url", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [{ ...ARTICLE, url: "not a url" }] }),
      now
    });
    expect(r.signals).toHaveLength(0);
    expect(r.skipped).toBe(1);
  });
  it("skips a javascript: url (XSS link scheme)", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [{ ...ARTICLE, url: "javascript:alert(1)" }] }),
      now
    });
    expect(r.signals).toHaveLength(0);
    expect(r.skipped).toBe(1);
  });
  it("dedups duplicate urls", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [ARTICLE, { ...ARTICLE }] }),
      now
    });
    expect(r.signals).toHaveLength(1);
  });
  it("falls back to a placeholder summary when the title is missing", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [{ ...ARTICLE, title: undefined }] }),
      now
    });
    expect(r.signals[0].summary).toContain("untitled");
  });
  it("caps a very long title at 500 chars", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [{ ...ARTICLE, title: "x".repeat(2000) }] }),
      now
    });
    expect(r.signals[0].summary.length).toBeLessThanOrEqual(500);
  });
  it("strips control chars from the title (keeps a word break)", async () => {
    const dirty = "a" + String.fromCharCode(0, 9, 10) + "b";
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [{ ...ARTICLE, title: dirty }] }),
      now
    });
    expect(r.signals[0].summary).toBe("a b");
  });
  it("strips control chars from sourcecountry too", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({
        articles: [{ ...ARTICLE, sourcecountry: "US" + String.fromCharCode(7) + "X" }]
      }),
      now
    });
    expect(r.signals[0].location.country).toBe("US X");
  });
  it("a missing/malformed seendate -> conservatively stale (never 0/freshest)", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [{ ...ARTICLE, seendate: "garbage" }] }),
      now
    });
    expect(r.signals[0].freshnessMinutes).toBeGreaterThanOrEqual(STALE_UNKNOWN_MINUTES);
  });
  it("an impossible date (Feb 30) -> conservatively stale, not silently rolled over", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [{ ...ARTICLE, seendate: "20260230T000000Z" }] }),
      now
    });
    expect(r.signals[0].freshnessMinutes).toBeGreaterThanOrEqual(STALE_UNKNOWN_MINUTES);
  });
  it("a far-future seendate -> conservatively stale (bad data, not fresh)", async () => {
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [{ ...ARTICLE, seendate: "20990101T000000Z" }] }),
      now
    });
    expect(r.signals[0].freshnessMinutes).toBeGreaterThanOrEqual(STALE_UNKNOWN_MINUTES);
  });
  it("a small future skew (clock skew) -> 0", async () => {
    const stamp = new Date(clock + 2 * 60_000)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const r = await fetchGdeltSignals({
      fetchImpl: fetchReturning({ articles: [{ ...ARTICLE, seendate: stamp }] }),
      now
    });
    expect(r.signals[0].freshnessMinutes).toBe(0);
  });
});

describe("P3.1 GDELT fetcher -- caching, spacing, coalescing", () => {
  it("a 2nd call within TTL is served from cache, re-stamped CACHED (one fetch)", async () => {
    const spy = vi.fn(async () => jsonResponse({ articles: [ARTICLE] }));
    await fetchGdeltSignals({ fetchImpl: spy as unknown as typeof fetch, now });
    clock += 6000;
    const r = await fetchGdeltSignals({ fetchImpl: spy as unknown as typeof fetch, now });
    expect(r.status).toBe("CACHED");
    expect(r.signals[0].status).toBe("CACHED");
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("refetches after the cache TTL expires", async () => {
    const spy = vi.fn(async () => jsonResponse({ articles: [ARTICLE] }));
    await fetchGdeltSignals({ fetchImpl: spy as unknown as typeof fetch, now });
    clock += 6 * 60_000;
    await fetchGdeltSignals({ fetchImpl: spy as unknown as typeof fetch, now });
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("throttles a 2nd call within 5s when there is no fresh cache", async () => {
    await fetchGdeltSignals({ fetchImpl: fetchReturning({}, 429), now });
    clock += 2000;
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [ARTICLE] }), now });
    expect(r.status).toBe("FAILED");
    expect(r.note).toContain("since last GDELT call");
  });
  it("never throttles the first call", async () => {
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [ARTICLE] }), now });
    expect(r.status).toBe("LIVE");
  });
  it("on failure, refuses a cache older than the staleness bound", async () => {
    await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [ARTICLE] }), now });
    clock += 90 * 60_000; // 90min > the 60min bound
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({}, 429), now });
    expect(r.status).toBe("FAILED");
    expect(r.note).toContain("too stale");
  });
  it("the spacing path also refuses a too-stale cache (the gate-found gap)", async () => {
    await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [ARTICLE] }), now });
    clock += 90 * 60_000;
    await fetchGdeltSignals({ fetchImpl: fetchReturning({}, 429), now }); // refuses, sets lastCall
    clock += 3000; // 3s -> spacing guard
    const r = await fetchGdeltSignals({ fetchImpl: fetchReturning({ articles: [ARTICLE] }), now });
    expect(r.status).toBe("FAILED"); // must NOT serve the 90min cache via the spacing path
  });
  it("evicts the oldest cache entry past the size cap", async () => {
    for (let i = 0; i < 70; i++) {
      clock += 6000;
      await fetchGdeltSignals({ query: `q${i}`, fetchImpl: fetchReturning({ articles: [ARTICLE] }), now });
    }
    clock += 6000;
    const spy = vi.fn(async () => jsonResponse({ articles: [ARTICLE] }));
    const r = await fetchGdeltSignals({ query: "q0", fetchImpl: spy as unknown as typeof fetch, now });
    expect(r.status).toBe("LIVE"); // q0 was evicted -> a live refetch, not a cache hit
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("coalesces concurrent identical fetches (one network call, both get the result)", async () => {
    let calls = 0;
    const slow = (async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return jsonResponse({ articles: [ARTICLE] });
    }) as unknown as typeof fetch;
    const [a, b] = await Promise.all([
      fetchGdeltSignals({ fetchImpl: slow, now }),
      fetchGdeltSignals({ fetchImpl: slow, now })
    ]);
    expect(calls).toBe(1);
    expect(a.signals).toHaveLength(1);
    expect(b.signals).toHaveLength(1);
  });
});

describe("P3.1 GDELT fetcher -- replay + the recorded fixture", () => {
  it("replayArticles map to CACHED signals, never LIVE", async () => {
    const r = await fetchGdeltSignals({ replayArticles: [ARTICLE], now });
    expect(r.status).toBe("CACHED");
    expect(r.signals[0].status).toBe("CACHED");
  });
  it("the real recorded GDELT fixture maps to valid http(s) signals", async () => {
    const fixture = JSON.parse(
      readFileSync("data/signals/gdelt-artlist-sample-20260617.json", "utf8")
    ) as { articles: GdeltArticle[] };
    const r = await fetchGdeltSignals({ replayArticles: fixture.articles, now });
    expect(r.signals.length).toBeGreaterThan(0);
    expect(r.signals.every((s) => /^https?:\/\//.test(s.sourceUrl))).toBe(true);
    expect(r.signals.every((s) => s.status === "CACHED")).toBe(true);
  });
});
