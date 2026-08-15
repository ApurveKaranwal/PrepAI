"""
High-Accuracy AI AST Eye & Code Monitor for PrepAI Code Studio
Combines native Python AST static analysis with Groq's Flagship LLaMA-3.3-70B model
for sub-second complexity, bug detection, and proactive conversational interviewer hints.
"""

import ast
import os
import json
import re
from typing import Dict, Any, List
from groq import Groq
from config import GROQ_HEAVY_MODEL

groq_api_key = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None


class ASTFeatureExtractor(ast.NodeVisitor):
    """
    Statically analyzes Python AST structures to detect loops, recursion, and data structures.
    """
    def __init__(self):
        self.loop_depth = 0
        self.max_loop_depth = 0
        self.recursive_calls = 0
        self.function_names = set()
        self.data_structures = set()
        self.has_sorting = False
        self.has_recursion = False
        self.lines_of_code = 0

    def visit_FunctionDef(self, node):
        self.function_names.add(node.name)
        self.generic_visit(node)

    def visit_For(self, node):
        self.loop_depth += 1
        self.max_loop_depth = max(self.max_loop_depth, self.loop_depth)
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_While(self, node):
        self.loop_depth += 1
        self.max_loop_depth = max(self.max_loop_depth, self.loop_depth)
        self.generic_visit(node)
        self.loop_depth -= 1

    def visit_Call(self, node):
        # Detect recursion
        if isinstance(node.func, ast.Name) and node.func.id in self.function_names:
            self.has_recursion = True
            self.recursive_calls += 1
        # Detect common library calls
        if isinstance(node.func, ast.Attribute):
            if node.func.attr in ["sort", "append", "pop", "get"]:
                self.data_structures.add(node.func.attr)
            if node.func.attr == "sort":
                self.has_sorting = True
        elif isinstance(node.func, ast.Name):
            if node.func.id in ["sorted"]:
                self.has_sorting = True
            if node.func.id in ["dict", "set", "list", "map", "filter"]:
                self.data_structures.add(node.func.id)
        self.generic_visit(node)

    def visit_Dict(self, node):
        self.data_structures.add("hash_map")
        self.generic_visit(node)

    def visit_Set(self, node):
        self.data_structures.add("hash_set")
        self.generic_visit(node)

    def visit_List(self, node):
        self.data_structures.add("array_list")
        self.generic_visit(node)


def extract_ast_metadata(code: str, language: str) -> Dict[str, Any]:
    """
    Extracts native AST structural features from code.
    """
    if language.lower() == "python":
        try:
            tree = ast.parse(code)
            extractor = ASTFeatureExtractor()
            extractor.visit(tree)
            return {
                "max_loop_depth": extractor.max_loop_depth,
                "has_recursion": extractor.has_recursion,
                "has_sorting": extractor.has_sorting,
                "data_structures": list(extractor.data_structures),
                "parse_success": True
            }
        except Exception as e:
            return {
                "max_loop_depth": 0,
                "has_recursion": False,
                "has_sorting": False,
                "data_structures": [],
                "parse_success": False,
                "parse_error": str(e)
            }
    else:
        # Regex heuristics for JavaScript / TypeScript
        for_count = len(re.findall(r'\b(for|while)\b', code))
        has_sort = bool(re.search(r'\.sort\(', code))
        return {
            "max_loop_depth": min(for_count, 3),
            "has_recursion": False,
            "has_sorting": has_sort,
            "data_structures": ["Map", "Set"] if "Map" in code or "Set" in code else ["Array"],
            "parse_success": True
        }


def analyze_code_intelligence(
    code: str,
    language: str,
    problem_title: str,
    problem_description: str,
    optimal_time: str = "O(N)",
    optimal_space: str = "O(1)"
) -> Dict[str, Any]:
    """
    Deep Code Intelligence & Complexity Engine using Groq LLaMA-3.3-70B.
    """
    ast_meta = extract_ast_metadata(code, language)

    # If Groq is available, run high-precision analysis
    if client:
        prompt = f"""You are an elite Staff Software Engineer and Bar Raiser conducting a live coding interview.
Analyze the candidate's active code implementation for the given problem with rigorous mathematical accuracy.

Problem: {problem_title}
Problem Constraints & Goals:
{problem_description}

Target Optimal Time: {optimal_time}
Target Optimal Space: {optimal_space}

Candidate's Code ({language}):
```{language}
{code}
```

AST Static Features:
{json.dumps(ast_meta)}

Evaluate and return a STRICT JSON object with the following schema:
{{
    "time_complexity": "Big-O string, e.g., O(N), O(N log N), O(N^2)",
    "time_complexity_reasoning": "Clear 1-sentence mathematical derivation",
    "space_complexity": "Big-O string, e.g., O(1), O(N)",
    "space_complexity_reasoning": "Clear 1-sentence memory analysis",
    "code_quality_score": 85, // integer 0 to 100
    "is_optimal": true, // boolean compared to target optimal time/space
    "proactive_interviewer_hint": "Conversational, spoken-style hint or question as if the interviewer is speaking aloud right now to guide the candidate without giving away the full answer",
    "potential_bugs_or_vulnerabilities": ["Specific edge-case hazard or potential bug", ...],
    "detected_patterns": ["Two Pointers", "Sliding Window", ...],
    "suggestions": ["Actionable improvement", ...]
}}
Return ONLY valid JSON.
"""
        try:
            response = client.chat.completions.create(
                model=GROQ_HEAVY_MODEL,
                messages=[
                    {"role": "system", "content": "You are a Staff Technical Interviewer evaluating code complexity. Return only JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                response_format={"type": "json_object"}
            )
            content = response.choices[0].message.content
            parsed = json.loads(content)
            parsed["ast_metadata"] = ast_meta
            return parsed
        except Exception as e:
            print(f"Error calling Groq for code analysis: {e}")

    # Fallback heuristic engine
    depth = ast_meta.get("max_loop_depth", 1)
    has_sort = ast_meta.get("has_sorting", False)
    
    if depth >= 2:
        time_comp = "O(N^2)"
        time_reason = "Nested loop iteration over the input collection."
    elif has_sort:
        time_comp = "O(N log N)"
        time_reason = "Sorting operation dominates the linear pass."
    elif depth == 1:
        time_comp = "O(N)"
        time_reason = "Single linear traversal of elements."
    else:
        time_comp = "O(1)"
        time_reason = "Constant time execution statements."

    space_comp = "O(N)" if ("hash_map" in ast_meta.get("data_structures", []) or "array_list" in ast_meta.get("data_structures", [])) else "O(1)"

    return {
        "time_complexity": time_comp,
        "time_complexity_reasoning": time_reason,
        "space_complexity": space_comp,
        "space_complexity_reasoning": "Auxiliary hash structures or buffers allocated in memory.",
        "code_quality_score": 80,
        "is_optimal": (time_comp == optimal_time and space_comp == optimal_space),
        "proactive_interviewer_hint": f"Your current approach runs in {time_comp}. Consider if we can leverage an auxiliary lookup table to achieve {optimal_time}.",
        "potential_bugs_or_vulnerabilities": ["Check boundary condition for empty or single-element inputs."],
        "detected_patterns": ["Iterative Traversal"],
        "suggestions": ["Ensure edge cases like empty collections or zero values are guarded."],
        "ast_metadata": ast_meta
    }
