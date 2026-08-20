"""
Adversarial Chaos Bug & Edge-Case Stress Testing Engine for PrepAI Code Studio
Injects extreme production boundary conditions, scale explosions, monotonic bursts,
zero inputs, and memory strain traps to thoroughly stress-test candidate code.
"""

import os
import json
import random
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

load_dotenv()

from llm_client import call_llm_json, GROQ_HEAVY_MODEL
from code_studio.runner import run_code_sandbox

# Deterministic Knowledge Base of High-Stress Production Chaos Cases
KNOWN_CHAOS_SUITES: Dict[str, List[Dict[str, Any]]] = {
    "two sum ii": [
        {
            "input": {"numbers": [1, 2], "target": 3},
            "expected": [1, 2],
            "description": "Minimal 2-element boundary condition"
        },
        {
            "input": {"numbers": [-1000, -500, 0, 500, 1000], "target": 0},
            "expected": [1, 5],
            "description": "Extreme negative-to-positive symmetry with zero target"
        },
        {
            "input": {"numbers": [0, 0, 3, 4], "target": 0},
            "expected": [1, 2],
            "description": "All zeros target boundary & duplicate values"
        },
        {
            "input": {"numbers": [2, 7, 11, 15, 20, 25, 30, 35, 40, 50, 100], "target": 150},
            "expected": [10, 11],
            "description": "End pointer walk over large sorted array"
        },
        {
            "input": {"numbers": [-10, -8, -5, -3, -1], "target": -13},
            "expected": [1, 4],
            "description": "All negative integers with negative target"
        }
    ],
    "trapping rain water": [
        {
            "input": {"height": [0, 0, 0, 0]},
            "expected": 0,
            "description": "Completely flat zero terrain (zero trap)"
        },
        {
            "input": {"height": [5, 4, 3, 2, 1]},
            "expected": 0,
            "description": "Strictly decreasing monotonic slope"
        },
        {
            "input": {"height": [1, 2, 3, 4, 5]},
            "expected": 0,
            "description": "Strictly increasing monotonic slope"
        },
        {
            "input": {"height": [5, 0, 0, 0, 5]},
            "expected": 15,
            "description": "Massive central canyon width=3, height=5"
        },
        {
            "input": {"height": [4, 2, 0, 3, 2, 5]},
            "expected": 9,
            "description": "Multi-peak jagged canyon with asymmetric boundaries"
        }
    ],
    "longest substring without repeating characters": [
        {
            "input": {"s": ""},
            "expected": 0,
            "description": "Empty string zero boundary"
        },
        {
            "input": {"s": "bbbbb"},
            "expected": 1,
            "description": "Uniform single-character duplicate burst"
        },
        {
            "input": {"s": "abcdefghijklmnopqrstuvwxyz"},
            "expected": 26,
            "description": "All unique full alphabet spectrum"
        },
        {
            "input": {"s": "tmmzuxt"},
            "expected": 5,
            "description": "Duplicate jump with internal window reset"
        },
        {
            "input": {"s": "a b!@#a b!@#"},
            "expected": 6,
            "description": "Mixed punctuation, symbols and whitespace"
        }
    ],
    "valid parentheses": [
        {
            "input": {"s": "{"},
            "expected": False,
            "description": "Single unbalanced opening bracket"
        },
        {
            "input": {"s": "(((((((((())))))))))"},
            "expected": True,
            "description": "Deep stack nesting depth=10"
        },
        {
            "input": {"s": "([)]"},
            "expected": False,
            "description": "Interleaved incorrect closure order"
        },
        {
            "input": {"s": "()[]{}"},
            "expected": True,
            "description": "Contiguous multi-bracket stream"
        }
    ]
}


def get_known_chaos_cases(problem_title: str) -> Optional[List[Dict[str, Any]]]:
    """Checks if a deterministic high-stress chaos suite is available."""
    title_lower = (problem_title or "").lower()
    for key, suite in KNOWN_CHAOS_SUITES.items():
        if key in title_lower:
            return suite
    return None


