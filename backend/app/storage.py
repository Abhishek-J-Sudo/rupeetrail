"""
Where RupeeTrail keeps things on this computer, and what happens to statement files.

Everything lives in one data folder: the database, its backups, the settings file and, only if
the user asks for it, copies of imported statements. Nothing here talks to the network.

The folder is `data/` next to the app unless RUPEETRAIL_DATA_DIR says otherwise (in backend/.env
or the environment), e.g. to keep data on another drive or outside the app folder so it survives
replacing the app. A relative path counts from the app folder; `~` is the user's home folder.

An imported file is first written to `data/incoming/` under a random name (never the name the
browser sent, which could contain `../` or clash with another file), read, and then either
deleted (the default) or moved to `data/uploads/` under a dated, cleaned-up name.
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import dotenv_values

logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = APP_DIR / "backend" / ".env"


def _data_dir() -> Path:
    env = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}
    chosen = (env.get("RUPEETRAIL_DATA_DIR") or os.getenv("RUPEETRAIL_DATA_DIR") or "").strip()
    if not chosen:
        return APP_DIR / "data"
    path = Path(chosen).expanduser()
    return (path if path.is_absolute() else APP_DIR / path).resolve()


DATA_DIR = _data_dir()
UPLOAD_DIR = DATA_DIR / "uploads"
INCOMING_DIR = DATA_DIR / "incoming"
SETTINGS_PATH = DATA_DIR / "settings.json"
# "Try with sample data" uses its own database, so made-up rows never mix with real ones
SAMPLE_DB_PATH = DATA_DIR / "sample.db"

DEFAULTS = {"keep_statements": False, "sample": False}


def ensure_dirs():
    for folder in (DATA_DIR, UPLOAD_DIR, INCOMING_DIR):
        folder.mkdir(parents=True, exist_ok=True)


def clear_incoming():
    """Remove files left in incoming/ by an import that was cut off (app closed mid-read)."""
    for leftover in INCOMING_DIR.glob("*"):
        if leftover.is_file():
            leftover.unlink(missing_ok=True)


def load_settings() -> dict:
    try:
        stored = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        stored = {}
    return {**DEFAULTS, **{k: v for k, v in stored.items() if k in DEFAULTS}}


def save_settings(changes: dict) -> dict:
    settings = {**load_settings(), **{k: v for k, v in changes.items() if k in DEFAULTS}}
    SETTINGS_PATH.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    return settings


def storage_info() -> dict:
    """The setting plus the real folders, so the UI can say exactly where things are."""
    return {
        **load_settings(),
        "data_dir": str(DATA_DIR),
        "uploads_dir": str(UPLOAD_DIR),
    }


def incoming_path(ext: str) -> Path:
    """A fresh, unguessable path to write an imported file to while it's read."""
    return INCOMING_DIR / f"{uuid.uuid4().hex}.{ext}"


def _clean_stem(filename: str) -> str:
    # Only the last path part, then letters, digits, dot, dash and underscore
    stem = Path(filename.replace("\\", "/")).stem
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._")
    return stem[:80] or "statement"


def finish(temp_path: Path, original_name: str, ext: str, keep: bool):
    """After reading: keep a dated copy in uploads/ if asked, and always clear incoming/."""
    if not temp_path.exists():
        return None
    if keep:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target = UPLOAD_DIR / f"{stamp}_{_clean_stem(original_name)}.{ext}"
        temp_path.replace(target)
        logger.info(f"Kept a copy of the statement at {target}")
        return target
    temp_path.unlink(missing_ok=True)
    logger.info("Statement file deleted after reading")
    return None
