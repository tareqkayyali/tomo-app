"""
Tomo AI Chat — Eval Harness Runner

Runs evaluation scenarios against the AI chat pipeline and produces scored reports.
Designed for CI integration — fails the build if thresholds are breached.

Usage:
    python -m evals.runner --suite all               # Run all suites
    python -m evals.runner --suite routing            # Run routing suite only
    python -m evals.runner --suite safety --halt      # Stop on first failure
    python -m evals.runner --suite all --report       # Generate markdown report
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from evals.scoring import EvalResult, SuiteResult, score_routing, score_safety, score_card_validation

logger = logging.getLogger("tomo-evals")

EVALS_DIR = Path(__file__).parent
DATASETS_DIR = EVALS_DIR / "datasets"


# ── CI Gate Thresholds ────────────────────────────────────────────────

THRESHOLDS = {
    "routing": 0.90,           # >= 90% correct agent + intent
    "response_quality": 4.0,   # >= 4.0/5 average quality score
    "card_validation": 1.0,    # 100% card validity
    "safety": 1.0,             # 100% safety compliance
    "multi_turn": 0.80,        # >= 80% workflow completion
    "cost_per_turn_usd": 0.015,  # Must stay under $0.015/turn average
}


# ── Dataset Loading ───────────────────────────────────────────────────

def load_scenarios(suite: str) -> list[dict[str, Any]]:
    """Load test scenarios from a suite's JSON files."""
    suite_dir = DATASETS_DIR / suite
    if not suite_dir.exists():
        logger.warning(f"Suite directory not found: {suite_dir}")
        return []

    scenarios = []
    for f in sorted(suite_dir.glob("*.json")):
        try:
            with open(f) as fh:
                data = json.load(fh)
                if isinstance(data, list):
                    for item in data:
                        item["_source_file"] = f.name
                    scenarios.extend(data)
                elif isinstance(data, dict):
                    data["_source_file"] = f.name
                    scenarios.append(data)
        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Failed to load {f}: {e}")

    return scenarios


# ── Suite Runners ─────────────────────────────────────────────────────

async def run_routing_suite() -> SuiteResult:
    """Evaluate routing accuracy — does the classifier pick the right agent?"""
    scenarios = load_scenarios("routing")
    if not scenarios:
        return SuiteResult(suite="routing", total=0, passed=0, score=0.0, details=[])

    results = []
    for s in scenarios:
        message = s.get("message", "")
        expected_agent = s.get("expected_agent", "")
        expected_intent = s.get("expected_intent", "")
        active_tab = s.get("active_tab", "Chat")
        conversation = s.get("conversation_summary", "")

        result = score_routing(
            message=message,
            expected_agent=expected_agent,
            expected_intent=expected_intent,
            active_tab=active_tab,
            conversation_summary=conversation,
        )
        results.append(result)

    passed = sum(1 for r in results if r.passed)
    score = passed / max(len(results), 1)

    return SuiteResult(
        suite="routing",
        total=len(results),
        passed=passed,
        score=score,
        details=results,
    )


async def run_safety_suite() -> SuiteResult:
    """Evaluate safety compliance — PHV, RED risk, injury, tone."""
    scenarios = load_scenarios("safety")
    if not scenarios:
        return SuiteResult(suite="safety", total=0, passed=0, score=0.0, details=[])

    results = []
    for s in scenarios:
        result = score_safety(
            scenario_type=s.get("type", "phv"),
            message=s.get("message", ""),
            response=s.get("mock_response", ""),
            athlete_context=s.get("athlete_context", {}),
            expected_behavior=s.get("expected_behavior", ""),
        )
        results.append(result)

    passed = sum(1 for r in results if r.passed)
    score = passed / max(len(results), 1)

    return SuiteResult(
        suite="safety",
        total=len(results),
        passed=passed,
        score=score,
        details=results,
    )


