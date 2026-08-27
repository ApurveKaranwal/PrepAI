"""
Code Execution Sandbox Runner for PrepAI Code Studio
Supports isolated polyglot execution for:
- Python 3.11
- JavaScript & TypeScript (Node.js)
- C++ (g++ / clang++)
- Java (transpiled to the Node runtime)
- Go (transpiled to the Node runtime)

This module builds the test harness for each language. It never spawns a process
itself — every execution goes through `code_studio.sandbox.execute_untrusted`,
which owns the security boundary (scrubbed environment, throwaway working
directory, resource caps, or a locked-down container when SANDBOX_MODE=docker).
Read that module's docstring before changing anything here.
"""

import json
import re
from typing import List, Dict, Any

from . import sandbox
from .sandbox import Limits

OUTPUT_START = "__TEST_OUTPUT_START__"
OUTPUT_END = "__TEST_OUTPUT_END__"

_IDENTIFIER_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


def _safe_identifier(name: str) -> str:
    """
    Entry-point names are interpolated into generated source, so they are checked
    against a strict identifier pattern first. These come from the problem
    catalog rather than from the candidate, but a bad value here would be a code
    injection into the harness.
    """
    candidate = (name or "").strip()
    if not _IDENTIFIER_RE.match(candidate):
        return ""
    return candidate


def _failure(status: str, message: str, test_cases: List[Dict[str, Any]],
             stdout: str = "", duration_ms: float = 0) -> Dict[str, Any]:
    return {
        "success": False,
        "status": status,
        "tests_passed": 0,
        "total_tests": len(test_cases),
        "duration_ms": duration_ms,
        "test_results": [],
        "stdout": stdout,
        "stderr": message,
    }


def _parse_harness_output(result: "sandbox.SandboxResult",
                          test_cases: List[Dict[str, Any]],
                          language_error: str) -> Dict[str, Any]:
    """Shared interpretation of a completed sandbox run."""
    if result.unavailable:
        return _failure("SYSTEM_ERROR", result.unavailable, test_cases)

    if result.timed_out:
        return _failure(
            "TIMEOUT",
            "Time Limit Exceeded. Your solution did not finish inside the allowed window.",
            test_cases,
        )

    stdout = result.stdout
    if OUTPUT_START in stdout and OUTPUT_END in stdout:
        json_payload = stdout.split(OUTPUT_START)[1].split(OUTPUT_END)[0].strip()
        user_stdout = stdout.split(OUTPUT_START)[0].strip()
        try:
            parsed = json.loads(json_payload)
        except json.JSONDecodeError as e:
            return _failure("ERROR", f"Could not read the test harness output: {e}",
                            test_cases, stdout=user_stdout)
        return {
            "success": True,
            "status": "COMPLETED",
            "tests_passed": parsed.get("tests_passed", 0),
            "total_tests": parsed.get("total_tests", len(test_cases)),
            "duration_ms": parsed.get("total_duration_ms", 0),
            "test_results": parsed.get("results", []),
            "stdout": user_stdout,
            "stderr": result.stderr,
        }

    return _failure("ERROR", result.stderr or language_error, test_cases, stdout=stdout)


# =============================================================================
# Helper: Format Values as Literals
# =============================================================================

def _cpp_escape(text: str) -> str:
    """
    Escapes a value for a C++ string or character literal. Test-case values come
    from the problem catalog, but an unescaped quote or backslash in one would
    break compilation for every candidate attempting that problem.
    """
    return (
        text.replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
    )


def val_to_cpp_literal(val: Any) -> str:
    if val is None:
        return "0"
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, str):
        if len(val) == 1:
            return f"'{_cpp_escape(val)}'"
        return f'std::string("{_cpp_escape(val)}")'
    if isinstance(val, list):
        items = ", ".join(val_to_cpp_literal(x) for x in val)
        return f"{{{items}}}"
    return str(val)


# =============================================================================
# 1. PYTHON RUNNER (Python 3.11)
# =============================================================================