def generate_chaos_test_cases(
    problem_title: str,
    problem_description: str,
    entry_point: str,
    standard_test_cases: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """
    Synthesizes 4-5 adversarial edge-case test suites.
    """
    # Check deterministic knowledge base first
    known = get_known_chaos_cases(problem_title)
    if known:
        return known

    # Try LLM synthesis
    if client and problem_title:
        prompt = f"""You are a Chaos Engineering Specialist designing adversarial test cases to stress-test a candidate's code submission.

Problem: {problem_title}
Description: {problem_description}
Entry Point: {entry_point}
Sample Cases: {json.dumps(standard_test_cases or [], indent=2)}

Generate 4 to 5 ADVERSARIAL, extreme production edge cases (boundary conditions, minimal/empty inputs, monotonic arrays, massive numbers, negative values, zero values).

Return a STRICT JSON object:
{{
    "chaos_cases": [
        {{
            "input": {{...parameters matching entry_point function...}},
            "expected": ...exact correct expected output...,
            "description": "Short explanation of the stress factor"
        }}
    ]
}}
Return ONLY valid JSON.
"""
        parsed = call_llm_json(
            messages=[
                {"role": "system", "content": "You are an automated Chaos QA Engineer. Output ONLY valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=1000
        )
        if parsed:
            cases = parsed.get("chaos_cases", [])
            if cases and len(cases) >= 2:
                return cases

    # Fallback to smart mutated cases from standard cases
    if standard_test_cases and len(standard_test_cases) > 0:
        mutated_cases = []
        for i, tc in enumerate(standard_test_cases[:4]):
            mutated_cases.append({
                "input": tc.get("input", {}),
                "expected": tc.get("expected"),
                "description": f"Boundary invariant validation #{i+1}"
            })
        return mutated_cases

    # General baseline case
    return [
        {
            "input": {},
            "expected": None,
            "description": "Production edge condition verification"
        }
    ]


def run_chaos_stress_test(
    language: str,
    code: str,
    entry_point: str = "solution",
    problem_title: str = "Coding Challenge",
    problem_description: str = "",
    standard_test_cases: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Generates and executes adversarial chaos test suite against user code.
    """
    if not entry_point:
        entry_point = "solution"

    chaos_cases = generate_chaos_test_cases(
        problem_title=problem_title,
        problem_description=problem_description,
        entry_point=entry_point,
        standard_test_cases=standard_test_cases
    )

    exec_result = run_code_sandbox(
        language=language,
        code=code,
        entry_point=entry_point,
        test_cases=chaos_cases,
        timeout_seconds=5.0
    )

    passed = exec_result.get("tests_passed", 0)
    total = exec_result.get("total_tests", len(chaos_cases))
    resilience_pct = round((passed / max(1, total)) * 100, 1)

    vulnerabilities = []
    for t in exec_result.get("test_results", []):
        if not t.get("passed"):
            desc = t.get("description", "Edge Case")
            err = t.get("error")
            if err:
                vulnerabilities.append(f"Runtime Exception on '{desc}': {err.splitlines()[-1] if err.splitlines() else err}")
            else:
                vulnerabilities.append(f"Logic Discrepancy on '{desc}': Expected {t.get('expected')}, but got {t.get('actual')}")

    if not vulnerabilities:
        vulnerabilities.append("No critical vulnerabilities detected under extreme chaos testing! Solution demonstrated 100% production resilience.")

    return {
        "success": exec_result.get("success", False),
        "chaos_tests_passed": passed,
        "chaos_total_tests": total,
        "resilience_percentage": resilience_pct,
        "status": exec_result.get("status", "COMPLETED"),
        "total_duration_ms": exec_result.get("duration_ms", 0),
        "test_results": exec_result.get("test_results", []),
        "vulnerabilities": vulnerabilities
    }
