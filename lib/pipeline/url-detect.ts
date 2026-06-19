// The shared link detector -- ONE definition of "what counts as a link in free
// text", used at the three sites that gate prose for exfiltration channels: the
// Dispatcher firewall (a supplier draft links to NOTHING -- any link is the
// lethal-trifecta exfil leg), the Sentinel summary scan (a non-allowlisted link in
// the threat prose), and gradeEvidence (a rendered prose URL must be allowlisted).
//
// WHY this module exists: before it, each site scanned scheme-only with
// /\b(?:https?|javascript|data):.../ -- so a link written WITHOUT a leading scheme
// walked straight past every one of them. The bypass forms an injection would use:
//   - bare domain:        www.x.com/a        x.com?d=secret
//   - protocol-relative:  //x.com/a
//   - markdown link:      [click here](https://x.com/a)
//   - HTML attribute:     href="https://x.com" or src='//x.com'
//   - entity-encoded:     https&#58;//x.com   (the ":" written as an HTML entity so
//                          the scheme regex never sees "https:")
// Every one of those is a live link a mail client / markdown renderer resolves, so
// every one is an exfiltration channel a drafted supplier email must not carry.
//
// The detector returns the OFFENDING TOKEN as it appears in the text (the wrapper,
// e.g. "[t](url)" or 'href="..."' or the bare "x.com/a"), NOT the inner URL. That
// matters for the two ALLOWLIST-AWARE callers (Sentinel, gradeEvidence): they hand
// the returned token to isSafeHttpUrl, and a wrapper token is NOT a scheme-valid
// http(s) URL, so it fails the allowlist check and is rejected -- even if the URL
// nested inside it happened to be on the allowlist. (Returning the inner URL would
// let "[t](<allowlisted-url>)" slip through as "allowlisted".)
//
// SCOPE: scan PROSE surfaces only. The structured url fields (threatCard.evidenceUrls,
// signal.sourceUrl) are NOT run through this -- they are already isSafeHttpUrl +
// allowlist checked, and a legitimate evidence URL like
// "https://api.gdeltproject.org/..." contains a bare domain that this detector would
// (correctly, for prose) flag. Feeding structured urls here would reject every real
// evidence url. Prose surfaces only.

// Decode the small set of HTML entity forms an injection uses to hide a scheme's
// punctuation (the ":" and "/" of "https://"). Numeric (&#58; &#x3a;) and the named
// &colon; / &sol; / &#47;. Done BEFORE scanning so "https&#58;//x.com" normalizes to
// "https://x.com" and is then caught by the scheme rule. Intentionally narrow -- we
// decode only the characters that reconstruct a link, not a general HTML decoder.
function decodeLinkEntities(text: string): string {
  return text
    .replace(/&#0*58;|&#x0*3a;|&colon;/gi, ":")
    .replace(/&#0*47;|&#x0*2f;|&sol;/gi, "/")
    .replace(/&#0*46;|&#x0*2e;|&period;/gi, ".");
}

// Scheme links: http(s) plus the unsafe schemes an injection would try
// (javascript:/data:/file:/ftp:). After entity-decoding so a hidden-colon form is
// caught too.
const SCHEME_LINK = /\b(?:https?|javascript|data|file|ftp):[^\s)"'<>]+/gi;

// Protocol-relative: "//host/..." -- a real link form (the browser/mailer supplies
// the scheme). The host MAY be a single label with no dot ("//x/a", the literal task
// example) -- a mailer/browser resolves it just the same -- so the dot group is
// optional, but a following path delimiter (/?#) is then REQUIRED so we fire only on a
// genuine "//host/path" link, never on incidental text. The leading lookbehind
// (?<![:\w]) keeps us off the "//" already inside a scheme link and off a word-glued
// "and//or"; a preceding space breaks the match, so "x // y" is not a link.
const PROTOCOL_RELATIVE = /(?<![:\w])\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*(?=[/?#])[^\s)"'<>]*/gi;

// Markdown link: "[label](target)". The target is a link regardless of its own form,
// so the whole "[..](..)" is returned as the offending token.
const MARKDOWN_LINK = /\[[^\]]*\]\([^)]+\)/g;

// HTML attribute that carries a target: href=, src=, action=, formaction=,
// xlink:href=. Quoted or bare value. The whole attribute is the offending token.
const HREF_ATTR = /\b(?:href|src|action|formaction|xlink:href)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

// Bare domain: "host.tld" optionally with a leading "www." and any path/query, with
// NO scheme. Constrained to a curated TLD set + a hard boundary (the domain must be
// followed by "/", "?", "#", ":", or end -- a plain "Acme Co." sentence does NOT
// match because "Co." is not in the TLD set AND is not path/query-followed). This is
// the deliberately-conservative arm: it must catch "www.x.com/a" and "x.com?d=1"
// without firing on ordinary prose. The leading boundary rejects a domain that is
// part of an email local-part or already inside a scheme/host we matched above.
const BARE_DOMAIN =
  /(?<![@\w.\/])(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|ru|cn|info|biz|app|dev|xyz|gov|edu|tv|me|ly|to|gg|sh|link|click|live)(?=[/?#:]|$)[^\s)"'<>]*/gi;

const DETECTORS = [SCHEME_LINK, PROTOCOL_RELATIVE, MARKDOWN_LINK, HREF_ATTR, BARE_DOMAIN];

// findLinks: return EVERY offending link token found in `text`, in any of the forms
// above, as it appears (the wrapper for markdown/href). Empty array iff the prose
// carries no link of any form. The single source of truth the three callers share.
export function findLinks(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const decoded = decodeLinkEntities(text);
  const found: string[] = [];
  for (const re of DETECTORS) {
    re.lastIndex = 0;
    for (const m of decoded.match(re) ?? []) found.push(m);
  }
  return found;
}

// containsLink: the boolean form for the HARD-REJECT caller (the Dispatcher firewall,
// where a supplier draft must carry ZERO links of any form).
export function containsLink(text: string): boolean {
  return findLinks(text).length > 0;
}
