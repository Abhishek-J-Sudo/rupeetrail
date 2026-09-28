"""AI endpoints"""

import logging
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .client import (
    AIError, get_config, is_configured, ollama_models, save_settings, settings_view, test_connection
)
from . import insights, payees

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


class InsightsRequest(BaseModel):
    period: str = Field(..., pattern=insights.PERIOD_PATTERN, description="YYYY-MM, YYYY, YYYY-MM:YYYY-MM or all")
    version_id: Optional[int] = None  # an earlier saved version; latest if omitted


class ApplyItem(BaseModel):
    name: Optional[str] = Field(None, max_length=200)  # cleaned payee name, marks its suggestion applied
    merchants: List[str] = Field(..., min_length=1)
    category: Optional[str] = None  # None = keep the category
    display_name: Optional[str] = Field(None, max_length=60)  # None = keep the name


class SuggestRequest(BaseModel):
    only_new: bool = True  # False re-asks the AI about every payee


class ApplyRequest(BaseModel):
    items: List[ApplyItem]


class DismissRequest(BaseModel):
    names: List[str]


def _ai_error(e: AIError):
    return HTTPException(status_code=502, detail=str(e))


ProviderId = Literal["deepseek", "openai", "anthropic", "ollama"]
BaseUrl = Field(None, max_length=300, pattern=r"^(https?://\S+)?$")


class AISettings(BaseModel):
    provider: Optional[ProviderId] = None  # None = AI off
    api_key: Optional[str] = Field(None, max_length=500)  # None keeps the saved key, "" removes it
    model: Optional[str] = Field(None, max_length=100)  # "" = the provider's default
    base_url: Optional[str] = BaseUrl


class AITest(BaseModel):
    provider: ProviderId
    api_key: Optional[str] = Field(None, max_length=500)  # untyped = the saved key
    model: Optional[str] = Field(None, max_length=100)
    base_url: Optional[str] = BaseUrl


@router.get("/status")
async def ai_status():
    config = get_config()
    return {"configured": is_configured(), "provider": config["provider"], "model": config["model"]}


@router.get("/settings")
async def read_ai_settings():
    """Providers, which one is on, and models; a saved key shows only as its last 4 characters"""
    return settings_view()


@router.put("/settings")
async def update_ai_settings(body: AISettings):
    return save_settings(body.provider, body.api_key, body.model, body.base_url)


@router.get("/ollama/models")
async def list_ollama_models(base_url: Optional[str] = Query(None, max_length=300, pattern=r"^https?://\S+$")):
    """Models installed in Ollama, for the model picker"""
    try:
        return {"models": ollama_models(base_url)}
    except AIError as e:
        raise _ai_error(e)


@router.post("/test")
async def test_ai(body: AITest):
    """Check a key and model with a tiny request, before or after saving them"""
    config = get_config(body.provider, {"api_key": body.api_key, "model": body.model, "base_url": body.base_url})
    try:
        return await test_connection(config)
    except AIError as e:
        raise _ai_error(e)


@router.post("/insights/preview")
async def insights_preview(req: InsightsRequest):
    """The exact data that would be sent, plus any cached insight (no AI call)"""
    payload = insights.build_payload(req.period)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"No transactions for {req.period}")
    return {
        "period": req.period,
        "payload": payload,
        "cached": insights.get_cached(req.period, payload, req.version_id),
        "configured": is_configured(),
        "saved_periods": insights.saved_periods(),
    }


@router.post("/insights/generate")
async def insights_generate(req: InsightsRequest):
    payload = insights.build_payload(req.period)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"No transactions for {req.period}")
    try:
        cached = await insights.generate(req.period, payload)
    except AIError as e:
        raise _ai_error(e)
    return {"period": req.period, "payload": payload, "cached": cached, "configured": True}


@router.get("/payees/review")
async def payee_review():
    """Saved suggestions for business payees: category and clean name (no AI call)"""
    return payees.get_review()


@router.get("/payees/preview")
async def payee_preview(only_new: bool = True):
    """Exactly what a review would send to the AI"""
    return payees.preview_payload(only_new)


@router.post("/payees/suggest")
async def payee_suggest(req: SuggestRequest = SuggestRequest()):
    try:
        return await payees.suggest(only_new=req.only_new)
    except AIError as e:
        raise _ai_error(e)


@router.post("/payees/apply")
async def payee_apply(req: ApplyRequest):
    result = payees.apply([item.model_dump() for item in req.items])
    logger.info(f"AI payee review applied: {result}")
    return result


@router.post("/payees/dismiss")
async def payee_dismiss(req: DismissRequest):
    return payees.dismiss(req.names)
