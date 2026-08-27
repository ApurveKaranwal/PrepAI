"""
=============================================================================
UNTRUSTED CODE EXECUTION BOUNDARY
=============================================================================
Every process that runs candidate-submitted code goes through
`execute_untrusted()` in this module. Nothing else in the codebase should hand
candidate input to `subprocess`.

Two interchangeable executors, selected by the SANDBOX_MODE environment
variable:

  SANDBOX_MODE=docker    (recommended wherever code is accepted from the public)
      One throwaway container per run: no network, read-only root filesystem,
      all capabilities dropped, non-root uid, capped memory / CPU / pids, and the
      source bind-mounted read-only. The container cannot see the host
      filesystem, so backend/.env is unreachable by construction.

  SANDBOX_MODE=hardened  (default; needs no Docker daemon)
      The same process model as a plain subprocess, with the dangerous parts
      removed:
        * The child environment is built from a name allowlist and is never
          inherited. The parent process has backend/.env loaded into it
          (DATABASE_URL, GROQ_API_KEY, SMTP_PASSWORD); candidate code that can
          read those owns the platform, so no value from os.environ reaches the
          child except PATH and locale.
        * The working directory is a fresh mkdtemp() outside the repository,
          removed in a finally block.
        * Wall-clock timeout with a process-group kill, hard caps on captured
          output, and on POSIX RLIMIT_CPU / RLIMIT_AS / RLIMIT_FSIZE /
          RLIMIT_NPROC / RLIMIT_CORE.

      RESIDUAL RISK, stated plainly: hardened mode does not confine the
      filesystem. Candidate code cannot read secrets out of the environment, but
      it runs as the server's own OS user and can therefore still open any file
      that user can read — including backend/.env by absolute path. Windows has
      no setrlimit equivalent, so on Windows the memory, CPU and file-size caps
      are not enforced either; only the wall-clock timeout and the environment
      scrub apply. Hardened mode is for local development. Production must run
      SANDBOX_MODE=docker.
=============================================================================
"""

import itertools
import os
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

try:  # POSIX only
    import resource
except ImportError:  # pragma: no cover - Windows
    resource = None

IS_WINDOWS = os.name == "nt"

MODE_HARDENED = "hardened"
MODE_DOCKER = "docker"

# Captured output is truncated at this size. A submission that prints more than
# this is misbehaving; we keep the head so the candidate can still see what
# happened.
MAX_OUTPUT_BYTES = 64 * 1024

CONTAINER_MOUNT = "/sandbox"
CONTAINER_TMP = "/tmp"

_STEP_FAILED_MARKER = "__SANDBOX_STEP_FAILED__"
_container_counter = itertools.count(1)

# Deliberately excluded from the child: everything not named here. In particular
# DATABASE_URL, GROQ_API_KEY, SMTP_*, PYTHONPATH, PYTHONSTARTUP and NODE_OPTIONS
# — the last three because they let a caller load code into the interpreter
# before the harness runs.
_ENV_ALLOWLIST_POSIX = ("PATH", "LANG", "LC_ALL", "TZ")
_ENV_ALLOWLIST_WINDOWS = (
    "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC",
    "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
)

_DEFAULT_IMAGES = {
    "python": "python:3.11-alpine",
    "node": "node:20-alpine",
    "cpp": "gcc:13",
}

_warned_about_hardened = False


# -----------------------------------------------------------------------------
# Mode & limits
# -----------------------------------------------------------------------------

def sandbox_mode() -> str:
    """Read on every call so the mode can be changed without a restart."""
    mode = (os.environ.get("SANDBOX_MODE") or MODE_HARDENED).strip().lower()
    return MODE_DOCKER if mode == MODE_DOCKER else MODE_HARDENED


def warn_once_if_unconfined() -> None:
    """Logged the first time untrusted code runs outside a container."""
    global _warned_about_hardened
    if _warned_about_hardened or sandbox_mode() == MODE_DOCKER:
        return
    _warned_about_hardened = True
    print(
        "[Sandbox] SANDBOX_MODE=hardened: candidate code runs as this OS user. "
        "Secrets are scrubbed from its environment, but the filesystem is not "
        "confined. Set SANDBOX_MODE=docker before accepting public submissions."
    )


