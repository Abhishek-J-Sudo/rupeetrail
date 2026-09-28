"""
Recurring payment detection

Finds monthly payments (EMIs, SIPs, subscriptions, card bills) from transaction history.
A payee counts as recurring when it's paid in 3+ consecutive months, at most twice a month,
on roughly the same day each month, and (unless it's a naturally variable bill like a
credit card) for a steady amount. Frequent shops, like a daily grocery store, don't qualify.
"""

import re
import statistics
from collections import defaultdict
from datetime import date
from typing import Dict, List

from .database import get_connection
from .payee_rules import rule_payee_name

# Categories whose bills vary in amount but still arrive on a fixed date
FIXED_CATEGORIES = {"Loans & EMI", "Credit Cards", "Investments", "Software & AI", "Bills"}

MIN_CONSECUTIVE_MONTHS = 3
MAX_PAYMENTS_PER_MONTH = 2
MIN_MONTHLY_AMOUNT = 100


def display_name(merchant: str) -> str:
    """'Me Dc Si 541919Xxxxxx4821 Anthropic* Claude Sub' -> 'Anthropic* Claude Sub'"""
    tokens = merchant.split()
    if [t.lower() for t in tokens[:3]] == ["me", "dc", "si"]:
        tokens = tokens[3:]
    tokens = [t for t in tokens if not re.search(r"[\d@_]", t) and t.lower() not in ("autopay", "q", "gpay")]
    # Later dotted or run-together words are UPI handles ("Getepay.Gpbqrapp", "Rameshsinghbk");
    # a dotted first word is the brand ("Claude.Ai")
    tokens = [t for i, t in enumerate(tokens) if i == 0 or not ("." in t or (i >= 3 and len(t) >= 10))]
    return " ".join(tokens[:4]) or merchant


def _group_key(merchant: str) -> str:
    return " ".join(display_name(merchant).lower().split()[:3])


def _month_index(ym: str) -> int:
    return int(ym[:4]) * 12 + int(ym[5:7]) - 1


def _longest_consecutive_run(months: List[str]) -> int:
    idx = sorted(_month_index(m) for m in months)
    best = run = 1
    for a, b in zip(idx, idx[1:]):
        run = run + 1 if b == a + 1 else 1
        best = max(best, run)
    return best


def _day_spread(days: List[int]) -> float:
    """Median distance (in days, wrapping around month end) from the usual payment day"""
    usual = statistics.median(days)
    return statistics.median(min(abs(d - usual), 31 - abs(d - usual)) for d in days)


def _is_recurring(category: str, amount_cv: float, day_spread: float) -> bool:
    if category in FIXED_CATEGORIES and day_spread <= 5:
        return True
    if amount_cv <= 0.1 and day_spread <= 8:  # same price, billing date drifts a little
        return True
    return amount_cv <= 0.25 and day_spread <= 4


def _next_expected(last_date: str, usual_day: int) -> str:
    y, m = int(last_date[:4]), int(last_date[5:7])
    y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    day = min(usual_day, 28)
    return date(y, m, day).isoformat()


def find_recurring() -> Dict:
    conn = get_connection()
    rows = [dict(r) for r in conn.execute(
        """
        SELECT id, date, merchant, narration, amount, category
        FROM transactions
        WHERE txn_type = 'debit' AND is_excluded = 0
        """
    ).fetchall()]
    # Clean payee names (rules, then the AI payee review), used for the shown name only
    clean_names = {r["merchant"]: r["display_name"] for r in conn.execute("SELECT merchant, display_name FROM payee_names")}
    conn.close()
    if not rows:
        return {"items": [], "active_monthly_total": 0, "data_until": None}

    latest_month = max(r["date"][:7] for r in rows)
    groups = defaultdict(list)
    for r in rows:
        groups[_group_key(r["merchant"])].append(r)

    items = []
    for txns in groups.values():
        txns.sort(key=lambda t: t["date"])
        by_month = defaultdict(list)
        for t in txns:
            by_month[t["date"][:7]].append(t)
        months = sorted(by_month)

        if len(months) < MIN_CONSECUTIVE_MONTHS or _longest_consecutive_run(months) < MIN_CONSECUTIVE_MONTHS:
            continue
        if statistics.median(len(v) for v in by_month.values()) > MAX_PAYMENTS_PER_MONTH:
            continue
        monthly_amount = statistics.median(sum(abs(t["amount"]) for t in v) for v in by_month.values())
        if monthly_amount < MIN_MONTHLY_AMOUNT:
            continue

        amounts = [abs(t["amount"]) for t in txns]
        amount_cv = statistics.pstdev(amounts) / statistics.mean(amounts)
        days = [int(t["date"][8:10]) for t in txns]
        category = statistics.mode(t["category"] for t in txns)
        if not _is_recurring(category, amount_cv, _day_spread(days)):
            continue

        usual_day = round(statistics.median(days))
        last = txns[-1]
        active = _month_index(latest_month) - _month_index(last["date"][:7]) <= 1
        # A rule name, else the latest payment's clean name, else any payment's, else tidied up
        clean = rule_payee_name(last["merchant"], last["narration"]) or next(
            (clean_names[t["merchant"]] for t in reversed(txns) if t["merchant"] in clean_names), None
        )
        items.append({
            "id": txns[0]["id"],  # stable key: two payees can share a clean name
            "name": clean or display_name(last["merchant"]),
            "category": category,
            "monthly_amount": round(monthly_amount),
            "usual_day": usual_day,
            "months_paid": len(months),
            "first_paid": txns[0]["date"],
            "last_paid": last["date"],
            "last_amount": round(abs(last["amount"])),
            "total_paid": round(sum(amounts)),
            "active": active,
            "next_expected": _next_expected(last["date"], usual_day) if active else None,
            "transaction_ids": [t["id"] for t in txns],
        })

    items.sort(key=lambda i: (not i["active"], -i["monthly_amount"]))
    return {
        "items": items,
        "active_monthly_total": round(sum(i["monthly_amount"] for i in items if i["active"])),
        # Last date covered by uploaded statements; "next expected" dates before it weren't seen
        "data_until": max(r["date"] for r in rows),
    }
