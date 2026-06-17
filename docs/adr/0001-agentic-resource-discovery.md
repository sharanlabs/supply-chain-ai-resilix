# ADR-0001 — Agentic Resource Discovery (ARD): considered, expansion-path only

- **Status:** Accepted (decision recorded 2026-06-17)
- **Decision owner:** sharan_98
- **Scope:** RESILIX ActionOps. Companion to PLAN.md §10 (Expansion & adoption).

## Plain English
Google (with Microsoft, Hugging Face, GoDaddy) published a new open standard — **ARD** — for how AI agents *find* and *trust* each other's capabilities across the web. The owner asked: does it apply to RESILIX, and is it worth adopting? Short answer: **not for the product we're building now** (RESILIX uses a small, fixed, hand-vetted set of signal sources and a fixed internal pipeline — there is nothing to "discover"), **but it is exactly the right standard for the day RESILIX is offered as a capability that an enterprise's own AI platform should discover and verify.** So we record the decision, draft precisely what we would publish then, and do not build it now.

## Context (verified live 2026-06-17, multi-source)
ARD ("Agentic Resource Discovery") is a federated, **domain-anchored** standard:
- A provider publishes an **`ai-catalog.json`** at a well-known path on its domain, listing capabilities (**MCP servers, A2A agent cards, Skills, OpenAPI tools, nested catalogs**). **Registries** crawl + index those catalogs so agents can search by intent.
- Domain ownership is the **cryptographic identity root**. Each entry/host can carry a zero-trust **`trustManifest`**: a SPIFFE/DID `identity`, `attestations` (SOC 2 / HIPAA, with sha256 digest), `provenance` lineage, and a detached **JWS `signature`** — so a client **verifies the publisher before connecting**.
- **Status:** v0.9 **draft**, Apache-2.0, multi-vendor working group on the Linux-Foundation "AI Catalog" data model.

Sources: Google Developers Blog announcement; `github.com/ards-project/ard-spec` (`spec/ard.md`, `spec/schemas/ai-catalog.schema.json`); independent coverage (Zylos, IntuitionLabs, TechTimes). **Maturity caveat:** the landscape is unsettled — the published schema's `$id` points at a *different* org (`Agent-Card/agentfinder`) than the `ards-project` repo, the spec site appears as both `.org` and `.io`, and **DNS-AID** (a DNS-record-based discovery standard, also under the Linux Foundation) is a competing approach. No convergence winner yet.

## Decision
1. **Do NOT implement ARD in the MVP.** RESILIX's signal sources (GDELT, NWS, fixture-only USGS/EONET) are **fixed, hardcoded, and vetted**, and the agent core is a **fixed internal workflow** (Anthropic "workflow, not agent"). There is no runtime "which external capability should I connect to?" question to answer. Adding catalog/registry discovery would (a) violate the project's **anti-scope** invariants (no dynamic/autonomous discovery), and (b) introduce a new **untrusted-input** surface (Law 11) for zero current benefit. Forcing it in would be ceremony with no consumer.
2. **Adopt ARD on the EXPANSION path** (PLAN.md §10), *when* RESILIX is offered as a discoverable capability to the named adopter's enterprise agent platform. At that point RESILIX publishes an `ai-catalog.json` + signed `trustManifest` so the enterprise can discover **and cryptographically verify** it before connecting. The concrete draft is below — this is what ships then, not a placeholder.
3. **Keep the durable, model-agnostic principle now, even though we don't adopt the spec:** *domain identity as the trust root + a signed, attested, provenance-bearing manifest, verified before connecting.* This is a documented **fix paired to a documented failure** ("an agent connects to an unverified / spoofed capability") and reinforces — does not replace — the existing evidence-provenance thesis (every claim evidence-linked; `claims[]`/`sourcePath`; the audit trail) and the Phase-7 Dispatcher allowlist. A roadmap-only hardening it suggests: **sign the decision packet and digest its evidence** (cryptographic provenance for the audit trail). Tracked, not built.

## Concrete artifact — the `ai-catalog.json` RESILIX would publish at §10
Schema-valid against `ai-catalog.schema.json` (specVersion 1.0). Served at the ARD well-known path (e.g. `/.well-known/ai-catalog.json`); `did:web` + digests are placeholders filled at deploy.

```json
{
  "specVersion": "1.0",
  "host": {
    "displayName": "RESILIX ActionOps",
    "identifier": "did:web:resilix.example.com",
    "documentationUrl": "https://resilix.example.com/docs",
    "trustManifest": {
      "identity": "did:web:resilix.example.com",
      "identityType": "did",
      "attestations": [
        {
          "type": "SOC2-Type2",
          "uri": "https://resilix.example.com/.well-known/soc2-type2.pdf",
          "mediaType": "application/pdf",
          "digest": "sha256:<filled-at-publish>"
        }
      ],
      "signature": "<detached JWS over this trustManifest>"
    }
  },
  "entries": [
    {
      "identifier": "urn:ai:resilix:supply-chain:disruption-action-packet",
      "displayName": "Supply-chain disruption -> action packet",
      "type": "application/mcp-server-card+json",
      "url": "https://resilix.example.com/.well-known/mcp/disruption-action-packet.json",
      "description": "Given a live disruption signal and a supplier dataset, produce an evidence-cited, HUMAN-APPROVAL-GATED action packet (exposure, ranked recovery options, drafted supplier messages). Deterministic math; the LLM only explains; nothing sends without human approval.",
      "capabilities": [
        "DisruptionExposureMapping",
        "RecoveryOptionGeneration",
        "SupplierMessageDrafting"
      ],
      "representativeQueries": [
        "Which of my suppliers are exposed to a Strait of Hormuz closure?",
        "Draft a recovery plan for a new tariff on Chinese semiconductors."
      ],
      "version": "0.1.0",
      "updatedAt": "2026-06-17T12:00:00Z",
      "metadata": { "humanApprovalRequired": "true" },
      "trustManifest": {
        "identity": "did:web:resilix.example.com",
        "identityType": "did",
        "trustSchema": {
          "identifier": "urn:resilix:trust:v1",
          "version": "1.0",
          "verificationMethods": ["did", "dns-01"]
        },
        "signature": "<detached JWS over this entry's trustManifest>"
      }
    }
  ]
}
```

## Consequences
- **No MVP change.** No new code, dependency, or attack surface now. The signal layer (P3.2) and the agent core stay fixed-source / fixed-pipeline.
- **Expansion-ready.** The artifact above is the exact publish target; only deploy-time values (domain, digests, signature) remain.
- **Doctrine captured.** ARD + DNS-AID logged as *tracked-not-mandated* emerging standards in `~/claude-os/knowledge/source-registry/ai-building.md`, with the durable trust nugget folded toward `agent_building_kb`.

## Revisit triggers
Re-open this ADR when **any** holds: (a) RESILIX enters the expansion build (PLAN §10 — a named adopter wants their agent platform to consume it); (b) ARD leaves draft / a convergence winner emerges among ARD / DNS-AID / MCP-registry; (c) the adopter's enterprise mandates discoverable+verifiable agent capabilities (a real procurement requirement, not a hypothetical).

## References
- Google Developers Blog — *Announcing the Agentic Resource Discovery specification* (2026).
- `github.com/ards-project/ard-spec` — `spec/ard.md` (v0.9 draft), `spec/schemas/ai-catalog.schema.json` (Apache-2.0).
- Independent: Zylos *Agent Interoperability Protocols 2026*; IntuitionLabs *Open Standards for AI Agents*; TechTimes *DNS-AID under Linux Foundation* (2026-06-06).
