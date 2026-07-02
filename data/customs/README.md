# data/customs — the D0 corpus layer

**Plain English:** the public government documents the customs-defense product is built and
tested against. Fetched documents live in `cache/` (gitignored — big and re-fetchable);
the committed record is `corpus-manifest.json`, which says per source: what was fetched,
from where, how many records, and **as of when**. Refresh any time with `npm run customs:ingest`.

**The boundary (plan §4 C17 — machine doors only):** ingestion is wired exclusively to
sources that offer a programmatic door. Sources that 403-block fetchers are the **owner
browser queue** — their absence is designed around (synthetics or refusal), never scraped
around and never faked:

| Source | Status |
|---|---|
| Federal Register API (EO 14411 primary + CBP docs + EAPA-term docs) | ✅ machine door (`fr`) |
| OpenSanctions UFLPA entity list (slug resolved from the live index) | ✅ machine door (`opensanctions`) |
| USITC HTS REST `/reststop/search` (`exportList` 400s as of 2026-07-02) | ✅ machine door (`hts`) |
| CourtListener v4 search — EAPA opinions, CIT/CAFC | ✅ machine door (`courtlistener`) |
| CSMS via GovDelivery (rule-tracking leg, SC7) | ⏳ later D0.1 increment |
| GovInfo API (needs a free api.data.gov key) / Census API | ⏳ later increment (owner key) |
| CBP dashboards, EAPA case PDFs on cbp.gov, FOIA reading room, EDIS | 🚫 **owner browser queue** |
| CROSS rulings (rulings.cbp.gov — not a §9A machine door) | 🚫 owner browser queue |

Every corpus claim downstream must cite the manifest's `asOf` — verify-over-memory (plan §4 C18).
