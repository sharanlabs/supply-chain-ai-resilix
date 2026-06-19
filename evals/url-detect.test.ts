import { describe, expect, it } from "vitest";
import { containsLink, findLinks } from "@/lib/pipeline/url-detect";
import { isSafeHttpUrl } from "@/lib/signals/sanitize";

// The shared link detector -- the SINGLE definition of "what is a link in prose"
// used by the Dispatcher firewall (hard reject), the Sentinel summary scan, and
// gradeEvidence (both allowlist-aware). The OLD scheme-only scan missed every
// non-scheme link form; this pins that each is now caught, AND that ordinary prose
// (the clean drafts/playbooks) carries no false positive.

describe("findLinks catches every link bypass form", () => {
  const BYPASS: { name: string; text: string; expect: string }[] = [
    { name: "scheme http(s)", text: "visit https://x.com/a now", expect: "x.com" },
    { name: "scheme javascript", text: "javascript:alert(1) here", expect: "javascript:" },
    { name: "scheme data", text: "data:text/html,<b>x</b> payload", expect: "data:" },
    { name: "bare domain + path", text: "see www.attacker.com/leak today", expect: "attacker.com" },
    { name: "bare domain + query", text: "go to grab.io?d=secret now", expect: "grab.io" },
    { name: "protocol-relative", text: "open //evil.net/p here", expect: "evil.net" },
    { name: "protocol-relative single-label host", text: "open //x/a here", expect: "//x/a" },
    { name: "markdown link", text: "click [here](https://x.com/a) please", expect: "x.com" },
    { name: "html href", text: 'tag <a href="https://x.com">x</a>', expect: "href=" },
    { name: "html src single-quote", text: "img src='//x.com/p' end", expect: "src=" },
    { name: "entity-encoded colon", text: "open https&#58;//x.com now", expect: "x.com" }
  ];

  for (const c of BYPASS) {
    it(`catches a ${c.name}`, () => {
      const links = findLinks(c.text);
      expect(links.length, `no link found in: ${c.text}`).toBeGreaterThan(0);
      expect(links.join(" ")).toContain(c.expect);
      expect(containsLink(c.text)).toBe(true);
    });
  }
});

describe("findLinks does NOT fire on ordinary prose (no false positives)", () => {
  const CLEAN = [
    "We are contacting you about a supply-chain disruption affecting your inbound lanes. Your exposure score for this event is 88.",
    "We are assessing impact over an initial 7-day window and will confirm contingency routing after review.",
    "Secure alternate routing for Gulf-exposed components.",
    "Confirm backup supplier capacity",
    "Request expedited quotes on alternate lanes",
    "we will contact the top-5 exposed suppliers",
    "Acme Co. ships parts; Gulf Components Ltd is exposed.",
    "revenue at risk is $50,000 over the window",
    // The protocol-relative single-label change must NOT fire on these non-link "//" uses.
    "we will escalate to procurement and//or operations",
    "compare lane x // lane y throughput"
  ];
  for (const text of CLEAN) {
    it(`is clean: "${text.slice(0, 40)}..."`, () => {
      expect(findLinks(text)).toEqual([]);
      expect(containsLink(text)).toBe(false);
    });
  }
});

describe("allowlist-aware callers can still validate a real http(s) url in prose", () => {
  // For Sentinel / gradeEvidence: a scheme-valid http(s) url in prose returns a single
  // SCHEME token (the bare-domain arm does NOT double-match a url already preceded by
  // "//"), and that token IS a valid http(s) url -- so an allowlist check is meaningful.
  // A wrapper form (markdown/href) instead returns a non-url token that isSafeHttpUrl
  // rejects, so the allowlist-aware callers reject it even if the inner url is allowlisted.
  it("a plain http(s) prose url yields a scheme-valid token", () => {
    const realUrl = "https://api.gdeltproject.org/api/v2/doc/doc?query=x";
    const links = findLinks(`For details ${realUrl} see`);
    expect(links.some((l) => isSafeHttpUrl(l))).toBe(true);
  });

  it("a markdown/href wrapper yields a token that isSafeHttpUrl rejects", () => {
    const md = findLinks("[here](https://api.gdeltproject.org/x)");
    expect(md).toContain("[here](https://api.gdeltproject.org/x)");
    expect(isSafeHttpUrl("[here](https://api.gdeltproject.org/x)")).toBe(false);
    const href = findLinks('href="https://api.gdeltproject.org/x"');
    expect(href.some((l) => /^href=/.test(l))).toBe(true);
    expect(isSafeHttpUrl('href="https://api.gdeltproject.org/x"')).toBe(false);
  });
});
