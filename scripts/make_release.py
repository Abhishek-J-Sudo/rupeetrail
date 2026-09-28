#!/usr/bin/env python3
"""
Make the download people get from GitHub Releases

    python scripts/make_release.py

Builds the screens, then zips what running RupeeTrail needs into release/rupeetrail-<version>.zip:
the launchers, the backend, the built screens (frontend/dist) and the README, licence and
privacy note. Files come from `git ls-files`, so nothing untracked or ignored (data/, .env,
rules_local.py, venv) can get in. The frontend source is left out on purpose: without it,
start.py knows it's a release and serves the prebuilt screens instead of trying to build them.
"""

import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "release"

TOP_FILES = {"start.py", "start.bat", "start.command", "README.md", "LICENSE", "PRIVACY.md"}
SKIP = ("backend/tests/", "backend/requirements-dev.txt")


def version():
    ns = {}
    exec((ROOT / "backend/app/__init__.py").read_text(encoding="utf-8"), ns)
    return ns["__version__"]


def tracked():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return out.splitlines()


def wanted(path):
    if path in TOP_FILES:
        return True
    return path.startswith("backend/") and not path.startswith(SKIP)


def main():
    if subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout.strip():
        sys.exit("Commit or discard your changes first, so the zip matches a commit.")

    npm = shutil.which("npm") or sys.exit("Building the screens needs Node.js.")
    subprocess.run([npm, "ci", "--no-audit", "--no-fund"], cwd=ROOT / "frontend", check=True)
    subprocess.run([npm, "run", "build"], cwd=ROOT / "frontend", check=True)

    files = [p for p in tracked() if wanted(p)]
    dist = ROOT / "frontend/dist"
    files += [p.relative_to(ROOT).as_posix() for p in dist.rglob("*") if p.is_file()]

    OUT.mkdir(exist_ok=True)
    zip_path = OUT / f"rupeetrail-{version()}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in sorted(files):
            info = zipfile.ZipInfo.from_file(ROOT / rel, f"rupeetrail/{rel}")
            if rel == "start.command":
                info.create_system = 3  # Unix, or the mode below is ignored
                info.external_attr = 0o100755 << 16  # executable on Mac and Linux
            with open(ROOT / rel, "rb") as f:
                z.writestr(info, f.read(), zipfile.ZIP_DEFLATED)

    print(f"\n{zip_path.relative_to(ROOT)}: {len(files)} files, {zip_path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
