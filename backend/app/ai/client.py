"""
AI provider client: bring your own key

The provider and its key live in backend/.env (never sent back to the browser):
  AI_PROVIDER=none|deepseek|openai|anthropic|ollama
  <PROVIDER>_API_KEY, and optional <PROVIDER>_MODEL / <PROVIDER>_BASE_URL overrides
The file is read on every call, so changes apply without a restart. Older setups with only
DEEPSEEK_API_KEY keep working as DeepSeek.

DeepSeek and OpenAI speak the OpenAI chat API and Ollama its own (plain HTTP below, so Ollama
can switch thinking off and enforce the JSON schema); Anthropic has its own adapter
(anthropic_provider.py, official SDK).
"""

import os
import json
import asyncio
import logging
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

from dotenv import dotenv_values, set_key, unset_key

logger = logging.getLogger(__name__)

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

PROVIDERS = {
    "deepseek": {
        "label": "DeepSeek",
        "kind": "openai",
        "needs_key": True,
        "model": "deepseek-chat",
        "base_url": "https://api.deepseek.com",
        "key_url": "https://platform.deepseek.com/api_keys",
        "privacy_url": "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html",
    },
    "openai": {
        "label": "OpenAI",
        "kind": "openai",
        "needs_key": True,
        "model": "gpt-5-mini",
        "base_url": "https://api.openai.com/v1",
        "key_url": "https://platform.openai.com/api-keys",
        "privacy_url": "https://openai.com/policies/privacy-policy/",
    },
    "anthropic": {
        "label": "Anthropic (Claude)",
        "kind": "anthropic",
        "needs_key": True,
        "model": "claude-opus-5",
        "base_url": None,
        "key_url": "https://console.anthropic.com/settings/keys",
        "privacy_url": "https://www.anthropic.com/legal/privacy",
    },
    "ollama": {
        "label": "Ollama (on your computer)",
        "kind": "ollama",
        "needs_key": False,
        "model": "llama3.1",
        "base_url": "http://localhost:11434",
        "key_url": "https://ollama.com/download",
    },
}


class AIError(Exception):
    """User-facing error from the AI integration"""


def _env() -> dict:
    return dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}


def _read(env: dict, name: str) -> str:
    return (env.get(name) or os.getenv(name) or "").strip()


def _var(provider: str, what: str) -> str:
    return f"{provider.upper()}_{what}"


def active_provider(env: Optional[dict] = None) -> Optional[str]:
    """The chosen provider id, or None when AI is off"""
    env = _env() if env is None else env
    chosen = _read(env, "AI_PROVIDER").lower()
    if chosen in PROVIDERS:
        return chosen
    if not chosen and _read(env, "DEEPSEEK_API_KEY"):
        return "deepseek"  # set up before AI_PROVIDER existed
    return None


def get_config(provider: Optional[str] = None, overrides: Optional[dict] = None) -> dict:
    """Everything needed to call a provider (the active one by default); includes the key"""
    env = _env()
    provider = provider or active_provider(env)
    if provider is None:
        return {"provider": None, "api_key": "", "model": None, "base_url": None}
    spec = PROVIDERS[provider]
    overrides = {k: v for k, v in (overrides or {}).items() if v}
    return {
        "provider": provider,
        "kind": spec["kind"],
        "label": spec["label"],
        "needs_key": spec["needs_key"],
        "api_key": overrides.get("api_key") or _read(env, _var(provider, "API_KEY")),
        "model": overrides.get("model") or _read(env, _var(provider, "MODEL")) or spec["model"],
        "base_url": (overrides.get("base_url") or _read(env, _var(provider, "BASE_URL")) or spec["base_url"] or "").rstrip("/"),
    }


def is_configured() -> bool:
    config = get_config()
    return config["provider"] is not None and (bool(config["api_key"]) or not config["needs_key"])


def settings_view() -> dict:
    """What the Settings screen shows: never the key itself, only its last 4 characters"""
    env = _env()
    providers = []
    for pid, spec in PROVIDERS.items():
        key = _read(env, _var(pid, "API_KEY"))
        providers.append({
            "id": pid,
            "label": spec["label"],
            "needs_key": spec["needs_key"],
            "key_saved": bool(key),
            "key_hint": f"••••{key[-4:]}" if len(key) >= 8 else ("••••" if key else None),
            "model": _read(env, _var(pid, "MODEL")) or None,
            "default_model": spec["model"],
            "base_url": _read(env, _var(pid, "BASE_URL")) or None,
            "default_base_url": spec["base_url"],
            "key_url": spec["key_url"],
            "privacy_url": spec.get("privacy_url"),
        })
    return {"provider": active_provider(env), "configured": is_configured(), "providers": providers}


def save_settings(provider: Optional[str], api_key: Optional[str] = None,
                  model: Optional[str] = None, base_url: Optional[str] = None) -> dict:
    """
    Choose the provider (None = AI off) and update its settings in backend/.env.
    api_key: None keeps the saved key, "" removes it. model / base_url: "" goes back to the default.
    """
    ENV_PATH.touch(exist_ok=True)
    path = str(ENV_PATH)

    def put(name, value):
        if value:
            set_key(path, name, value)
        elif name in _env():
            unset_key(path, name)

    put("AI_PROVIDER", provider or "none")
    if provider:
        if api_key is not None:
            put(_var(provider, "API_KEY"), api_key.strip())
        if model is not None:
            put(_var(provider, "MODEL"), model.strip())
        if base_url is not None:
            put(_var(provider, "BASE_URL"), base_url.strip())
    return settings_view()