@dataclass
class Limits:
    wall_seconds: float = 10.0
    cpu_seconds: int = 10
    memory_mb: int = 512
    file_size_mb: int = 16
    max_processes: int = 64
    cpu_share: str = "0.5"
    # V8 reserves a large virtual address space at startup, so RLIMIT_AS makes
    # Node fail to boot rather than fail gracefully. Node gets
    # --max-old-space-size instead; see toolchain().
    apply_address_space_limit: bool = True


@dataclass
class SandboxResult:
    returncode: int = -1
    stdout: str = ""
    stderr: str = ""
    timed_out: bool = False
    truncated: bool = False
    failed_step: int = -1
    unavailable: str = ""

    @property
    def ok(self) -> bool:
        return not self.unavailable and not self.timed_out and self.returncode == 0


# -----------------------------------------------------------------------------
# Workspace
# -----------------------------------------------------------------------------

@contextmanager
def sandbox_workspace():
    """
    A throwaway directory outside the repository, removed on exit. Candidate code
    runs with this as its cwd so a relative path cannot reach project files.
    """
    workdir = tempfile.mkdtemp(prefix="prepflow-sbx-")
    try:
        yield workdir
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def write_source(workdir: str, filename: str, content: str) -> str:
    path = os.path.join(workdir, filename)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    return path


def artifact_path(workdir: str, name: str) -> str:
    """
    Where a compiled binary should be written. In docker mode the source mount is
    read-only, so build output goes to the container's tmpfs.
    """
    if sandbox_mode() == MODE_DOCKER:
        return f"{CONTAINER_TMP}/{name}"
    suffix = ".exe" if IS_WINDOWS else ""
    return os.path.join(workdir, name + suffix)


# -----------------------------------------------------------------------------
# Toolchain resolution
# -----------------------------------------------------------------------------

def toolchain(language: str) -> Dict[str, str]:
    """
    Resolves the executable and (for docker mode) the image for a language.
    Returns {"exe", "image", "extra_args", "error"} — a non-empty "error" is a
    message safe to show the candidate.
    """
    lang = (language or "python").lower()
    mode = sandbox_mode()

    if mode == MODE_DOCKER:
        if not shutil.which("docker"):
            return {"exe": "", "image": "", "extra_args": [],
                    "error": "SANDBOX_MODE=docker is set but the docker CLI is not on PATH."}
        if lang == "node":
            image = os.environ.get("SANDBOX_IMAGE_NODE") or _DEFAULT_IMAGES["node"]
            return {"exe": "node", "image": image,
                    "extra_args": ["--max-old-space-size=256"], "error": ""}
        if lang == "cpp":
            image = os.environ.get("SANDBOX_IMAGE_CPP") or _DEFAULT_IMAGES["cpp"]
            return {"exe": "g++", "image": image, "extra_args": [], "error": ""}
        image = os.environ.get("SANDBOX_IMAGE_PYTHON") or _DEFAULT_IMAGES["python"]
        return {"exe": "python3", "image": image, "extra_args": ["-I"], "error": ""}

    # Hardened mode: resolve from PATH. No hardcoded absolute paths — the old
    # version pointed at one developer's Node install and WinGet MinGW build,
    # which is not something another machine can satisfy.
    if lang == "node":
        exe = shutil.which("node")
        if not exe:
            return {"exe": "", "image": "", "extra_args": [],
                    "error": "Node.js is not available on this server, so JavaScript and TypeScript submissions cannot be run."}
        return {"exe": exe, "image": "", "extra_args": ["--max-old-space-size=256"], "error": ""}

    if lang == "cpp":
        exe = shutil.which("g++") or shutil.which("clang++")
        if not exe:
            return {"exe": "", "image": "", "extra_args": [],
                    "error": "No C++ compiler (g++ or clang++) is available on this server, so C++ submissions cannot be run."}
        return {"exe": exe, "image": "", "extra_args": [], "error": ""}

    # `-I` isolates the interpreter: no PYTHON* env vars, no user site-packages,
    # and the script directory is kept off sys.path.
    return {"exe": sys.executable, "image": "", "extra_args": ["-I"], "error": ""}


# -----------------------------------------------------------------------------
# Environment & process limits
# -----------------------------------------------------------------------------

