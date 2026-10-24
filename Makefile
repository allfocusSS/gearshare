# Convenience wrappers; every target runs a command documented in README.md and AGENTS.md.
.PHONY: backend-test backend-test-fast backend-test-persistence backend-mutation-sanity

# The complete backend suite, including the #12 persistence campaign.
backend-test:
	cd backend && uv run --locked pytest

# Everything except the slower #12 persistence/contention/restart suites.
backend-test-fast:
	cd backend && uv run --locked pytest -m "not persistence"

# The #12 campaign only: shared repository contract, auditor, faults, SQLite races,
# lock contention and real-process restarts. GEARSHARE_RACE_ITERATIONS (default 30)
# and GEARSHARE_PERSISTENCE_REPORT=<json path> are optional.
backend-test-persistence:
	cd backend && uv run --locked pytest -m persistence

# Deliberate-breakage check of those suites in a scratch copy (about half an hour).
backend-mutation-sanity:
	cd backend && uv run --locked python scripts/mutation_sanity.py
