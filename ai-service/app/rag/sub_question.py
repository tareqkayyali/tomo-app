"""
Tomo AI Service — Sub-Question Engine for Multi-Hop Queries
Decomposes complex queries into simpler sub-questions for targeted retrieval.

Only triggers for complex queries (>12 words with multiple knowledge domains).
Uses Haiku for fast, cheap decomposition (~$0.0001/call).

Example:
  Input: "What exercises should I avoid during my growth spurt and what safe alternatives exist?"
  Output: [
    "What exercises are contraindicated during Peak Height Velocity?",
    "What are safe alternative exercises for PHV athletes?"
  ]
"""

from __future__ import annotations

import json
import logging
import os
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import get_settings

logger = logging.getLogger("tomo-ai.rag.sub_question")

# Minimum word count to trigger decomposition
MIN_WORDS_FOR_DECOMPOSITION = 12

# Domain keywords that suggest multi-hop potential
MULTI_DOMAIN_KEYWORDS = {
    "phv": {"growth", "spurt", "height", "maturity", "phv", "growth plate"},
    "load": {"acwr", "load", "overtraining", "volume", "intensity", "deload"},
    "readiness": {"readiness", "recovery", "rest", "red", "amber", "hrv"},
    "injury": {"injury", "pain", "return to play", "prevention", "risk"},
    "training": {"exercise", "drill", "training", "workout", "program"},
    "academic": {"exam", "school", "study", "academic", "dual load"},
    "nutrition": {"nutrition", "diet", "fueling", "hydration", "eating"},
}

DECOMPOSITION_PROMPT = """You are a sports science query analyzer. Decompose this complex athlete query into 2-3 simpler sub-questions that can be independently answered.

Rules:
- Each sub-question should target a SINGLE knowledge domain
- Keep sub-questions specific and actionable
- Preserve the athlete's intent
- Output ONLY a JSON array of strings, no other text

Example input: "How does high training load during PHV affect injury risk, and what recovery protocols should I follow?"
Example output: ["What injury risks are associated with high training load during PHV?", "What recovery protocols are recommended for PHV athletes with high ACWR?"]

Input query: {query}"""


async def decompose_query(query: str) -> list[str]:
    """
    Decompose a complex query into sub-questions for multi-hop retrieval.

    Returns the original query as a single-element list if:
    - Query is too short (<12 words)
    - Query doesn't span multiple domains
    - LLM decomposition fails (graceful fallback)

    Returns:
        List of 1-3 sub-questions.
    """
    # Check if decomposition is warranted
    words = query.lower().split()
    if len(words) < MIN_WORDS_FOR_DECOMPOSITION:
        return [query]

    # Check for multi-domain keywords
    domains_found = set()
    query_lower = query.lower()
    for domain, keywords in MULTI_DOMAIN_KEYWORDS.items():
        if any(kw in query_lower for kw in keywords):
            domains_found.add(domain)

    if len(domains_found) < 2:
        return [query]

    # Use Haiku for decomposition
    try:
        settings = get_settings()
        api_key = settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY", "")

        llm = ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            temperature=0.0,
            max_tokens=256,
            api_key=api_key,
        )

        response = await llm.ainvoke([
            SystemMessage(content="You decompose complex sports science queries into simpler sub-questions. Output ONLY a JSON array."),
            HumanMessage(content=DECOMPOSITION_PROMPT.format(query=query)),
        ])

        text = response.content.strip()
        sub_questions = _parse_sub_questions(text)

        if sub_questions and len(sub_questions) >= 2:
            logger.info(f"Decomposed query into {len(sub_questions)} sub-questions")
            return sub_questions

    except Exception as e:
        logger.warning(f"Sub-question decomposition failed: {e}")

    # Fallback: return original query
    return [query]


def should_decompose(query: str) -> bool:
    """
    Quick check whether a query is complex enough to warrant decomposition.
    Used by the retriever to decide whether to call decompose_query().
    """
    words = query.lower().split()
    if len(words) < MIN_WORDS_FOR_DECOMPOSITION:
        return False

    query_lower = query.lower()
    domains_found = 0
    for keywords in MULTI_DOMAIN_KEYWORDS.values():
        if any(kw in query_lower for kw in keywords):
            domains_found += 1
            if domains_found >= 2:
                return True

    return False


def _parse_sub_questions(text: str) -> list[str]:
    """Parse LLM output into a list of sub-questions."""
    # Try direct JSON parse
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list) and all(isinstance(q, str) for q in parsed):
            return parsed
    except json.JSONDecodeError:
        pass

    # Try extracting JSON array from text
    match = re.search(r'\[.*\]', text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, list) and all(isinstance(q, str) for q in parsed):
                return parsed
        except json.JSONDecodeError:
            pass

    return []