def _child_env(workdir: str) -> Dict[str, str]:
    names = _ENV_ALLOWLIST_WINDOWS if IS_WINDOWS else _ENV_ALLOWLIST_POSIX
    env = {name: os.environ[name] for name in names if os.environ.get(name)}
    # Point every "where do I write scratch files" variable at the throwaway dir.
    env["HOME"] = workdir
    env["TMPDIR"] = workdir
    env["TEMP"] = workdir
    env["TMP"] = workdir
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    return env


def _preexec(limits: Limits):
    if IS_WINDOWS or resource is None:
        return None

    def _apply():
        # New session so a timeout can kill the whole process group, not just the
        # direct child (a fork bomb's children would otherwise survive).
        try:
            os.setsid()
        except OSError:
            pass
        _set(resource.RLIMIT_CPU, limits.cpu_seconds)
        _set(resource.RLIMIT_FSIZE, limits.file_size_mb * 1024 * 1024)
        _set(resource.RLIMIT_NPROC, limits.max_processes)
        _set(resource.RLIMIT_CORE, 0)
        if limits.apply_address_space_limit:
            _set(resource.RLIMIT_AS, limits.memory_mb * 1024 * 1024)

    def _set(what, value):
        try:
            resource.setrlimit(what, (value, value))
        except (ValueError, OSError):
            pass

    return _apply


def _creation_flags() -> int:
    if not IS_WINDOWS:
        return 0
    # No console window, and its own process group so taskkill /T reaches
    # anything the submission spawned.
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)


def _kill_tree(proc: subprocess.Popen) -> None:
    try:
        if IS_WINDOWS:
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)],
                           capture_output=True, timeout=15)
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        pass
    try:
        proc.kill()
    except Exception:
        pass


# -----------------------------------------------------------------------------
# Output capture
# -----------------------------------------------------------------------------

def _read_capped(path: str) -> (str, bool):
    if not os.path.exists(path):
        return "", False
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            data = f.read(MAX_OUTPUT_BYTES)
        text = data.decode("utf-8", errors="replace")
        if size > MAX_OUTPUT_BYTES:
            text += f"\n… output truncated at {MAX_OUTPUT_BYTES // 1024} KB."
            return text, True
        return text, False
    except Exception:
        return "", False


def _scrub_paths(text: str, workdir: str) -> str:
    """
    Compiler diagnostics and interpreter tracebacks quote the absolute source
    path, which would show an untrusted candidate the server's temp directory and
    OS user name. The filename is what makes the message useful; the directory is
    not, so only the directory is removed.
    """
    if not text or not workdir:
        return text
    for variant in {workdir, workdir.replace("\\", "/"), workdir.replace("/", "\\")}:
        for sep in ("\\", "/"):
            text = text.replace(variant + sep, "")
        text = text.replace(variant, "")
    return text


# -----------------------------------------------------------------------------
# Docker command construction
# -----------------------------------------------------------------------------

def _to_container_path(token: str, workdir: str) -> str:
    try:
        if os.path.isabs(token) and os.path.commonpath([os.path.abspath(token), workdir]) == workdir:
            rel = os.path.relpath(os.path.abspath(token), workdir).replace(os.sep, "/")
            return f"{CONTAINER_MOUNT}/{rel}"
    except ValueError:
        pass
    return token


def _docker_shell_command(steps: Sequence[Sequence[str]], workdir: str) -> str:
    """
    Joins the steps into one shell command, tagging which step failed so the
    caller can still tell a compile error from a runtime error.
    """
    parts = []
    for idx, step in enumerate(steps):
        quoted = " ".join(shlex.quote(_to_container_path(tok, workdir)) for tok in step)
        parts.append(f'{quoted} || {{ echo "{_STEP_FAILED_MARKER}:{idx}" >&2; exit 1; }}')
    return "; ".join(parts)


def _docker_argv(command: str, workdir: str, image: str, limits: Limits, name: str) -> List[str]:
    return [
        "docker", "run", "--rm",
        "--name", name,
        "--network=none",
        "--read-only",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--user", "65534:65534",
        "--memory", f"{limits.memory_mb}m",
        "--memory-swap", f"{limits.memory_mb}m",
        "--cpus", limits.cpu_share,
        "--pids-limit", str(limits.max_processes),
        "--tmpfs", f"{CONTAINER_TMP}:size=64m,exec,mode=1777",
        "--log-driver", "none",
        "-v", f"{workdir}:{CONTAINER_MOUNT}:ro",
        "-w", CONTAINER_MOUNT,
        image, "sh", "-c", command,
    ]


