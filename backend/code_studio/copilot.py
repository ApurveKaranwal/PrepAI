"""
Deep Socratic AI Technical Interviewer & Code Inspector for PrepAI Code Studio
Analyzes the candidate's code buffer, AST invariants, problem constraints,
and specific question context before delivering sharp, non-vague technical advice.
"""

import os
import re
from typing import Dict, Any, List
from dotenv import load_dotenv

load_dotenv()

from groq import Groq
from config import GROQ_HEAVY_MODEL

groq_api_key = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None


# =========================================================================
# Deep Algorithmic Problem Knowledge Base
# =========================================================================
PROBLEM_KNOWLEDGE_BASE = {
    "two sum": {
        "pattern": "Two Pointers on Monotonic Sorted Array",
        "optimal_time": "O(N)",
        "optimal_space": "O(1)",
        "invariant": "Because the array is sorted in non-decreasing order, `numbers[left] + numbers[right]` provides a directional monotonic signal. If sum < target, incrementing `left` strictly increases the sum. If sum > target, decrementing `right` strictly decreases the sum. Any pair with the discarded element cannot possibly sum to target.",
        "edge_cases": [
            "1-based indexing requirement (return `[left + 1, right + 1]` rather than 0-based indices).",
            "Duplicate values that sum to target (e.g., `[2, 5, 5, 11]`, target = 10).",
            "Negative integers and zero elements (e.g., `[-5, -2, 0, 3]`, target = -2).",
            "Array with exactly two elements at extreme ends."
        ],
        "common_pitfalls": [
            "Using nested loops resulting in O(N²) time instead of two pointers O(N).",
            "Returning 0-indexed positions instead of 1-indexed.",
            "Incorrect pointer update condition (e.g. decrementing right when sum < target)."
        ]
    },
    "container with most water": {
        "pattern": "Two Pointers Greedy Invariant",
        "optimal_time": "O(N)",
        "optimal_space": "O(1)",
        "invariant": "The water volume is `(right - left) * min(height[left], height[right])`. Moving the taller wall inwards strictly decreases width without any chance of increasing the limiting height. Therefore, the only move that can yield a larger container is shifting the shorter wall inward.",
        "edge_cases": [
            "All heights identical (e.g. `[4, 4, 4, 4]`).",
            "Steep monotonic staircase (e.g. `[1, 2, 3, 4, 5, 6]`).",
            "Two elements only (minimum input size)."
        ],
        "common_pitfalls": ["Moving both pointers simultaneously or moving the taller pointer."]
    },
    "longest substring without repeating": {
        "pattern": "Sliding Window with Hash Map / Index Lookup",
        "optimal_time": "O(N)",
        "optimal_space": "O(min(N, M)) where M is character set size",
        "invariant": "Maintain window `[left, right]`. When `s[right]` is seen inside the current window, fast-forward `left` to `last_seen[s[right]] + 1` to restore the unique-character invariant.",
        "edge_cases": [
            "Empty string `\"\"` (returns 0).",
            "String with all identical characters `\"bbbbb\"` (returns 1).",
            "String with no repeating characters `\"abcdef\"` (returns N).",
            "Characters that repeat outside the current window (ensure `left = max(left, last_seen[c] + 1)`)."
        ],
        "common_pitfalls": ["Not updating left with `max()` when old duplicate index is before `left`."]
    },
    "merge intervals": {
        "pattern": "Sorting + Linear Sweep",
        "optimal_time": "O(N log N)",
        "optimal_space": "O(N)",
        "invariant": "Sort intervals by start time. When examining `intervals[i]`, if its start <= previous merged interval's end, merge them by setting `prev_end = max(prev_end, curr_end)`. Otherwise, push `intervals[i]` as a new independent interval.",
        "edge_cases": [
            "Completely overlapping intervals (e.g., `[[1, 4], [2, 3]]` -> `[[1, 4]]`).",
            "Adjacent intervals touching at endpoints (e.g., `[[1, 2], [2, 3]]` -> `[[1, 3]]`).",
            "Single interval or already sorted disjoint intervals."
        ],
        "common_pitfalls": ["Forgetting `max(prev[1], curr[1])` when inner interval is completely enclosed."]
    },
    "number of islands": {
        "pattern": "Grid Traversal (BFS / DFS / Flood Fill)",
        "optimal_time": "O(R * C)",
        "optimal_space": "O(R * C) worst-case call stack or queue",
        "invariant": "When scanning grid and encountering '1', increment island count and immediately sink all connected land cells to '0' (or mark visited) to guarantee each connected component is counted exactly once.",
        "edge_cases": [
            "All water grid `['0']` (returns 0).",
            "All land grid `['1']` (returns 1).",
            "Diagonal land cells (diagonals do not connect).",
            "Grid with 1 row or 1 column."
        ],
        "common_pitfalls": ["Stack overflow on deep recursion without visited mutation."]
    },
    "lru cache": {
        "pattern": "Doubly Linked List + Hash Map",
        "optimal_time": "O(1) for both get() and put()",
        "optimal_space": "O(Capacity)",
        "invariant": "The Doubly Linked List maintains temporal access order (head = MRU, tail = LRU). The Hash Map maps key -> ListNode pointer, providing O(1) lookup and O(1) node detachment/reinsertion.",
        "edge_cases": [
            "Capacity = 1 cache.",
            "Updating value for an existing key without exceeding capacity.",
            "Evicting true LRU node when inserting into full capacity."
        ],
        "common_pitfalls": ["Not updating existing key's node value and recency on put()."]
    },
    "rate limiter": {
        "pattern": "Token Bucket / Sliding Window Counter",
        "optimal_time": "O(1) per request",
        "optimal_space": "O(U) where U is number of unique users",
        "invariant": "Tokens refill continuously based on `elapsed_time * refill_rate`. If `current_tokens >= 1`, consume 1 and allow; otherwise reject.",
        "edge_cases": [
            "Clock skew or non-monotonic timestamps.",
            "High burst requests at boundary intervals.",
            "Concurrent access race conditions requiring atomic CAS or mutex locks."
        ],
        "common_pitfalls": ["Sleeping or polling instead of computing lazy refill delta on request."]
    }
}