# ---------- HTTP providers (DeepSeek, OpenAI, Ollama) ----------

def _post(url: str, body: dict, api_key: str, timeout: int, label: str) -> dict:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:300]
        logger.error(f"{label} HTTP {e.code}: {detail}")
        try:
            reason = json.loads(detail).get("error")  # Ollama explains itself
        except (ValueError, AttributeError):
            reason = None
        messages = {
            401: f"{label} rejected the API key. Check it in Settings → AI.",
            402: f"Your {label} account has insufficient balance.",
            404: f"{label} doesn't know that model. Check the model name in Settings → AI.",
            429: f"{label} rate limit hit. Try again in a minute.",
        }
        fallback = f"{label}: {reason}" if isinstance(reason, str) else f"{label} returned HTTP {e.code}."
        raise AIError(messages.get(e.code, fallback)) from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise AIError(f"Couldn't reach {label} ({getattr(e, 'reason', e)}).") from e


def parse_json(content: str, label: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):]
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"{label} returned non-JSON content: {content[:300]}")
        raise AIError(f"{label} returned an unreadable response. Try again.") from e


async def _openai_chat_json(config: dict, system: str, user: str, max_tokens: int, timeout: int) -> dict:
    body = {
        "model": config["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }
    if config["provider"] == "openai":
        # Newer OpenAI models take max_completion_tokens and only their default temperature, and
        # reasoning ones think first out of the same allowance
        body["max_completion_tokens"] = max(max_tokens * 4, 4000)
    else:
        body["max_tokens"] = max_tokens
        body["temperature"] = 0.3
    data = await asyncio.to_thread(
        _post, f"{config['base_url']}/chat/completions", body, config["api_key"], timeout, config["label"]
    )
    try:
        choice = data["choices"][0]
        content = choice["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as e:
        raise AIError(f"{config['label']} returned an unexpected response.") from e
    if not content.strip() and choice.get("finish_reason") == "length":
        raise AIError("The model ran out of room before answering (it may be a slow thinking model). Try another model.")
    return parse_json(content, config["label"])


def ollama_models(base_url: Optional[str] = None) -> list:
    """Models installed in Ollama"""
    base = _ollama_base(base_url or get_config("ollama")["base_url"])
    try:
        with urllib.request.urlopen(f"{base}/api/tags", timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise AIError("Ollama isn't running on your computer. Start it, then try again.") from e
    return sorted(m["name"] for m in data.get("models", []) if m.get("name"))

def _ollama_base(base_url: str) -> str:
    base = base_url.rstrip("/")
    return base[:-3] if base.endswith("/v1") else base  # the OpenAI-style address works too


async def _ollama_chat_json(config: dict, system: str, user: str, max_tokens: int, timeout: int,
                            schema: Optional[dict]) -> dict:
    """Ollama's own chat API: thinking off (thinking models would spend the answer's room on it)
    and the reply held to the schema"""
    body = {
        "model": config["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "think": False,
        "format": schema or "json",
        "options": {"temperature": 0.3, "num_predict": max(max_tokens * 2, 1000)},
    }
    # Local models can be slow on a laptop, so allow longer than the cloud providers
    data = await asyncio.to_thread(
        _post, f"{_ollama_base(config['base_url'])}/api/chat", body, "", max(timeout, 300), config["label"]
    )
    content = (data.get("message") or {}).get("content") or ""
    if not content.strip():
        raise AIError("Ollama returned an empty answer. Try another model.")
    return parse_json(content, config["label"])


# ---------- entry point ----------

async def chat_json(system: str, user: str, max_tokens: int = 2000, timeout: int = 90,
                    schema: Optional[dict] = None, config: Optional[dict] = None) -> dict:
    """
    Send one request and return the reply as a JSON object. `schema` (JSON Schema for the
    reply) is enforced where the provider supports it; the prompt must describe the shape too.
    `config` defaults to the active provider (get_config()).
    """
    config = config or get_config()
    if config["provider"] is None:
        raise AIError("AI is off. Choose a provider in Settings → AI.")
    if config["needs_key"] and not config["api_key"]:
        raise AIError(f"Add your {config['label']} API key in Settings → AI.")

    if config["kind"] == "anthropic":
        from .anthropic_provider import chat_json as anthropic_chat_json
        return await anthropic_chat_json(config, system, user, max_tokens, timeout, schema)
    if config["kind"] == "ollama":
        return await _ollama_chat_json(config, system, user, max_tokens, timeout, schema)
    return await _openai_chat_json(config, system, user, max_tokens, timeout)


async def test_connection(config: dict) -> dict:
    """A tiny request to check the key and model work"""
    result = await chat_json(
        'Reply with the JSON object {"ok": true}.',
        "Connection test.",
        max_tokens=50,
        timeout=30,
        schema={"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False},
        config=config,
    )
    if result.get("ok") is not True:
        raise AIError(f"{config['label']} answered, but not as expected. Try another model.")
    return {"ok": True, "provider": config["provider"], "model": config["model"]}
