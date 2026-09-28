"""
Review payees with AI: a category and a clean display name for every business payee

One pass asks the AI, for each business payee (debits grouped by cleaned name), for the best
category and the name people know it by ("Avenue Supermarts Lt" -> "DMart"). Only cleaned
business names, the current category, payment counts and average amounts are sent; payees that
might be people are never sent (privacy.shareable_merchant).

Answers are saved: reopening the review costs nothing, and a later run only asks about payees
not reviewed yet. Applied or dismissed payees aren't shown or sent again unless asked.
Display names live in payee_names (raw merchant -> name) and come back with /transactions.
"""

import json
from collections import Counter, defaultdict
from typing import Dict, List, Optional

from ..database import get_connection, bulk_update_categories
from ..categorizer.rules import get_all_categories
from ..payee_rules import rule_payee_name
from ..categorizer.learning import learn_merchant_category, taught_by_user
from .client import chat_json
from .privacy import shareable_merchant

BATCH_SIZE = 60
MAX_PAYEES = 300
MAX_NAME = 40

SYSTEM_PROMPT = """You review payees from an Indian bank statement.
Each payee is a business name cleaned from UPI/card narrations, so it may be truncated or run
together (e.g. "Avenue Supermarts Lt" is DMart, "Novi Digital Entertai" is JioHotstar), with its
current category, how many payments were made and the average amount in INR.

For each payee give:
- "category": the single best category from the allowed list. Keep the current category unless
  it is clearly wrong. If you genuinely can't tell, use "Other" with confidence "low".
- "confidence": "high", "medium" or "low" for the category.
- "display_name": the short name people know the business by ("DMart", "JioHotstar", "Groww",
  "Swiggy"). If you don't recognise the brand, tidy the given name instead (fix capitals, drop
  words like Pvt/Ltd and cut-off fragments) rather than guess. At most 4 words.

Reply with a JSON object exactly like:
{"payees": [{"id": 0, "category": "Groceries", "confidence": "high", "display_name": "DMart"}]}
Include every id you were given."""

