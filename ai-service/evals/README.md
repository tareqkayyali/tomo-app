# Tomo AI Evals

## Layout

- `runner.py` — top-level suite runner (routing, safety, card_validation today)
- `scoring.py` — pure-function scorers used by the runner
- `datasets/` — JSON scenario files per suite
- `evaluators/` — suite-specific evaluators (e.g., `routing_evaluator.py`)
- `fixtures/` — synthetic athlete pool for eval scenarios (see `fixtures/README.md`)
- `reports/` — markdown report output (gitignored except `.gitkeep`)

## Suites

| Name | What it does | API calls? | Threshold | Typical cost |
|---|---|---|---|---|
| `routing_dataset_shape` | Validates JSON integrity of the routing dataset (renamed from old `routing`) | No | 100% | Design |
| `routing_live` | Calls the real Sonnet classifier against every routing scenario | Yes | 90% | ~Design.006 / run |
| `safety` | Tests scoring logic against PHV / readiness / CCRS negative controls | No | 100% | Design |
| `card_validation` | Validates LLM-generated card shapes via Pydantic | No | 100% | Design |

## Running locally

```bash
cd ai-service
source .venv/bin/activate

# Free suites only
python -m evals.runner --suite routing_dataset_shape
python -m evals.runner --suite safety --halt
python -m evals.runner --suite card_validation

# Live Sonnet classifier — makes real API calls
python -m evals.runner --suite routing_live

# All suites (includes routing_live, so makes API calls)
python -m evals.runner --suite all

# Persist results to Supabase (surfaces in CMS AI Health → Eval System)
python -m evals.runner --suite routing_live --persist

# Strict persist (fail the run if Supabase write fails — use for nightly/baseline)
python -m evals.runner --suite all --persist --persist-required

# Generate a markdown report under reports/
python -m evals.runner --suite all --report
```

## CI gate: Meta-Eval Scoring Tests

The scorer itself is tested by `tests/test_eval_scoring.py` (29 cases).
These run on every PR that touches `ai-service/**` via the
`meta-eval-scoring` job in `.github/workflows/ci.yml`.

**Why it exists:** In April 2026 the scorer had a 73% false-negative rate
(safety suite reporting 11/15 when it should have been 15/15). Commit
`c3763e6` fixed three bugs:
1. `SHOULD FAIL` inversion — negative-control scenarios now pass when the
   scorer correctly catches their deliberate violation
2. PHV negation window — `"instead of a 1RM"` no longer triggers the 1RM
   contraindication check
3. Red-risk intensity veto — now enforced when the scorer rejects advice

If the safety suite ever regresses from 100%, **check the harness first**
(negation window = 20 chars, intensity markers list in `scoring.py`)
before looking at the pipeline.

## Contributor policy

**Every new scenario added to `datasets/` requires a matching case in
`tests/test_eval_scoring.py`.**

A scenario proves the pipeline does the right thing. A scoring test proves
the harness correctly grades the scenario. Without both, a green eval
might be masking a broken scorer.

- Add a scenario → add at least one positive-control test (passes when
  the ideal response is scored) and one negative-control test (passes
  when a deliberately-wrong response is scored `fail`).
- Update `SHOULD FAIL` scenarios — add tests confirming the inversion
  still fires.
- Change the scoring regex / keyword list / threshold — add tests
  covering both the old and new behaviour so the change is visible in
  the diff.
