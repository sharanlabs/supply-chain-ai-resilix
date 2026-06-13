# US Disruption Landscape — research snapshot (2026-06-12)

Build input for ActionOps scenarios, seed data, and Sentinel design. US-primary per owner directive 2026-06-12. All claims cited in source research (research-specialist run a7d5a241aa1319d68); key sources inline.

## The mid-2026 reality (what a US procurement analyst is firefighting NOW)

1. **Iran war / Strait of Hormuz — THE disruption of 2026.** Effectively closed since ~Mar 2; IEA: "largest supply disruption in the history of the global oil market." Shanghai→Jebel Ali spot $1,800→$4,000+/FEU in 48h; $3,000/FEU emergency surcharges; jet fuel ~2x; Asia→N.America air rates +mid/high double digits. De-escalation talks live as of Jun 11 — crude fell below $84. (UANI Jun 4; EIA STEO Jun 9; CNBC Jun 11)
2. **Tariff whiplash, not steady-state tariffs.** SCOTUS killed IEEPA tariffs 6–3 (*Learning Resources v. Trump*, 2026-02-20). Rebuilt on §232 (steel/alu 50%, copper 50%, autos 25%, semis 25%) + new §301 investigations. China: ~30% combined, higher rates paused 60 days as of Jun 11 (expires ~Aug 10). Plus the $166B IEEPA refund scramble (CBP CAPE portal; May 29 "finally liquidated" reversal). Deadline-driven chaos > static rates.
3. **Red Sea/Suez re-frozen** by the war; Cape of Good Hope default through ≥2027; Asia–USEC +15–25% rates, +10–14 days.
4. **Domestic trucking capacity shock (regulatory, not demand):** FMCSA English-proficiency OOS enforcement + non-domiciled CDL rule (eff. 2026-03-16, ~5–12% of CDL pool exiting); record spot rates (~$3.83/mi single-sourced); van load-to-truck +92% YoY.
5. **Memory/semiconductor allocation crisis:** DRAM +90–95% QoQ (Q1 2026); AI datacenters consume ~70% of memory output; industrial/PC buyers on allocation into 2027. Spills over to ANY product with controller boards (HVAC, industrial equipment).
6. **ISM May 2026:** PMI 54.0 (4-yr high) yet 57% cite pricing volatility; war in 42% of comments vs tariffs 18%; "extreme uncertainty… price stability and longer-term supply continuity." NAM Q1: mid-sized firms (50–499) rank healthcare #1 (78%), trade #2 (67%).
7. **Hurricane season:** below-normal forecast (El Niño arrived) — but El Niño threatens Panama Canal water late 2026. Precedent for severity: Helene→Baxter North Cove (60% of US IV fluid).

## Demo scenario decision

**Primary demo = parameterized Gulf chokepoint closure (Hormuz).** Live, dominant, US-impacting, and maps onto existing `evaluation/atlas_test1_hormuz.json` assets. Build as parameterized event (closure %, surcharge level, duration 3/7/14/30d) — NOT hard-coded headlines (peace talks may resolve it within weeks). Secondary seeds: tariff 60-day countdown; trucking capacity shock.

## Eval scenario shortlist (pick 10)

1. Gulf chokepoint closure (Hormuz, live 2026) — surcharge triage, lane re-quote, petrochem BOM repricing
2. Tariff regime whiplash + 60-day countdown (SCOTUS Feb 20 → §232/301 rebuild → Aug 10 expiry) — landed-cost re-runs, pre-buy vs wait
3. Red Sea/Suez diversion persistence — safety-stock + routing-mix reset (Asia→USEC)
4. Memory/semi allocation shock (DRAM 2026) — allocation negotiation, broker counterfeit risk
5. Domestic trucking regulatory capacity shock (FMCSA 2026) — contract/spot rebalance, carrier screening
6. Hurricane strike on single-source plant (Helene→Baxter precedent; NHC feed trigger)
7. Supplier bankruptcy w/ sudden liquidation (First Brands Ch.11→Ch.7, Jan 2026) — PO exposure, tooling recovery
8. Ransomware at tier-1 (JLR Aug 2025 £1.9B; Foxconn/Nitrogen May 2026) — portal outage, status blackout
9. Export-control squeeze on a component (Nexperia Oct–Nov 2025; Honda −110k units)
10. Panama Canal El Niño re-tightening (late-2026 risk) — USEC routing, auction cost modeling
11. Blank-sailing whipsaw (Feb 2026 +122% cancellations) — booking-confirmation risk on key POs
12. War-linked pharma/API shortage (Jordan 48% amoxicillin susp.; Israel+Jordan 73% flumazenil API)

Zero-exposure control case (existing atlas_test3 pattern) stays as a hallucination check.

## Signal sources — LIVE-TESTED with curl, 2026-06-12 09:20–09:25 EDT (not just claimed)

| Source | Status | Notes |
|---|---|---|
| GDELT DOC 2.0 API | ✅ verified working | No key. Returns live mid-2026 articles. CAVEAT: rolling ~3-month full-text window → Sentinel must persist events |
| NWS api.weather.gov | ✅ verified working | No key; REQUIRES User-Agent header |
| USGS earthquake GeoJSON | ✅ verified working | No key; 14 M4.5+ quakes returned |
| NASA EONET v3 | ✅ working (flaky) | Transient "high demand" rate-limiting observed; retry logic mandatory (app already has fallback) |
| NHC CurrentStorms.json | ✅ verified working | No key; activeStorms:[] (quiet season, consistent w/ El Niño forecast) |
| openFDA drug shortages | ✅ verified working | No key for low volume; key raises rate limits |
| Census Intl Trade API | ⚠️ KEY REQUIRED | Returns 302→"Missing Key" without one. Free signup. Research agent's "no key" claim was WRONG — corrected by live test |
| FMCSA QCMobile API | ⚠️ KEY REQUIRED | 404 without webKey; free registration |
| Open-Meteo (api.open-meteo.com) | ❌ DNS SERVFAIL on 2026-06-12 | Root domain resolves (200) but API subdomain fails Google DNS. **This is one of the EXISTING app's 4 fetchers — currently broken.** US-first build: replace with NWS gridpoint forecasts (US coverage superior anyway) |

**Build rule (owner directive 2026-06-12): never claim a source works without a dated live test; re-verify at each build phase that touches it.**

## Open items

- Legal authority behind residual 30% China tariff is murky — verify before encoding rates in seed data
- $3.83/mi truckload record + 5x broker-insurance figures are single-sourced — practitioner-candidates, don't build claims on them
- NAM Q2 2026 survey contents unretrieved