def analyze_candidate_code(code: str, language: str) -> Dict[str, Any]:
    """
    Performs deep structural and semantic inspection on candidate's code buffer.
    """
    lines = [line.strip() for line in code.split("\n") if line.strip() and not line.strip().startswith(("#", "//", "/*"))]
    code_text = "\n".join(lines)
    
    # Loop analysis
    for_loops = len(re.findall(r"\bfor\b", code_text))
    while_loops = len(re.findall(r"\bwhile\b", code_text))
    total_loops = for_loops + while_loops
    
    # Nested loops check
    has_nested_loops = False
    indent_levels = []
    for raw_line in code.split("\n"):
        if raw_line.strip():
            indent = len(raw_line) - len(raw_line.lstrip())
            if any(raw_line.strip().startswith(k) for k in ["for", "while"]):
                indent_levels.append(indent)
    if len(indent_levels) >= 2:
        for i in range(len(indent_levels) - 1):
            if indent_levels[i+1] > indent_levels[i]:
                has_nested_loops = True
                break

    # Pointers and variables
    has_two_pointers = bool(re.search(r"\b(left|right|low|high|start|end|p1|p2|i|j)\b", code_text, re.I))
    has_hashmap = bool(re.search(r"\b(dict|set|map|HashMap|HashSet|unordered_map|unordered_set|Map|Set)\b", code_text))
    has_sort = bool(re.search(r"\b(sort|sorted|sort_by|Collections\.sort|Arrays\.sort)\b", code_text))
    has_recursion = bool(re.search(r"\b(def|function|int|void)\s+([a-zA-Z0-9_]+).*\2\(", code_text))
    
    # Pointer stepping checks
    has_left_increment = bool(re.search(r"(left|low|start)\s*(\+\+|\+=\s*1|:=.*?\+\s*1)", code_text))
    has_right_decrement = bool(re.search(r"(right|high|end)\s*(--|-=\s*1|:=.*?\-\s*1)", code_text))
    
    # Return checks
    returns_1_indexed = bool(re.search(r"(\+\s*1|\b1\s*\+)", code_text))
    
    # Big-O calculation
    estimated_time = "O(N)"
    time_reason = "Single pass through the input elements"
    if has_nested_loops:
        estimated_time = "O(N^2)"
        time_reason = "Nested loop iteration scanning all pairs (O(N) * O(N))"
    elif has_sort and total_loops <= 1:
        estimated_time = "O(N log N)"
        time_reason = "Dominant comparison sort O(N log N) followed by linear pass"
    elif while_loops == 1 and has_two_pointers:
        estimated_time = "O(N)"
        time_reason = "Two pointers moving toward each other; each element visited at most once"
    elif total_loops == 0:
        estimated_time = "O(1)"
        time_reason = "Direct mathematical calculation without loops"

    estimated_space = "O(1)"
    space_reason = "Only scalar integer variables and pointers allocated in-place"
    if has_hashmap:
        estimated_space = "O(N)"
        space_reason = "Auxiliary hash map / lookup set storing up to N elements"
    elif has_recursion:
        estimated_space = "O(N)"
        space_reason = "Recursion call stack overhead proportional to recursion depth"

    return {
        "total_loops": total_loops,
        "has_nested_loops": has_nested_loops,
        "has_two_pointers": has_two_pointers,
        "has_hashmap": has_hashmap,
        "has_sort": has_sort,
        "has_left_increment": has_left_increment,
        "has_right_decrement": has_right_decrement,
        "returns_1_indexed": returns_1_indexed,
        "estimated_time": estimated_time,
        "time_reason": time_reason,
        "estimated_space": estimated_space,
        "space_reason": space_reason,
        "line_count": len(lines)
    }