# -----------------------------------------------------------------------------
# Public entry point
# -----------------------------------------------------------------------------

def execute_untrusted(
    steps: Sequence[Sequence[str]],
    workdir: str,
    limits: Optional[Limits] = None,
    image: str = "",
    stdin_data: str = "",
) -> SandboxResult:
    """
    Runs one or more commands over candidate-supplied source. `steps` is a list
    of argv lists — a single-element list for interpreted languages, two for a
    compile-then-run language. Execution stops at the first step that exits
    non-zero, and `failed_step` reports its index.

    In hardened mode each step is a separate scrubbed subprocess. In docker mode
    all steps run inside one container so that build output on the container's
    tmpfs is still there for the run step.
    """
    limits = limits or Limits()
    steps = [list(s) for s in steps if s]
    if not steps:
        return SandboxResult(unavailable="Nothing to execute.")

    warn_once_if_unconfined()
    out_path = os.path.join(workdir, ".sandbox.out")
    err_path = os.path.join(workdir, ".sandbox.err")

    if sandbox_mode() == MODE_DOCKER:
        if not image:
            return SandboxResult(unavailable="No sandbox image configured for this language.")
        name = f"prepflow-sbx-{os.getpid()}-{next(_container_counter)}"
        argv = _docker_argv(_docker_shell_command(steps, workdir), workdir, image, limits, name)
        result = _spawn(argv, workdir, limits, out_path, err_path, stdin_data,
                        scrub_env=True, container_name=name)
        if _STEP_FAILED_MARKER in result.stderr:
            for line in result.stderr.splitlines():
                if line.startswith(_STEP_FAILED_MARKER):
                    try:
                        result.failed_step = int(line.split(":", 1)[1])
                    except (IndexError, ValueError):
                        pass
                    break
            result.stderr = "\n".join(
                ln for ln in result.stderr.splitlines() if not ln.startswith(_STEP_FAILED_MARKER)
            )
        return result

    last = SandboxResult()
    for idx, step in enumerate(steps):
        last = _spawn(step, workdir, limits, out_path, err_path,
                      stdin_data if idx == len(steps) - 1 else "", scrub_env=True)
        if last.unavailable or last.timed_out or last.returncode != 0:
            last.failed_step = idx
            return last
    return last


def _spawn(
    argv: Sequence[str],
    workdir: str,
    limits: Limits,
    out_path: str,
    err_path: str,
    stdin_data: str,
    scrub_env: bool,
    container_name: str = "",
) -> SandboxResult:
    result = SandboxResult()
    try:
        with open(out_path, "wb") as out_f, open(err_path, "wb") as err_f:
            proc = subprocess.Popen(
                list(argv),
                cwd=workdir,
                env=_child_env(workdir) if scrub_env else None,
                stdin=subprocess.PIPE if stdin_data else subprocess.DEVNULL,
                stdout=out_f,
                stderr=err_f,
                preexec_fn=_preexec(limits) if not container_name else None,
                creationflags=_creation_flags(),
                close_fds=True,
            )
            try:
                if stdin_data:
                    proc.communicate(input=stdin_data.encode("utf-8"), timeout=limits.wall_seconds)
                else:
                    proc.wait(timeout=limits.wall_seconds)
            except subprocess.TimeoutExpired:
                result.timed_out = True
                if container_name:
                    # Killing the docker CLI leaves the container running.
                    try:
                        subprocess.run(["docker", "kill", container_name],
                                       capture_output=True, timeout=20)
                    except Exception:
                        pass
                _kill_tree(proc)
                try:
                    proc.wait(timeout=10)
                except Exception:
                    pass
            result.returncode = proc.returncode if proc.returncode is not None else -1
    except FileNotFoundError as e:
        return SandboxResult(unavailable=f"Execution toolchain not found: {e}")
    except Exception as e:
        return SandboxResult(unavailable=f"Sandbox could not start the process: {e}")

    stdout, out_trunc = _read_capped(out_path)
    stderr, err_trunc = _read_capped(err_path)
    result.stdout = _scrub_paths(stdout, workdir)
    result.stderr = _scrub_paths(stderr, workdir)
    result.truncated = out_trunc or err_trunc
    return result
