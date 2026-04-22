"""
Tomo AI Chat — Live Routing Evaluator

Calls the actual Sonnet classifier against eval scenarios and scores results.
This is the integration test — verifies the classifier produces correct
agent + intent for real user messages.

Usage:
    python -m evals.evaluators.routing_evaluator
    python -m evals.evaluators.routing_evaluator --verbose
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
from pathlib import Path

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from evals.scoring import EvalResult, SuiteResult

logger = logging.getLogger("tomo-evals.routing")

DATASETS_DIR = Path(__file__).parent.parent / "datasets" / "routing"


# Model identifier for ai_eval_results.model_used. Kept in sync with
# app/agents/sonnet_classifier.py so telemetry can trend drift across models.
LIVE_CLASSIFIER_MODEL = "claude-sonnet-4-6"


async def run_live_routing_eval(
    verbose: bool = False,
    print_summary: bool = True,
) -> SuiteResult:
    """
    Run routing eval scenarios against the live Sonnet classifier.

    Loads scenarios from datasets/routing/*.json, calls classify_with_sonnet()
    for each, and scores the results. When invoked from runner.py, pass
    `print_summary=False` to avoid duplicate output.
    """
    from app.agents.sonnet_classifier import classify_with_sonnet

    # Load all routing scenarios
    scenarios = []
    for f in sorted(DATASETS_DIR.glob("*.json")):
        with open(f) as fh:
            data = json.load(fh)
            if isinstance(data, list):
                scenarios.extend(data)

    if not scenarios:
        logger.warning("No routing scenarios found")
        return SuiteResult(suite="routing_live", total=0, passed=0, score=0.0)

    results: list[EvalResult] = []
    total_cost = 0.0
    total_latency = 0.0

    for i, s in enumerate(scenarios):
        message = s.get("message", "")
        expected_agent = s.get("expected_agent", "")
        expected_intent = s.get("expected_intent", "")
        expected_second = s.get("expected_second_agent")
        conversation = s.get("conversation_summary", "")

        try:
            result = await classify_with_sonnet(
                message=message,
                conversation_summary=conversation,
                active_tab=s.get("active_tab", "Chat"),
            )

            total_cost += result.cost_usd
            total_latency += result.latency_ms

            # Score: agent match + intent match + second agent match
            agent_match = result.agent == expected_agent
            intent_match = result.intent == expected_intent
            second_match = (
                result.requires_second_agent == expected_second
                if expected_second is not None
                else True  # No second agent expected — any result is fine
            )

            if agent_match and intent_match:
                score = 1.0
                passed = True
                reason = "Exact match"
            elif agent_match:
                score = 0.5
                passed = True  # Agent correct is a pass
                reason = f"Agent correct ({expected_agent}), intent wrong (got {result.intent}, expected {expected_intent})"
            else:
                score = 0.0
                passed = False
                reason = f"Wrong agent: got {result.agent}, expected {expected_agent} (intent: got {result.intent}, expected {expected_intent})"

            if expected_second and not second_match:
                reason += f" | Second agent wrong: got {result.requires_second_agent}, expected {expected_second}"
                score = max(0, score - 0.25)

            eval_result = EvalResult(
                scenario_id=f"routing_live:{i}:{message[:30]}",
                passed=passed,
                score=score,
                reason=reason,
                details={
                    # Keys read by the persister (evals/persister.py convention)
                    "expected": {
                        "agent": expected_agent,
                        "intent": expected_intent,
                        "second_agent": expected_second,
                    },
                    "actual": {
                        "agent": result.agent,
                        "intent": result.intent,
                        "confidence": result.confidence,
                        "requires_second_agent": result.requires_second_agent,
                    },
                    "latency_ms": int(result.latency_ms),
                    "cost_usd": float(result.cost_usd),
                    "model_used": LIVE_CLASSIFIER_MODEL,
                    # Convenience fields for local/markdown report inspection
                    "message": message,
                },
            )
            results.append(eval_result)

            if verbose:
                status = "PASS" if passed else "FAIL"
                print(
                    f"  [{status}] {message[:50]:<50} "
                    f"→ {result.agent}/{result.intent} "
                    f"(conf={result.confidence:.2f}, {result.latency_ms:.0f}ms)"
                )

        except Exception as e:
            results.append(EvalResult(
                scenario_id=f"routing_live:{i}:{message[:30]}",
                passed=False,
                score=0.0,
                reason=f"Classifier error: {str(e)[:100]}",
                details={
                    "expected": {
                        "agent": expected_agent,
                        "intent": expected_intent,
                        "second_agent": expected_second,
                    },
                    "actual": None,
                    "model_used": LIVE_CLASSIFIER_MODEL,
                    "message": message,
                },
            ))
            if verbose:
                print(f"  [ERROR] {message[:50]}: {e}")

    passed_count = sum(1 for r in results if r.passed)
    total_score = sum(r.score for r in results) / max(len(results), 1)

    suite_result = SuiteResult(
        suite="routing_live",
        total=len(results),
        passed=passed_count,
        score=total_score,
        details=results,
    )

    if print_summary:
        print(f"\n{'='*60}")
        print(f"Routing Eval: {passed_count}/{len(results)} passed ({total_score:.1%})")
        print(f"Total cost: ${total_cost:.4f} | Avg latency: {total_latency / max(len(results), 1):.0f}ms")
        print(f"Threshold: 90% | {'PASS' if total_score >= 0.90 else 'FAIL'}")
        print(f"{'='*60}")

    return suite_result


async def main():
    logging.basicConfig(level=logging.WARNING)
    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    result = await run_live_routing_eval(verbose=verbose)
    sys.exit(0 if result.score >= 0.90 else 1)


if __name__ == "__main__":
    asyncio.run(main())