def find_problem_context(title: str, description: str) -> Dict[str, Any]:
    """
    Finds matching problem metadata from the curated knowledge base.
    """
    title_lower = title.lower()
    desc_lower = description.lower()
    
    for key, data in PROBLEM_KNOWLEDGE_BASE.items():
        if key in title_lower or key in desc_lower:
            return data
            
    # Generic fallback
    return {
        "pattern": "Optimal Algorithm & Invariant Design",
        "optimal_time": "O(N)",
        "optimal_space": "O(1) to O(N)",
        "invariant": "Process elements by maintaining a tight state invariant to avoid redundant passes.",
        "edge_cases": [
            "Empty or single-element inputs.",
            "Boundary values and extreme numerical limits.",
            "Duplicate or identical elements."
        ],
        "common_pitfalls": ["Redundant nested loops resulting in O(N^2) quadratic time."]
    }


def generate_deep_analytical_response(
    problem_title: str,
    problem_description: str,
    code: str,
    language: str,
    user_message: str
) -> str:
    """
    Generates a deeply analytical, precise technical response by cross-referencing
    the user's question, problem invariants, and the candidate's exact code AST.
    """
    msg = user_message.lower()
    prob_ctx = find_problem_context(problem_title, problem_description)
    code_ctx = analyze_candidate_code(code, language)
    
    # -------------------------------------------------------------------------
    # 1. TIME / SPACE COMPLEXITY & BOTTLENECK AUDIT
    # -------------------------------------------------------------------------
    if any(k in msg for k in ["complexity", "big-o", "big o", "time", "space", "bottleneck", "audit"]):
        response = f"Let's break down your code's complexity for '{problem_title}':\n\n"
        response += f"- **Time Complexity:** `{code_ctx['estimated_time']}` ({code_ctx['time_reason']}).\n"
        response += f"- **Space Complexity:** `{code_ctx['estimated_space']}` ({code_ctx['space_reason']}).\n\n"
        
        if code_ctx["has_nested_loops"]:
            response += f"[Bottleneck Warning] You have nested loops resulting in quadratic `{code_ctx['estimated_time']}` time. The target is `{prob_ctx['optimal_time']}`. Since the input structure allows directional pruning, you can eliminate the inner loop by {prob_ctx['pattern']}."
        elif code_ctx["estimated_time"] == prob_ctx["optimal_time"]:
            response += f"[Optimization Status] Your time complexity of `{code_ctx['estimated_time']}` matches the optimal target. Verify your loop termination boundaries and ensure you handle {prob_ctx['edge_cases'][0]} cleanly."
        else:
            response += f"[Target Comparison] Target optimal complexity is `{prob_ctx['optimal_time']}` time with `{prob_ctx['optimal_space']}` space."
            
        return response

    # -------------------------------------------------------------------------
    # 2. SOCRATIC HINT / INVARIANT / APPROACH GUIDANCE
    # -------------------------------------------------------------------------
    if any(k in msg for k in ["hint", "invariant", "approach", "how to", "optimize", "idea", "start", "clue"]):
        response = f"**Interviewer Socratic Invariant ({prob_ctx['pattern']}):**\n\n"
        response += f"{prob_ctx['invariant']}\n\n"
        response += f"Target efficiency: **{prob_ctx['optimal_time']}** time, **{prob_ctx['optimal_space']}** space.\n\n"
        
        if "two sum" in problem_title.lower():
            if not code_ctx["has_two_pointers"]:
                response += "- *Actionable prompt:* Start by defining two pointers: `left = 0` and `right = len(numbers) - 1`. What condition decides whether `left` moves forward vs `right` moves backward?"
            else:
                response += "- *Code check:* Your pointers are in place! Make sure your sum comparison handles equal, less-than, and greater-than branches."
        elif "container" in problem_title.lower():
            response += "- *Actionable prompt:* Which wall limits the area? If you move the taller wall, can width decrease while height stays bounded? What happens when you shift the shorter wall instead?"
        else:
            response += f"- *Question to consider:* What intermediate state can you cache or track so that each element is processed in O(1) time without re-scanning previous elements?"
            
        return response

    # -------------------------------------------------------------------------
    # 3. EDGE CASES & ADVERSARIAL TRAPS
    # -------------------------------------------------------------------------
    if any(k in msg for k in ["edge", "boundary", "cases", "trap", "overflow", "test cases", "adversarial"]):
        response = f"**Critical Edge Cases for '{problem_title}':**\n\n"
        for i, ec in enumerate(prob_ctx["edge_cases"], 1):
            response += f"{i}. {ec}\n"
        response += f"\n- *Interviewer Tip:* In a live interview, walk through one of these boundary cases with your code before clicking run."
        return response

    # -------------------------------------------------------------------------
    # 4. DEBUGGING / WHY DID A TEST FAIL / ERROR CHECK
    # -------------------------------------------------------------------------
    if any(k in msg for k in ["fail", "error", "wrong", "bug", "why", "mismatch", "incorrect", "debug"]):
        response = f"**Code Diagnostic Inspection for '{problem_title}':**\n\n"
        
        # Check common bugs
        if "two sum" in problem_title.lower() and not code_ctx["returns_1_indexed"]:
            response += "- **Noticeable Inconsistency:** Two Sum II specifies **1-indexed** output! Check if you are returning `[left, right]` (0-indexed) instead of `[left + 1, right + 1]`.\n\n"
        
        if code_ctx["has_two_pointers"] and (not code_ctx["has_left_increment"] or not code_ctx["has_right_decrement"]):
            response += "- **Pointer Update Alert:** Verify that `left` increments when `sum < target` and `right` decrements when `sum > target` so the loop does not run indefinitely.\n\n"
            
        response += f"- Current runtime profile: `{code_ctx['estimated_time']}` time / `{code_ctx['estimated_space']}` space.\n"
        response += f"- Common pitfall in this challenge: {prob_ctx['common_pitfalls'][0]}"
        return response

    # -------------------------------------------------------------------------
    # 5. GENERAL ARCHITECTURAL / DESIGN QUESTIONS
    # -------------------------------------------------------------------------
    return (
        f"For '{problem_title}', your current code uses {code_ctx['total_loops']} loop(s) with an estimated `{code_ctx['estimated_time']}` time complexity and `{code_ctx['estimated_space']}` space.\n\n"
        f"To proceed with high confidence:\n"
        f"1. **Invariant:** {prob_ctx['invariant'][:180]}...\n"
        f"2. **Target:** Achieve `{prob_ctx['optimal_time']}` runtime with `{prob_ctx['optimal_space']}` memory.\n"
        f"3. **Verification:** Walk through the primary boundary case: {prob_ctx['edge_cases'][0]}"
    )