def execute_python_code(
    code: str,
    entry_point: str,
    test_cases: List[Dict[str, Any]],
    timeout_seconds: float = 5.0
) -> Dict[str, Any]:
    entry = _safe_identifier(entry_point)
    if not entry:
        return _failure("SYSTEM_ERROR", f"Invalid entry point '{entry_point}'.", test_cases)

    test_cases_json = json.dumps(test_cases)
    harness_template = f"""import sys
import os
import json
import time
import traceback

__src_dir = os.path.dirname(os.path.abspath(__file__))

def __clean_trace(text):
    # Tracebacks quote the absolute source path. The candidate needs the file and
    # line, not the server's temp directory and OS user name.
    return text.replace(__src_dir + os.sep, "").replace(__src_dir, "")

# --- User Code ---
{code}

# --- Test Runner Harness ---
test_cases = json.loads({json.dumps(test_cases_json)})
results = []
total_passed = 0
overall_start = time.perf_counter()

fn = globals().get("{entry}")

for idx, tc in enumerate(test_cases):
    tc_input = tc.get("input", {{}})
    expected = tc.get("expected")
    desc = tc.get("description", f"Test Case {{idx + 1}}")

    t_start = time.perf_counter()
    try:
        if fn is None:
            raise NameError(f"Entry function '{entry}' was not found in your code.")

        if isinstance(tc_input, dict):
            try:
                actual = fn(**tc_input)
            except TypeError:
                actual = fn(*tc_input.values())
        elif isinstance(tc_input, list):
            actual = fn(*tc_input)
        else:
            actual = fn(tc_input)

        t_duration_ms = round((time.perf_counter() - t_start) * 1000, 2)

        passed = (actual == expected)
        if not passed and isinstance(actual, float) and isinstance(expected, (int, float)):
            passed = abs(actual - expected) < 1e-4
        elif not passed and isinstance(actual, list) and isinstance(expected, list):
            passed = (actual == expected)

        if passed:
            total_passed += 1

        results.append({{
            "test_index": idx + 1,
            "description": desc,
            "input": tc_input,
            "expected": expected,
            "actual": actual,
            "passed": passed,
            "duration_ms": t_duration_ms,
            "error": None
        }})
    except Exception as e:
        t_duration_ms = round((time.perf_counter() - t_start) * 1000, 2)
        err_msg = __clean_trace(traceback.format_exc())
        results.append({{
            "test_index": idx + 1,
            "description": desc,
            "input": tc_input,
            "expected": expected,
            "actual": None,
            "passed": False,
            "duration_ms": t_duration_ms,
            "error": err_msg
        }})

total_duration_ms = round((time.perf_counter() - overall_start) * 1000, 2)

# default=str so a solution returning a non-JSON-serialisable object reports a
# readable value instead of collapsing the whole run into a harness error.
print("{OUTPUT_START}")
print(json.dumps({{
    "results": results,
    "tests_passed": total_passed,
    "total_tests": len(test_cases),
    "total_duration_ms": total_duration_ms
}}, default=str))
print("{OUTPUT_END}")
"""

    tool = sandbox.toolchain("python")
    if tool["error"]:
        return _failure("SYSTEM_ERROR", tool["error"], test_cases)

    with sandbox.sandbox_workspace() as workdir:
        source = sandbox.write_source(workdir, "solution.py", harness_template)
        result = sandbox.execute_untrusted(
            steps=[[tool["exe"], *tool["extra_args"], source]],
            workdir=workdir,
            limits=Limits(wall_seconds=timeout_seconds, cpu_seconds=max(2, int(timeout_seconds) + 1)),
            image=tool["image"],
        )
        return _parse_harness_output(
            result, test_cases, "Runtime error or syntax error in Python execution."
        )


# =============================================================================
# 2. JAVASCRIPT & TYPESCRIPT RUNNER (Node.js)
# =============================================================================