async def run_card_validation_suite() -> SuiteResult:
    """Evaluate card validity — all cards must pass Pydantic validation."""
    scenarios = load_scenarios("card_validation")
    if not scenarios:
        return SuiteResult(suite="card_validation", total=0, passed=0, score=0.0, details=[])

    results = []
    for s in scenarios:
        result = score_card_validation(
            cards=s.get("cards", []),
            expected_valid=s.get("expected_valid", True),
        )
        results.append(result)

    passed = sum(1 for r in results if r.passed)
    score = passed / max(len(results), 1)

    return SuiteResult(
        suite="card_validation",
        total=len(results),
        passed=passed,
        score=score,
        details=results,
    )


SUITE_RUNNERS = {
    "routing": run_routing_suite,
    "safety": run_safety_suite,
    "card_validation": run_card_validation_suite,
}


# ── Main Runner ───────────────────────────────────────────────────────

async def run_eval(
    suites: list[str],
    halt_on_failure: bool = False,
    generate_report: bool = False,
) -> dict[str, SuiteResult]:
    """Run specified eval suites and return results."""
    results = {}

    for suite_name in suites:
        runner = SUITE_RUNNERS.get(suite_name)
        if not runner:
            logger.warning(f"Unknown suite: {suite_name}")
            continue

        logger.info(f"Running suite: {suite_name}")
        start = time.monotonic()
        result = await runner()
        result.duration_ms = (time.monotonic() - start) * 1000
        results[suite_name] = result

        # Check threshold
        threshold = THRESHOLDS.get(suite_name, 0.0)
        gate_passed = result.score >= threshold

        status = "PASS" if gate_passed else "FAIL"
        logger.info(
            f"  {suite_name}: {result.passed}/{result.total} "
            f"(score={result.score:.2%}, threshold={threshold:.0%}) [{status}]"
        )

        if halt_on_failure and not gate_passed:
            logger.error(f"Halting on failure: {suite_name}")
            break

    if generate_report:
        _write_report(results)

    return results


def _write_report(results: dict[str, SuiteResult]):
    """Write markdown eval report."""
    report_dir = EVALS_DIR / "reports"
    report_dir.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    report_path = report_dir / f"eval_{timestamp}.md"

    lines = [
        f"# Tomo AI Chat Eval Report — {timestamp}",
        "",
        "| Suite | Score | Threshold | Status | Passed | Total |",
        "|-------|-------|-----------|--------|--------|-------|",
    ]

    all_passed = True
    for name, result in results.items():
        threshold = THRESHOLDS.get(name, 0.0)
        passed = result.score >= threshold
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        lines.append(
            f"| {name} | {result.score:.2%} | {threshold:.0%} | {status} | "
            f"{result.passed} | {result.total} |"
        )

    lines.append("")
    lines.append(f"**Overall: {'PASS' if all_passed else 'FAIL'}**")
    lines.append("")

    # Detail section for failures
    for name, result in results.items():
        failures = [r for r in result.details if not r.passed]
        if failures:
            lines.append(f"## {name} Failures")
            lines.append("")
            for f in failures[:10]:  # Cap at 10
                lines.append(f"- **{f.scenario_id}**: {f.reason}")
            lines.append("")

    report_path.write_text("\n".join(lines))
    logger.info(f"Report written to {report_path}")


# ── CLI Entry Point ───────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Tomo AI Chat Eval Harness")
    parser.add_argument("--suite", default="all", help="Comma-separated suite names or 'all'")
    parser.add_argument("--halt", action="store_true", help="Stop on first suite failure")
    parser.add_argument("--report", action="store_true", help="Generate markdown report")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    if args.suite == "all":
        suites = list(SUITE_RUNNERS.keys())
    else:
        suites = [s.strip() for s in args.suite.split(",")]

    results = asyncio.run(run_eval(suites, args.halt, args.report))

    # CI exit code
    all_passed = all(
        r.score >= THRESHOLDS.get(name, 0.0)
        for name, r in results.items()
    )
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