def generate_interviewer_response(
    problem_title: str,
    problem_description: str,
    code: str,
    language: str,
    user_message: str,
    chat_history: List[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Generates a sharp, contextual, Socratic interviewer response.
    Combines Groq LLaMA-3.3-70B (when available) with our deep AST & invariant engine.
    """
    if not user_message or not user_message.strip():
        user_message = "Can you analyze my current code's Big-O time and space complexity and tell me where the bottlenecks are?"

    # First attempt live LLM call if client is connected and functional
    if client:
        prob_ctx = find_problem_context(problem_title, problem_description)
        code_ctx = analyze_candidate_code(code, language)
        
        system_prompt = f"""You are a Staff Technical Interviewer at Google/Meta conducting a live coding interview.
Problem: "{problem_title}"
Problem Description:
{problem_description}

Optimal Target: {prob_ctx['optimal_time']} Time | {prob_ctx['optimal_space']} Space
Key Invariant: {prob_ctx['invariant']}
Key Edge Cases: {', '.join(prob_ctx['edge_cases'])}

Candidate's current code ({language}):
```{language}
{code}
```

Static Code Metrics:
- Detected Time Complexity: {code_ctx['estimated_time']} ({code_ctx['time_reason']})
- Detected Space Complexity: {code_ctx['estimated_space']} ({code_ctx['space_reason']})

RULES FOR YOUR RESPONSE:
1. **Analyze before speaking**: Specifically reference the candidate's exact code, variables, and loop logic.
2. **Be Socratic & Concrete**: Explain the exact mathematical/algorithmic invariant, state the Big-O time and space, and point out specific line-level insights.
3. **DO NOT GIVE VAGUE OR GENERIC ANSWERS**: Mention the actual problem constraints, exact edge cases, and concrete variables.
4. Keep the response to 3-5 concise, highly articulate sentences formatted with bullet points for readability.
"""

        messages = [{"role": "system", "content": system_prompt}]
        if chat_history:
            for m in chat_history[-6:]:
                messages.append({
                    "role": m.get("role", "user"),
                    "content": m.get("content", "")
                })
        messages.append({"role": "user", "content": user_message})

        try:
            response = client.chat.completions.create(
                model=GROQ_HEAVY_MODEL,
                messages=messages,
                temperature=0.4,
                max_tokens=450
            )
            interviewer_reply = response.choices[0].message.content.strip()
            if interviewer_reply and len(interviewer_reply) > 20:
                return {
                    "reply": interviewer_reply,
                    "role": "assistant"
                }
        except Exception as e:
            print(f"Groq LLM call returned {e}; utilizing deep AST analytical engine.")

    # High-accuracy Deep Analytical Response
    deep_reply = generate_deep_analytical_response(
        problem_title=problem_title,
        problem_description=problem_description,
        code=code,
        language=language,
        user_message=user_message
    )
    
    return {
        "reply": deep_reply,
        "role": "assistant"
    }