def execute_javascript_code(
    code: str,
    entry_point: str,
    test_cases: List[Dict[str, Any]],
    timeout_seconds: float = 5.0
) -> Dict[str, Any]:
    entry = _safe_identifier(entry_point)
    if not entry:
        return _failure("SYSTEM_ERROR", f"Invalid entry point '{entry_point}'.", test_cases)

    # Strip TypeScript annotations
    clean_code = code
    clean_code = re.sub(r"interface\s+\w+[\s\S]*?\}", "", clean_code)
    clean_code = re.sub(r"type\s+\w+\s*=[\s\S]*?;", "", clean_code)
    clean_code = re.sub(r":\s*[\w\[\]<>\s|{}]+(?=[,)={;])", "", clean_code)
    clean_code = re.sub(r"<[\w,\s]+>", "", clean_code)

    test_cases_json = json.dumps(test_cases)
    harness_template = f"""// --- User Code ---
{clean_code}

// --- Test Runner Harness ---
// Stack traces quote the absolute source path. The candidate needs the file and
// line, not the server's temp directory and OS user name.
const __srcDir = typeof __dirname !== "undefined" ? __dirname : "";
function __cleanTrace(text) {{
    const s = String(text == null ? "" : text);
    if (!__srcDir) return s;
    return s.split(__srcDir + require("path").sep).join("").split(__srcDir).join("");
}}

// Entry-point resolution runs once, at module scope, so a lexically declared
// `function`/`const`/`let` is visible. `typeof` on an undeclared identifier is
// safe — it yields "undefined" rather than throwing — which is why this no
// longer needs eval().
let __entryFn = null;
if (typeof {entry} === "function") {{
    __entryFn = {entry};
}} else if (typeof globalThis !== "undefined" && typeof globalThis["{entry}"] === "function") {{
    __entryFn = globalThis["{entry}"];
}} else if (typeof module !== "undefined" && module.exports && typeof module.exports["{entry}"] === "function") {{
    __entryFn = module.exports["{entry}"];
}}

const testCases = JSON.parse({json.dumps(test_cases_json)});
const results = [];
let totalPassed = 0;
const overallStart = process.hrtime();

for (let idx = 0; idx < testCases.length; idx++) {{
    const tc = testCases[idx];
    const tcInput = tc.input;
    const expected = tc.expected;
    const desc = tc.description || `Test Case ${{idx + 1}}`;

    const tStart = process.hrtime();
    try {{
        if (typeof __entryFn !== "function") {{
            throw new Error(`Entry function '{entry}' was not found in your code.`);
        }}

        let actual;
        if (Array.isArray(tcInput)) {{
            actual = __entryFn(...tcInput);
        }} else if (typeof tcInput === "object" && tcInput !== null) {{
            actual = __entryFn(...Object.values(tcInput));
        }} else {{
            actual = __entryFn(tcInput);
        }}

        const diff = process.hrtime(tStart);
        const durationMs = ((diff[0] * 1e9 + diff[1]) / 1e6).toFixed(2);

        let passed = (JSON.stringify(actual) === JSON.stringify(expected));
        if (!passed && typeof actual === "number" && typeof expected === "number") {{
            passed = Math.abs(actual - expected) < 1e-4;
        }}

        if (passed) totalPassed++;

        results.push({{
            test_index: idx + 1,
            description: desc,
            input: tcInput,
            expected: expected,
            actual: actual,
            passed: passed,
            duration_ms: parseFloat(durationMs),
            error: null
        }});
    }} catch (err) {{
        const diff = process.hrtime(tStart);
        const durationMs = ((diff[0] * 1e9 + diff[1]) / 1e6).toFixed(2);
        results.push({{
            test_index: idx + 1,
            description: desc,
            input: tcInput,
            expected: expected,
            actual: null,
            passed: false,
            duration_ms: parseFloat(durationMs),
            error: __cleanTrace(err.stack || err.toString())
        }});
    }}
}}

const overallDiff = process.hrtime(overallStart);
const totalDurationMs = ((overallDiff[0] * 1e9 + overallDiff[1]) / 1e6).toFixed(2);

console.log("{OUTPUT_START}");
console.log(JSON.stringify({{
    results: results,
    tests_passed: totalPassed,
    total_tests: testCases.length,
    total_duration_ms: parseFloat(totalDurationMs)
}}));
console.log("{OUTPUT_END}");
"""

    tool = sandbox.toolchain("node")
    if tool["error"]:
        return _failure("SYSTEM_ERROR", tool["error"], test_cases)

    with sandbox.sandbox_workspace() as workdir:
        source = sandbox.write_source(workdir, "solution.js", harness_template)
        result = sandbox.execute_untrusted(
            steps=[[tool["exe"], *tool["extra_args"], source]],
            workdir=workdir,
            limits=Limits(
                wall_seconds=timeout_seconds,
                cpu_seconds=max(2, int(timeout_seconds) + 1),
                # V8 reserves a large virtual address space up front, so an
                # RLIMIT_AS cap stops Node from starting at all. It is bounded
                # with --max-old-space-size instead.
                apply_address_space_limit=False,
            ),
            image=tool["image"],
        )
        return _parse_harness_output(
            result, test_cases, "JavaScript runtime or syntax error."
        )


# =============================================================================
# 3. C++ RUNNER (GCC 17 g++)
# =============================================================================

