# Project Learnings (lessons.md)

> One line per mistake, never deleted. Review at session start. Same mistake twice = the system failed.

- P2.3 (2026-06-13, Codex [Med]): a read-compat/normalizer must only UPGRADE unambiguously-legacy payloads (keyed off a definite legacy signal, e.g. a missing version discriminant) — never "repair" a current/versioned payload. Silent repair of a malformed current packet masks a real bug; let the schema fail loudly. (First draft over-reached by backfilling modes regardless of version.)
