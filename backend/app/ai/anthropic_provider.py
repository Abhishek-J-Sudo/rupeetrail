"""
Anthropic (Claude) adapter for chat_json, using the official SDK

Structured outputs (output_config.format) make the reply valid JSON for the given schema.
Server-side fallbacks ("default") re-run a request that a model's safety classifier declines
on Anthropic's recommended fallback model, instead of failing.
"""

import json
import logging
from typing import Optional

import anthropic

from .client import AIError, parse_json

logger = logging.getLogger(__name__)

FALLBACK_BETA = "server-side-fallback-2026-07-01"
# Thinking tokens count towards max_tokens; you only pay for what's used
MIN_MAX_TOKENS = 16000


async def chat_json(config: dict, system: str, user: str, max_tokens: int, timeout: int,
                    schema: Optional[dict]) -> dict:
    client = anthropic.AsyncAnthropic(api_key=config["api_key"], timeout=float(max(timeout, 60)), max_retries=2)
    request = {
        "model": config["model"],
        "max_tokens": max(max_tokens, MIN_MAX_TOKENS),
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "betas": [FALLBACK_BETA],
        "fallbacks": "default",
    }
    if schema:
        request["output_config"] = {"format": {"type": "json_schema", "schema": schema}}

    try:
        response = await client.beta.messages.create(**request)
    except anthropic.AuthenticationError as e:
        raise AIError("Anthropic rejected the API key. Check it in Settings → AI.") from e
    except anthropic.PermissionDeniedError as e:
        raise AIError("This Anthropic API key isn't allowed to use that model.") from e
    except anthropic.NotFoundError as e:
        raise AIError("Anthropic doesn't know that model. Check the model name in Settings → AI.") from e
    except anthropic.RateLimitError as e:
        raise AIError("Anthropic rate limit hit. Try again in a minute.") from e
    except anthropic.BadRequestError as e:
        logger.error(f"Anthropic 400: {e.message}")
        raise AIError(f"Anthropic refused the request: {e.message}") from e
    except anthropic.APIStatusError as e:
        logger.error(f"Anthropic HTTP {e.status_code}: {e.message}")
        raise AIError(f"Anthropic returned HTTP {e.status_code}. Try again later.") from e
    except anthropic.APIConnectionError as e:
        raise AIError("Couldn't reach Anthropic. Check the internet connection.") from e
    finally:
        await client.close()

    if response.stop_reason == "refusal":
        raise AIError("Claude declined this request.")
    if response.stop_reason == "max_tokens":
        raise AIError("Claude's answer was cut off. Try again.")

    text = next((block.text for block in response.content if block.type == "text"), None)
    if text is None:
        raise AIError("Anthropic returned an unexpected response.")
    if schema:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass  # fall through to the lenient parser
    return parse_json(text, "Claude")