REPLY_SCHEMA = {
    "type": "object",
    "properties": {
        "payees": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "category": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "display_name": {"type": "string"},
                },
                "required": ["id", "category", "confidence", "display_name"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["payees"],
    "additionalProperties": False,
}


def _ai_categories() -> List[str]:
    return [c for c in get_all_categories() if c not in ("Income", "Miscellaneous")]


def _display_names(conn) -> Dict[str, str]:
    return {r["merchant"]: r["display_name"] for r in conn.execute("SELECT merchant, display_name FROM payee_names")}


def _candidates() -> Dict:
    """Business payees (debits grouped by cleaned name), biggest spend first; possible people skipped"""
    conn = get_connection()
    rows = conn.execute(
        "SELECT merchant, narration, amount, category, category_source FROM transactions WHERE txn_type = 'debit' AND is_excluded = 0"
    ).fetchall()
    names = _display_names(conn)
    conn.close()

    groups = defaultdict(lambda: {"merchants": set(), "count": 0, "total": 0.0, "categories": Counter(), "manual": 0})
    skipped = {"count": 0, "total": 0.0}
    for r in rows:
        # Named by rules already (loan EMIs), so there's nothing to ask
        if rule_payee_name(r["merchant"], r["narration"]):
            continue
        name = shareable_merchant(r["merchant"], r["narration"], r["category"])
        if not name:
            skipped["count"] += 1
            skipped["total"] += abs(r["amount"])
            continue
        group = groups[name]
        group["merchants"].add(r["merchant"])
        group["count"] += 1
        group["total"] += abs(r["amount"])
        group["categories"][r["category"]] += 1
        group["manual"] += r["category_source"] == "manual"

    candidates = []
    for name, g in groups.items():
        merchants = sorted(g["merchants"])
        candidates.append({
            "name": name,
            "merchants": merchants,
            "count": g["count"],
            "total": round(g["total"]),
            "avg_amount": round(g["total"] / g["count"]),
            "category": g["categories"].most_common(1)[0][0],
            "set_by_you": g["manual"],  # rows the user categorised; a new category leaves them alone
            "display_name": next((names[m] for m in merchants if m in names), None),
        })
    candidates.sort(key=lambda c: c["total"], reverse=True)
    return {
        "candidates": candidates[:MAX_PAYEES],
        "skipped_personal": {"count": skipped["count"], "total": round(skipped["total"])},
    }


def _saved() -> Dict[str, Dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT name, category, confidence, display_name, status, created_at FROM ai_category_suggestions"
    ).fetchall()
    conn.close()
    return {r["name"]: dict(r) for r in rows}


def _clean_display(value, name: str) -> Optional[str]:
    text = " ".join(str(value or "").split())[:MAX_NAME].strip()
    return text if text and text.lower() != name.lower() else None


def _review(candidates: List[Dict], saved: Dict[str, Dict], allowed: List[str]) -> Dict:
    """Open suggestions that would change something, matched to the current payees"""
    rows, unchanged, pending, stamps = [], 0, 0, []
    for c in candidates:
        s = saved.get(c["name"])
        if not s:
            pending += 1
            continue
        stamps.append(s["created_at"])
        if s["status"] != "open":
            continue
        category = s["category"] if s["category"] in allowed and s["category"] != "Other" else None
        # Every row categorised by the user: nothing a new category could change
        locked = c["set_by_you"] == c["count"]
        new_category = category if category and category != c["category"] and not locked else None
        shown_name = c["display_name"] or c["name"]
        new_name = s["display_name"] if s["display_name"] and s["display_name"] != shown_name else None
        if not new_category and not new_name:
            unchanged += 1
            continue
        rows.append({
            **c,
            "suggested_category": new_category,
            "confidence": s["confidence"],
            "suggested_name": new_name,
        })
    return {
        "rows": rows,
        "unchanged": unchanged,  # reviewed, and the AI would keep them as they are
        "pending": pending,  # payees not reviewed yet
        "saved_at": max(stamps) if stamps else None,
    }


def get_review() -> Dict:
    """Current payees and any saved suggestions for them (no AI call)"""
    data = _candidates()
    allowed = _ai_categories()
    return {
        **_review(data["candidates"], _saved(), allowed),
        "payees": len(data["candidates"]),
        "skipped_personal": data["skipped_personal"],
        "categories": allowed,
    }


def _payload(batch: List[Dict], offset: int, allowed: List[str]) -> Dict:
    return {
        "allowed_categories": allowed,
        "payees": [
            {"id": offset + i, "name": c["name"], "current_category": c["category"], "payments": c["count"], "avg_amount": c["avg_amount"]}
            for i, c in enumerate(batch)
        ],
    }


def preview_payload(only_new: bool = True) -> Dict:
    """Exactly what suggest() would send, for "Show exactly what gets sent\""""
    data = _candidates()
    allowed = _ai_categories()
    saved = _saved()
    to_ask = [c for c in data["candidates"] if not (only_new and c["name"] in saved)]
    return _payload(to_ask, 0, allowed)


async def suggest(only_new: bool = True) -> Dict:
    """Ask the AI about payees not reviewed yet (or all of them) and save the answers"""
    data = _candidates()
    allowed = _ai_categories()
    saved = _saved()
    to_ask = [c for c in data["candidates"] if not (only_new and c["name"] in saved)]

    answers = {}
    for start in range(0, len(to_ask), BATCH_SIZE):
        payload = _payload(to_ask[start:start + BATCH_SIZE], start, allowed)
        result = await chat_json(SYSTEM_PROMPT, json.dumps(payload, ensure_ascii=False), max_tokens=6000, schema=REPLY_SCHEMA)
        for s in result.get("payees", []):
            if isinstance(s, dict) and isinstance(s.get("id"), int) and 0 <= s["id"] < len(to_ask):
                answers[s["id"]] = s

    # Save every answer, including "keep as it is", so those payees aren't sent again
    conn = get_connection()
    for i, c in enumerate(to_ask):
        s = answers.get(i)
        if not s:
            continue
        category = s.get("category") if s.get("category") in allowed else "Other"
        confidence = s.get("confidence") if s.get("confidence") in ("high", "medium", "low") else "low"
        conn.execute(
            """
            INSERT INTO ai_category_suggestions (name, category, confidence, display_name, status, created_at)
            VALUES (?, ?, ?, ?, 'open', CURRENT_TIMESTAMP)
            ON CONFLICT(name) DO UPDATE SET
                category = excluded.category, confidence = excluded.confidence,
                display_name = excluded.display_name, status = 'open', created_at = CURRENT_TIMESTAMP
            """,
            (c["name"], category, confidence, _clean_display(s.get("display_name"), c["name"])),
        )
    conn.commit()
    conn.close()
    return {**get_review(), "asked": len(to_ask)}


def apply(items: List[Dict]) -> Dict:
    """
    items: [{"name", "merchants": [raw merchant names], "category": str|None, "display_name": str|None}]
    A category recategorises those payees' debits (rows the user categorised are left alone)
    and teaches the learning system; a display name is saved for each raw merchant.
    """
    allowed = set(_ai_categories())

    # Look up rows first; bulk_update_categories and learn_merchant_category open their own
    # connections, and SQLite allows one writer, so no write may be pending here meanwhile
    conn = get_connection()
    plan = []
    for item in items:
        merchants = [m for m in item.get("merchants") or [] if isinstance(m, str)]
        category = item.get("category") if item.get("category") in allowed else None
        if not merchants:
            continue
        ids = []
        if category:
            placeholders = ",".join("?" * len(merchants))
            ids = [r[0] for r in conn.execute(
                f"""
                SELECT id FROM transactions
                WHERE txn_type = 'debit' AND category != ? AND merchant IN ({placeholders})
                  AND category_source != 'manual'
                """,
                [category, *merchants],
            ).fetchall()]
        plan.append((item, merchants, category, ids))
    conn.close()

    updated = named = 0
    for item, merchants, category, ids in plan:
        if category:
            if ids:
                updated += bulk_update_categories(ids, category, source="ai")
            for merchant in merchants:
                if not taught_by_user(merchant):
                    learn_merchant_category(merchant, category, source="ai")

    conn = get_connection()
    with conn:
        for item, merchants, category, ids in plan:
            display = _clean_display(item.get("display_name"), "")
            if display:
                conn.executemany(
                    """
                    INSERT INTO payee_names (merchant, display_name) VALUES (?, ?)
                    ON CONFLICT(merchant) DO UPDATE SET display_name = excluded.display_name
                    """,
                    [(m, display) for m in merchants],
                )
                named += 1
            if item.get("name"):
                conn.execute("UPDATE ai_category_suggestions SET status = 'applied' WHERE name = ?", (item["name"],))
    conn.close()
    return {"updated": updated, "named": named}


def dismiss(names: List[str]) -> Dict:
    """Keep these payees as they are: their suggestions are hidden and not asked about again"""
    conn = get_connection()
    with conn:
        conn.executemany("UPDATE ai_category_suggestions SET status = 'dismissed' WHERE name = ?", [(n,) for n in names])
    conn.close()
    return {"dismissed": len(names)}
