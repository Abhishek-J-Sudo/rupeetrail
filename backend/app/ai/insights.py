"""
Monthly / yearly spending insights

Builds an aggregate-only snapshot of a period (category totals, budgets, business names),
asks the AI for a summary + savings advice, and caches the answer per period.
"""

import json
import hashlib
import statistics
from collections import defaultdict
from typing import Dict, List, Optional

from ..database import get_budgets, get_connection, INVESTMENT_CATEGORY
from .client import chat_json, get_config
from .privacy import shareable_merchant

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

SYSTEM_PROMPT = """You are a sharp, practical personal-finance coach for someone in India.
You receive a JSON snapshot of their bank-account activity for one period (a month, a few months, a year or all their history):
aggregate totals per category, their monthly budget limits, the previous comparable period,
their top merchants (business names only), and their largest payments.

Notes on the data:
- Amounts are INR. Write money as ₹ with Indian digit grouping (₹1,25,000), rounded to whole rupees.
- "Credit Cards" = credit-card bill payments; what was bought on the card is not itemised.
- "Loans & EMI" are fixed loan repayments.
- "invested" (mutual funds, SIPs, insurance policies) and "other_savings" are money saved, NOT spending.
- "money_in" is all credits (salary, refunds, transfers in), so treat it as approximate income.
  It can be small when salary lands in another account; savings_rate_percent is then null, and
  spending was paid from an earlier balance. Don't call that a crisis or invent a savings rate.
- A category budget of null means no limit is set. Category budgets and budget.for_period are
  already multiplied by months_covered; budget.monthly_total and the savings target are per month.
- monthly_trend (when present) shows each month of the period.
- Merchants marked "recurring": true were paid in 3+ months (likely subscriptions or habits).

Rules:
- Use only the numbers provided. Never invent transactions, merchants or amounts.
- Be specific: name categories, merchants and amounts. No generic tips like "track your spending".
- Advice must be actionable and realistic for this person's actual pattern.
- Keep it short and plain.

Reply with a JSON object exactly like:
{
  "headline": "one line, max 12 words",
  "summary": "2-4 sentences on how the period went, including savings rate",
  "wins": ["up to 3 short positives"],
  "concerns": ["up to 4 short problems, most important first"],
  "advice": [
    {"title": "short action", "detail": "1-2 sentences with specifics", "estimated_monthly_saving": 1500,
     "category": "Food & Dining", "suggested_monthly_budget": 5000}
  ]
}
Give 3-5 advice items. estimated_monthly_saving is a number in rupees per month, or null if not applicable.
When an advice item is about one spending category, set "category" to that category's exact name from
"categories" and "suggested_monthly_budget" to a realistic round monthly limit for it; otherwise set
both to null."""


# The same shape as JSON Schema, for providers that enforce it (Anthropic)
_strings = {"type": "array", "items": {"type": "string"}}
REPLY_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "wins": _strings,
        "concerns": _strings,
        "advice": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "estimated_monthly_saving": {"anyOf": [{"type": "number"}, {"type": "null"}]},
                    "category": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "suggested_monthly_budget": {"anyOf": [{"type": "number"}, {"type": "null"}]},
                },
                "required": ["title", "detail", "estimated_monthly_saving", "category", "suggested_monthly_budget"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["headline", "summary", "wins", "concerns", "advice"],
    "additionalProperties": False,
}

# ---------- period helpers ----------
# A period is "YYYY-MM" (a month), "YYYY" (a calendar year), "YYYY-MM:YYYY-MM" (a range such
# as the report's 3 months) or "all". Months are "YYYY-MM" keys, which sort as strings.

PERIOD_PATTERN = r"^(\d{4}(-\d{2})?|\d{4}-\d{2}:\d{4}-\d{2}|all)$"


def _shift(key: str, delta: int) -> str:
    y, m = int(key[:4]), int(key[5:]) - 1 + delta
    return f"{y + m // 12}-{m % 12 + 1:02d}"


def _span(start: str, end: str) -> List[str]:
    keys, key = [], start
    while key <= end:
        keys.append(key)
        key = _shift(key, 1)
    return keys


def _resolve(period: str, available: List[str]):
    """(months with data, previous comparable months with data, kind) for a period"""
    have = set(available)
    if period == "all":
        return list(available), [], "all"
    if ":" in period:
        start, end = sorted(period.split(":"))
        length = len(_span(start, end))
        months = [m for m in _span(start, end) if m in have]
        prev = [m for m in _span(_shift(start, -length), _shift(end, -length)) if m in have]
        return months, prev, "months"
    if len(period) == 7:
        prev = _shift(period, -1)
        return ([period] if period in have else []), ([prev] if prev in have else []), "month"
    months = [m for m in available if m.startswith(period)]
    # Same calendar months of the previous year, so partial years compare fairly
    prev = [f"{int(period) - 1}{m[4:]}" for m in months if f"{int(period) - 1}{m[4:]}" in have]
    return months, prev, "year"