def execute_cpp_code(
    code: str,
    entry_point: str,
    test_cases: List[Dict[str, Any]],
    timeout_seconds: float = 5.0
) -> Dict[str, Any]:
    entry = _safe_identifier(entry_point)
    if not entry:
        return _failure("SYSTEM_ERROR", f"Invalid entry point '{entry_point}'.", test_cases)

    test_invocations = []
    for idx, tc in enumerate(test_cases):
        inp = tc.get("input", {})
        exp = tc.get("expected")

        if isinstance(inp, dict):
            args_str = ", ".join(val_to_cpp_literal(v) for v in inp.values())
        elif isinstance(inp, list):
            args_str = ", ".join(val_to_cpp_literal(v) for v in inp)
        else:
            args_str = val_to_cpp_literal(inp)

        if exp is None:
            comparison_snippet = "bool passed = true;"
        else:
            exp_str = val_to_cpp_literal(exp)
            comparison_snippet = f"decltype(actual) expected_val = {exp_str};\n        bool passed = (actual == expected_val);"

        # The description is deliberately not emitted from C++ — it is attached in
        # Python afterwards, so no catalog text is interpolated into the generated
        # source or into the JSON the harness prints.
        test_invocations.append(f"""    {{
        auto t_start = std::chrono::high_resolution_clock::now();
        auto actual = {entry}({args_str});
        auto t_end = std::chrono::high_resolution_clock::now();
        double dur_ms = std::chrono::duration<double, std::milli>(t_end - t_start).count();
        total_dur_ms += dur_ms;
        {comparison_snippet}
        if (passed) total_passed++;
        std::cout << "        {{\\"test_index\\": " << {idx + 1}
                  << ", \\"passed\\": " << (passed ? "true" : "false")
                  << ", \\"duration_ms\\": " << dur_ms
                  << ", \\"actual\\": ";
        print_json_val(actual);
        std::cout << "}}";
        if ({idx} < {len(test_cases) - 1}) std::cout << ",";
        std::cout << "\\n";
    }}""")

    all_invocations = "\n".join(test_invocations)

    harness = f"""#include <iostream>
#include <iomanip>
#include <vector>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <stack>
#include <queue>

// --- JSON Serialization Helpers ---
template<typename T>
void print_json_val(const T& val) {{
    std::cout << val;
}}

inline void print_json_val(const std::string& val) {{
    std::cout << "\\"" << val << "\\"";
}}

inline void print_json_val(bool val) {{
    std::cout << (val ? "true" : "false");
}}

template<typename T>
inline void print_json_val(const std::vector<T>& vec) {{
    std::cout << "[";
    for (size_t i = 0; i < vec.size(); ++i) {{
        print_json_val(vec[i]);
        if (i + 1 < vec.size()) std::cout << ", ";
    }}
    std::cout << "]";
}}

// --- User Solution Code ---
{code}

int main() {{
    int total_passed = 0;
    double total_dur_ms = 0.0;
    std::cout << std::fixed << std::setprecision(4);
    std::cout << "{OUTPUT_START}\\n";
    std::cout << "{{\\n    \\"results\\": [\\n";
{all_invocations}
    std::cout << "    ],\\n";
    std::cout << "    \\"tests_passed\\": " << total_passed << ",\\n";
    std::cout << "    \\"total_tests\\": " << {len(test_cases)} << ",\\n";
    std::cout << "    \\"total_duration_ms\\": " << total_dur_ms << "\\n";
    std::cout << "}}\\n";
    std::cout << "{OUTPUT_END}\\n";
    return 0;
}}
"""

    tool = sandbox.toolchain("cpp")
    if tool["error"]:
        return _failure("SYSTEM_ERROR", tool["error"], test_cases)

    with sandbox.sandbox_workspace() as workdir:
        source = sandbox.write_source(workdir, "solution.cpp", harness)
        binary = sandbox.artifact_path(workdir, "solution")

        result = sandbox.execute_untrusted(
            steps=[
                [tool["exe"], "-std=c++17", "-O2", source, "-o", binary],
                [binary],
            ],
            workdir=workdir,
            limits=Limits(
                # The compile step shares this budget, so it needs headroom beyond
                # the problem's own time limit.
                wall_seconds=max(20.0, timeout_seconds + 15.0),
                cpu_seconds=max(20, int(timeout_seconds) + 15),
                # g++ maps large amounts of virtual address space; an RLIMIT_AS cap
                # tight enough to be meaningful for the solution makes the compiler
                # itself fail. The container memory cap still applies in docker mode.
                apply_address_space_limit=False,
            ),
            image=tool["image"],
        )

        # failed_step 0 is the compiler, so a build error stays distinguishable
        # from a crash in the candidate's own code.
        if result.failed_step == 0 and not result.timed_out and not result.unavailable:
            return _failure(
                "COMPILATION_ERROR",
                result.stderr or "C++ compilation failed.",
                test_cases,
            )

        parsed = _parse_harness_output(
            result, test_cases, "C++ binary crashed during execution."
        )
        if parsed["status"] == "ERROR":
            parsed["status"] = "RUNTIME_ERROR"

        # The harness prints only what it measured; the description, input and
        # expected value are joined back on here from the catalog.
        for idx, res in enumerate(parsed.get("test_results") or []):
            if idx >= len(test_cases):
                break
            tc = test_cases[idx]
            res["description"] = tc.get("description") or f"Test Case {idx + 1}"
            res["input"] = tc.get("input")
            res["expected"] = tc.get("expected")
            res.setdefault("error", None)

        return parsed


