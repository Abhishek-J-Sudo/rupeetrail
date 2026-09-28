#!/usr/bin/env python3
"""
Start RupeeTrail

    python start.py              run it (sets itself up the first time)
    python start.py --port 5180  the same on another port
    python start.py --dev        for developers: the API with auto-reload plus Vite's live screens

Running it needs only Python: the first run makes a Python environment in backend/venv and
installs what the app needs, and after that it just starts. The screens come prebuilt in a
release download; in a copy of the source code they're built here, which needs Node.js.
Everything listens on 127.0.0.1 only, so nothing else on the network can reach it.
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import venv
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
DIST = FRONTEND / "dist"
VENV = BACKEND / "venv"
VENV_PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

PORT = 5175        # the address people open: http://localhost:5175
DEV_API_PORT = 8000  # --dev only: the API on its own port, Vite on PORT
SUPPORTED = ((3, 10), (3, 13))  # the pinned packages have ready-made installs for these


def say(msg=""):
    print(msg, flush=True)


def fail(msg):
    say(f"\n  {msg}\n")
    sys.exit(1)


def check_python():
    low, high = SUPPORTED
    if sys.version_info[:2] < low:
        fail(f"RupeeTrail needs Python {low[0]}.{low[1]} or newer; this is {sys.version.split()[0]}.")
    if sys.version_info[:2] > high:
        say(f"  Note: tested with Python up to {high[0]}.{high[1]}; this is {sys.version.split()[0]}. "
            "If installing fails, install Python 3.13.")


def python_env(requirements):
    """backend/venv with the requirements installed; reinstalls only when the file changes"""
    if not VENV_PYTHON.exists():
        say("Setting up Python for RupeeTrail (first time only)...")
        venv.create(VENV, with_pip=True)

    wanted = requirements.name + ":" + hashlib.sha256(
        b"".join(p.read_bytes() for p in (BACKEND / "requirements.txt", requirements))
    ).hexdigest()
    marker = VENV / ".rupeetrail-installed"
    if marker.exists() and marker.read_text() == wanted:
        return
    say("Installing what RupeeTrail needs (a few minutes the first time)...")
    result = subprocess.run(
        [str(VENV_PYTHON), "-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", requirements.name],
        cwd=BACKEND,
    )
    if result.returncode:
        fail("Installing failed (see above). Check the internet connection and try again.")
    marker.write_text(wanted)


def npm(*args):
    exe = shutil.which("npm")
    if not exe:
        fail("This copy has no built screens, and building them needs Node.js (https://nodejs.org).\n"
             "  Or download a release from GitHub, which includes them.")
    if subprocess.run([exe, *args], cwd=FRONTEND).returncode:
        fail(f"`npm {' '.join(args)}` failed (see above).")


def node_modules():
    if not (FRONTEND / "node_modules").exists():
        say("Installing the tools that build the screens (first time only)...")
        npm("install", "--no-audit", "--no-fund")


def newest_source():
    paths = [FRONTEND / "index.html", FRONTEND / "package.json", FRONTEND / "vite.config.js"]
    for folder in (FRONTEND / "src", FRONTEND / "public"):
        paths += [p for p in folder.rglob("*") if p.is_file()]
    return max((p.stat().st_mtime for p in paths if p.exists()), default=0)


def screens():
    """frontend/dist, built when missing or older than the source"""
    built = DIST / "index.html"
    if not (FRONTEND / "src").exists():  # a release: prebuilt, no source
        if not built.exists():
            fail("The screens are missing from this download (frontend/dist). Download the release again.")
        return
    if built.exists() and built.stat().st_mtime >= newest_source():
        return
    node_modules()
    say("Building the screens...")
    npm("run", "build")


def health(port, path):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=1) as r:
            return json.load(r).get("status") == "healthy"
    except Exception:
        return False


def port_in_use(port):
    """Taken on either localhost: Vite, for one, listens only on ::1"""
    import socket
    for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        try:
            with socket.socket(family) as s:
                s.settimeout(1)
                if s.connect_ex((host, port)) == 0:
                    return True
        except OSError:  # no IPv6 on this machine
            pass
    return False


def wait_for(port, path, process, seconds=90):
    for _ in range(seconds * 4):
        if health(port, path):
            return True
        if process.poll() is not None:
            return False
        time.sleep(0.25)
    return False


def stop(*processes):
    for p in processes:
        if p.poll() is None:
            if os.name == "nt":  # also ends the children (uvicorn's reloader, Vite under npm)
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                p.terminate()


def uvicorn(target, port, log_level, *extra):
    return subprocess.Popen(
        [str(VENV_PYTHON), "-m", "uvicorn", target, "--host", "127.0.0.1", "--port", str(port), *extra],
        cwd=BACKEND,
        env={**os.environ, "RUPEETRAIL_LOG_LEVEL": log_level},
    )


def run(port):
    url = f"http://localhost:{port}"
    if port_in_use(port):
        if health(port, "/api/health"):
            say(f"RupeeTrail is already running. Opening {url}")
            webbrowser.open(url)
            return
        fail(f"Another program is using port {port}. Close it, or start with --port and another number.")

    check_python()
    python_env(BACKEND / "requirements.txt")
    screens()

    say("Starting RupeeTrail...")
    server = uvicorn("app.server:app", port, "WARNING", "--log-level", "warning")
    try:
        if not wait_for(port, "/api/health", server):
            stop(server)
            fail("RupeeTrail didn't start (see above).")
        say(f"\n  RupeeTrail is running at {url}")
        say("  Your data stays on your computer. Close this window or press Ctrl+C to stop.\n")
        webbrowser.open(url)
        server.wait()
    except KeyboardInterrupt:
        say("\nStopping RupeeTrail...")
    finally:
        stop(server)


def run_dev():
    for port in (DEV_API_PORT, PORT):
        if port_in_use(port):
            fail(f"Port {port} is in use (RupeeTrail already running?). Stop it first.")

    check_python()
    python_env(BACKEND / "requirements-dev.txt")
    node_modules()

    api = uvicorn("app.main:app", DEV_API_PORT, "DEBUG", "--reload")
    web = subprocess.Popen([shutil.which("npm"), "run", "dev"], cwd=FRONTEND)
    try:
        if wait_for(DEV_API_PORT, "/health", api):
            say(f"\n  Screens: http://localhost:{PORT}   API: http://localhost:{DEV_API_PORT}/docs")
            say("  Ctrl+C stops both.\n")
            webbrowser.open(f"http://localhost:{PORT}")
        api.wait()
    except KeyboardInterrupt:
        say("\nStopping...")
    finally:
        stop(api, web)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Start RupeeTrail")
    parser.add_argument("--dev", action="store_true", help="developer mode: live-reloading screens and API")
    parser.add_argument("--port", type=int, default=PORT, help=f"the port to open it on (default {PORT})")
    args = parser.parse_args()
    run_dev() if args.dev else run(args.port)