def _label(months: List[str]) -> str:
    """"Sep 2026", "Jul–Sep 2026" or "Nov 2025–Jan 2026" """
    if not months:
        return ""
    name = lambda key: f"{MONTH_NAMES[int(key[5:]) - 1]}"
    first, last = months[0], months[-1]
    if first == last:
        return f"{name(first)} {first[:4]}"
    if first[:4] == last[:4]:
        return f"{name(first)}–{name(last)} {last[:4]}"
    return f"{name(first)} {first[:4]}–{name(last)} {last[:4]}"


# ---------- aggregation ----------

def _load_rows(months: List[str]) -> List[Dict]:
    if not months:
        return []
    conn = get_connection()
    placeholders = ",".join("?" * len(months))
    rows = conn.execute(
        f"""
        SELECT date, merchant, narration, amount, txn_type, category, is_savings_transfer
        FROM transactions
        WHERE is_excluded = 0 AND substr(date, 1, 7) IN ({placeholders})
        """,
        months,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _totals(rows: List[Dict]) -> Dict:
    money_in = spent = invested = other_savings = 0.0
    by_category = defaultdict(float)
    for r in rows:
        amount = abs(r["amount"])
        if r["txn_type"] == "credit":
            money_in += amount
        elif r["is_savings_transfer"] == 1:
            if r["category"] == INVESTMENT_CATEGORY:
                invested += amount
            else:
                other_savings += amount
        else:
            spent += amount
            by_category[r["category"] or "Other"] += amount
    return {
        "money_in": money_in,
        "spent": spent,
        "invested": invested,
        "other_savings": other_savings,
        "by_category": by_category,
    }


def _merchant_stats(rows: List[Dict], recurring_rows: List[Dict]):
    """Top merchants by spend (business names only) and largest single payments"""
    spend = defaultdict(lambda: {"spent": 0.0, "count": 0, "category": None})
    for r in rows:
        if r["txn_type"] != "debit" or r["is_savings_transfer"] == 1:
            continue
        name = shareable_merchant(r["merchant"], r["narration"], r["category"])
        if not name:
            continue
        entry = spend[name]
        entry["spent"] += abs(r["amount"])
        entry["count"] += 1
        entry["category"] = r["category"]

    months_seen = defaultdict(set)
    for r in recurring_rows:
        if r["txn_type"] != "debit":
            continue
        name = shareable_merchant(r["merchant"], r["narration"], r["category"])
        if name:
            months_seen[name].add(r["date"][:7])

    top = sorted(spend.items(), key=lambda kv: kv[1]["spent"], reverse=True)[:15]
    top_merchants = [
        {
            "name": name,
            "category": s["category"],
            "spent": round(s["spent"]),
            "count": s["count"],
            "recurring": len(months_seen[name]) >= 3,
        }
        for name, s in top
    ]

    debits = [r for r in rows if r["txn_type"] == "debit" and r["is_savings_transfer"] != 1]
    largest = sorted(debits, key=lambda r: abs(r["amount"]), reverse=True)[:5]
    largest_payments = [
        {
            "payee": shareable_merchant(r["merchant"], r["narration"], r["category"]) or "(a person)",
            "category": r["category"],
            "amount": round(abs(r["amount"])),
        }
        for r in largest
    ]
    return top_merchants, largest_payments


def build_payload(period: str) -> Optional[Dict]:
    """Aggregate-only snapshot of a period. This dict is exactly what gets sent to the AI."""
    conn = get_connection()
    available = [r[0] for r in conn.execute(
        "SELECT DISTINCT substr(date, 1, 7) FROM transactions WHERE is_excluded = 0 ORDER BY 1"
    ).fetchall()]
    conn.close()

    months, prev_months, kind = _resolve(period, available)
    if not months:
        return None
    n = len(months)
    rows = _load_rows(months)
    prev_rows = _load_rows(prev_months)
    # Recurring = paid in 3+ of the last 6 months up to this period
    last = available.index(months[-1])
    recurring_rows = _load_rows(available[max(0, last - 5): last + 1]) if n < 6 else rows

    cur, prev = _totals(rows), _totals(prev_rows)
    budgets = get_budgets()
    limits = budgets["limits"]
    monthly_total = sum(limits.values()) or None
    categories = [
        {
            "name": name,
            "spent": round(amount),
            "budget": round(limits[name] * n) if name in limits else None,
            "previous": round(prev["by_category"].get(name, 0)) if prev_rows else None,
        }
        for name, amount in sorted(cur["by_category"].items(), key=lambda kv: kv[1], reverse=True)
    ]
    saved = cur["invested"] + cur["other_savings"]
    top_merchants, largest_payments = _merchant_stats(rows, recurring_rows)

    payload = {
        "period": _label(months),
        "period_type": kind,
        "months_covered": n,
        "money_in": round(cur["money_in"]),
        "spent": round(cur["spent"]),
        "invested": round(cur["invested"]),
        "other_savings": round(cur["other_savings"]),
        # Like the Overview tile: no rate when there's no income or savings exceed it
        "savings_rate_percent": round(saved / cur["money_in"] * 100, 1) if 0 < saved <= cur["money_in"] else None,
        "budget": {
            "monthly_total": round(monthly_total) if monthly_total else None,
            "for_period": round(monthly_total * n) if monthly_total else None,
            "monthly_savings_target": budgets["savings_target"],
        },
        "previous_period": {
            "period": _label(prev_months),
            "money_in": round(prev["money_in"]),
            "spent": round(prev["spent"]),
            "invested": round(prev["invested"]),
        } if prev_rows else None,
        "categories": categories,
        "top_merchants": top_merchants,
        "largest_payments": largest_payments,
    }

    if n > 1:
        by_month = defaultdict(list)
        for r in rows:
            by_month[r["date"][:7]].append(r)
        payload["monthly_trend"] = [
            {
                "month": _label([m]),
                "spent": round(_totals(by_month[m])["spent"]),
                "money_in": round(_totals(by_month[m])["money_in"]),
                "invested": round(_totals(by_month[m])["invested"]),
            }
            for m in months
        ]
        spends = [t["spent"] for t in payload["monthly_trend"]]
        payload["median_monthly_spend"] = round(statistics.median(spends)) if spends else None
    return payload


def _hash(payload: Dict) -> str:
    """Fingerprint of the transaction data only: changing a budget doesn't make an insight stale"""
    data = {k: v for k, v in payload.items() if k != "budget"}
    data["categories"] = [{k: v for k, v in c.items() if k != "budget"} for c in payload["categories"]]
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


# ---------- cache + generation ----------

def get_cached(period: str, payload: Dict, version_id: Optional[int] = None) -> Optional[Dict]:
    """Latest saved insight for the period (or a specific earlier version), plus the version list"""
    conn = get_connection()
    versions = [dict(r) for r in conn.execute(
        "SELECT id, created_at, model FROM ai_insight_history WHERE period = ? ORDER BY id DESC",
        (period,),
    ).fetchall()]
    if not versions:
        conn.close()
        return None
    ids = [v["id"] for v in versions]
    chosen = version_id if version_id in ids else ids[0]
    row = conn.execute("SELECT * FROM ai_insight_history WHERE id = ?", (chosen,)).fetchone()
    conn.close()
    return {
        "id": row["id"],
        "result": json.loads(row["result"]),
        "model": row["model"],
        "created_at": row["created_at"],
        # Data or budgets changed since this was generated
        "stale": row["data_hash"] != _hash(payload),
        "is_latest": chosen == ids[0],
        "versions": versions,
    }


def saved_periods() -> List[str]:
    """Periods that have a saved summary, most recently written first"""
    conn = get_connection()
    rows = conn.execute(
        "SELECT period FROM ai_insight_history GROUP BY period ORDER BY MAX(id) DESC"
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]


async def generate(period: str, payload: Dict) -> Dict:
    result = await chat_json(
        SYSTEM_PROMPT, json.dumps(payload, ensure_ascii=False), max_tokens=1800, schema=REPLY_SCHEMA
    )
    names = {c["name"] for c in payload["categories"]}
    number = lambda v: v if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0 else None

    def advice_item(a: Dict) -> Dict:
        category = a.get("category") if a.get("category") in names else None
        return {
            "title": str(a.get("title", "")).strip(),
            "detail": str(a.get("detail", "")).strip(),
            "estimated_monthly_saving": number(a.get("estimated_monthly_saving")),
            "category": category,
            "suggested_monthly_budget": round(number(a.get("suggested_monthly_budget")) or 0) or None if category else None,
        }

    result = {
        "headline": str(result.get("headline", "")).strip(),
        "summary": str(result.get("summary", "")).strip(),
        "wins": [str(w) for w in result.get("wins", []) if w][:3],
        "concerns": [str(c) for c in result.get("concerns", []) if c][:4],
        "advice": [advice_item(a) for a in result.get("advice", []) if isinstance(a, dict)][:5],
    }
    config = get_config()
    model = f"{config['label'].split(' (')[0]} · {config['model']}"  # "Ollama · qwen3.5:9b"

    # Each generation is a new version; earlier ones stay available
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO ai_insight_history (period, data_hash, payload, result, model)
        VALUES (?, ?, ?, ?, ?)
        """,
        (period, _hash(payload), json.dumps(payload), json.dumps(result), model),
    )
    conn.commit()
    conn.close()
    return get_cached(period, payload)