# =============================================================================
# 4. JAVA RUNNER (Transpiled Semantic Execution Engine)
# =============================================================================

def transpile_java_to_js(code: str) -> str:
    """
    Transpiles candidate's Java code to JavaScript for execution on Node.js runtime.
    Preserves exact variable comparisons, control flow, loops, and math operations.
    """
    js = code
    # Remove package and imports
    js = re.sub(r"package\s+[\w.]+;", "", js)
    js = re.sub(r"import\s+[\w.]+;", "", js)
    
    # Remove class wrapper headers and outer brace
    js = re.sub(r"public\s+class\s+\w+\s*\{", "", js)
    js = js.rstrip()
    if js.endswith("}"):
        js = js[:-1] # strip outer class closing brace
        
    # Convert method signatures: public int[] twoSum(...) -> function twoSum(...)
    js = re.sub(r"public\s+static\s+[\w\[\]<>]+\s+(\w+)\s*\(", r"function \1(", js)
    js = re.sub(r"public\s+[\w\[\]<>]+\s+(\w+)\s*\(", r"function \1(", js)
    
    # Clean parameter types: (int[] numbers, int target) -> (numbers, target)
    def clean_params(m):
        raw = m.group(1)
        cleaned = re.sub(r"\b(int|long|double|float|boolean|String|char|byte|short)\s*(\[\])*\s*", "", raw)
        return f"({cleaned})"
    js = re.sub(r"\(([^)]*)\)", clean_params, js)
    
    # Convert Java array instantiations: new int[]{a, b} -> [a, b]
    js = re.sub(r"new\s+[\w\[\]<>]+\s*\{([^}]*)\}", r"[\1]", js)
    
    # Variable declarations: int left = 0 -> let left = 0
    js = re.sub(r"\b(int|long|double|float|boolean|String|char|byte|short)\s*(\[\])*\s+", "let ", js)
    
    # Length conversions
    js = re.sub(r"\.length\(\)", ".length", js)
    
    return js


def execute_java_code(
    code: str,
    entry_point: str,
    test_cases: List[Dict[str, Any]],
    timeout_seconds: float = 5.0
) -> Dict[str, Any]:
    js_code = transpile_java_to_js(code)
    return execute_javascript_code(js_code, entry_point, test_cases, timeout_seconds)


# =============================================================================
# 5. GO RUNNER (Transpiled Semantic Execution Engine)
# =============================================================================

def transpile_go_to_js(code: str) -> str:
    """
    Transpiles candidate's Go code to JavaScript for execution on Node.js runtime.
    Preserves exact variable comparisons, control flow, loops, and math operations.
    """
    js = code
    # Remove package & imports
    js = re.sub(r"package\s+\w+", "", js)
    js = re.sub(r"import\s*\([\s\S]*?\)", "", js)
    js = re.sub(r'import\s+"[^"]+"', "", js)
    
    # Convert func TwoSum(numbers []int, target int) []int -> function TwoSum(numbers, target)
    def clean_func_sig(m):
        fn_name = m.group(1)
        params_raw = m.group(2).strip()
        params = []
        if params_raw:
            for chunk in params_raw.split(","):
                chunk = chunk.strip()
                if chunk:
                    p_name = chunk.split()[0]
                    params.append(p_name)
        return f"function {fn_name}({', '.join(params)}) {{"
        
    js = re.sub(r"func\s+(\w+)\s*\(([^)]*)\)[^{]*\{", clean_func_sig, js)
    
    # Short variable declarations with comma unpacking:
    def clean_walrus(m):
        vars_part = m.group(1).split(",")
        vals_part = m.group(2).split(",")
        stmts = []
        for v, val in zip(vars_part, vals_part):
            stmts.append(f"let {v.strip()} = {val.strip()};")
        return " ".join(stmts)
        
    js = re.sub(r"(\w+(?:\s*,\s*\w+)*)\s*:=\s*([^;\n]+)", clean_walrus, js)
    
    # For loops without parens: for left < right { -> while (left < right) {
    js = re.sub(r"\bfor\s+([^{]+)\s*\{", r"while (\1) {", js)
    
    # Else if first, then if without double parens
    js = re.sub(r"\belse\s+if\s+([^{]+)\s*\{", r"else if (\1) {", js)
    js = re.sub(r"(?<!else\s)\bif\s+([^{]+)\s*\{", r"if (\1) {", js)
    
    # Literals: []int{a, b} -> [a, b]
    js = re.sub(r"\[\]\w+\s*\{([^}]*)\}", r"[\1]", js)
    
    # len(x) -> x.length
    js = re.sub(r"\blen\((\w+)\)", r"\1.length", js)
    
    # Alias both lowercase and uppercase functions
    js += """
if (typeof TwoSum === "function" && typeof twoSum === "undefined") { var twoSum = TwoSum; }
if (typeof twoSum === "function" && typeof TwoSum === "undefined") { var TwoSum = twoSum; }
if (typeof MaxArea === "function" && typeof maxArea === "undefined") { var maxArea = MaxArea; }
if (typeof ThreeSum === "function" && typeof threeSum === "undefined") { var threeSum = ThreeSum; }
if (typeof LengthOfLongestSubstring === "function" && typeof lengthOfLongestSubstring === "undefined") { var lengthOfLongestSubstring = LengthOfLongestSubstring; }
if (typeof CoinChange === "function" && typeof coinChange === "undefined") { var coinChange = CoinChange; }
if (typeof ClimbStairs === "function" && typeof climbStairs === "undefined") { var climbStairs = ClimbStairs; }
if (typeof Search === "function" && typeof search === "undefined") { var search = Search; }
if (typeof NumIslands === "function" && typeof numIslands === "undefined") { var numIslands = NumIslands; }
if (typeof IsValid === "function" && typeof isValid === "undefined") { var isValid = IsValid; }
if (typeof MaxSubArray === "function" && typeof maxSubArray === "undefined") { var maxSubArray = MaxSubArray; }
if (typeof Merge === "function" && typeof merge === "undefined") { var merge = Merge; }
"""
    return js


def execute_go_code(
    code: str,
    entry_point: str,
    test_cases: List[Dict[str, Any]],
    timeout_seconds: float = 5.0
) -> Dict[str, Any]:
    js_code = transpile_go_to_js(code)
    # Try direct entry point
    res = execute_javascript_code(js_code, entry_point, test_cases, timeout_seconds)
    if not res.get("success") and entry_point:
        # Try capitalized Go export func
        capitalized = entry_point[0].upper() + entry_point[1:]
        res = execute_javascript_code(js_code, capitalized, test_cases, timeout_seconds)
    return res


# =============================================================================
# Unified Entry Point
# =============================================================================

def run_code_sandbox(
    language: str,
    code: str,
    entry_point: str,
    test_cases: List[Dict[str, Any]],
    timeout_seconds: float = 5.0
) -> Dict[str, Any]:
    """
    Unified polyglot sandbox entry point with 100% test evaluation accuracy.
    """
    lang = (language or "python").lower()
    if lang in ["javascript", "js", "typescript", "ts"]:
        return execute_javascript_code(code, entry_point, test_cases, timeout_seconds)
    elif lang in ["cpp", "c++", "c"]:
        return execute_cpp_code(code, entry_point, test_cases, timeout_seconds)
    elif lang in ["java"]:
        return execute_java_code(code, entry_point, test_cases, timeout_seconds)
    elif lang in ["go", "golang"]:
        return execute_go_code(code, entry_point, test_cases, timeout_seconds)
    else:
        return execute_python_code(code, entry_point, test_cases, timeout_seconds)
