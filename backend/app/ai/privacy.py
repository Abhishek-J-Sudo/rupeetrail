"""
What may leave the machine

Only business names (cleaned of UPI handles, reference numbers and similar tokens)
and aggregate amounts are sent to the AI. Payments to people are never named.
"""

import re
from typing import Optional

from ..categorizer.rules import CATEGORY_RULES

# Categories whose merchants are people or bank accounts, never named in AI payloads
UNNAMED_CATEGORIES = {"Personal Transfer", "ATM Withdrawal", "Income"}

# Tokens that carry no meaning for the AI but can identify accounts/handles
_NOISE_TOKENS = {"upi", "autopay", "paytmqr", "bharatpe", "vyapar", "bdpg", "brk", "subs"}

# Debit card standing instructions ("ME DC SI <card> MERCHANT") are always card payments to businesses
_CARD_SI_PREFIX = ("me", "dc", "si")

# Whole words that mark a payee as a business rather than a person
_BUSINESS_WORDS = {
    "pvt", "pv", "ltd", "lt", "private", "limited", "llp", "inc", "co", "corp", "corpo", "company",
    "india", "services", "service", "technologies", "tech", "solutions", "digital", "enterprises",
    "enterprise", "traders", "trading", "industries", "agency", "agencies", "bros", "sons",
    "store", "stores", "mart", "shop", "supermarket", "supermarts", "superma", "bazaar", "market",
    "restaurant", "restauran", "cafe", "hotel", "foods", "food", "kitchen", "bakery", "veg", "dhaba",
    "hospital", "clinic", "pharmacy", "medical", "medicals", "chemist", "diagnostics", "lab", "care",
    "health", "insurance", "bank", "cards", "card", "finance", "loan", "emi", "funds", "fund",
    "center", "centre", "motors", "automobiles", "petroleum", "fuels", "electricals", "electrical",
    "electronics", "garments", "fashion", "textiles", "salon", "studio", "academy", "school",
    "college", "institute", "travels", "tours", "cab", "cabs", "com", "online", "billpay",
    "payment", "subscription", "hospitality", "resorts", "resort", "petrolium",
    "systems", "software", "world", "garden", "mcdonalds", "donalds", "lenskart",
    "amazon", "amazonupi", "figma", "adobe", "anthropic", "netflix", "spotify", "swiggy", "zomato",
}

# UPI handle fragments of payment gateways (only registered businesses use these).
# Shop-QR apps like BharatPe / Vyapar / Paytm QR are left out: those QRs carry the owner's own name.
_GATEWAY_MARKERS = ("payu", ".rzp", "razorpay", "billdesk", "cashfree", "ccavenue",
                    "paytm.d", ".brk", "pinelabs", "juspay")

# Shop / small-merchant QR apps
_SHOP_QR_MARKERS = ("paytmqr", "bharatpe", "bajajpay", "vyapar", "@ptys")

_KNOWN_KEYWORD_PATTERNS = [
    re.compile(r"\b" + re.escape(k.lower()) + r"\b")
    for rules in CATEGORY_RULES.values()
    for k in rules.get("keywords", [])
    if len(k) >= 4
]


def clean_merchant_name(merchant: str) -> str:
    """
    'Groww Invest Tech Pv Groww.Brk' -> 'Groww Invest Tech Pv'
    'Arjun Mehta Paytmqr5abcde'      -> 'Arjun Mehta'
    'Happy Paws Store Petsramesh'    -> 'Happy Paws Store'
    Drops tokens with digits, dots, @ or underscores (UPI handles, refs, IDs), and long
    run-together tokens after the first word, which are UPI handles that often hold a person's name.
    """
    tokens = merchant.split()
    card_si = [t.lower() for t in tokens[:3]] == list(_CARD_SI_PREFIX)
    if card_si:
        # Card standing instructions are always businesses, named after the card number:
        # the first word there is the brand even when dotted or run together
        # ('Me Dc Si 541919Xxxxxx4821 Youtubegoogle', '... Claude.Ai Subscription')
        tokens = [t for t in tokens[3:] if not re.search(r"\d", t)]
        if tokens and re.fullmatch(r"[A-Za-z]+(?:\.[A-Za-z]+)+", tokens[0]):
            tokens = tokens[0].split(".") + tokens[1:]
    words = []
    for i, token in enumerate(tokens):
        if re.search(r"[\d.@_/]", token) or token.lower() in _NOISE_TOKENS:
            continue
        if i > 0 and len(token) >= 10 and token.lower() not in _BUSINESS_WORDS:
            continue
        words.append(token)
    return " ".join(words[:5]).strip()


def _looks_like_business(merchant: str, narration: str) -> bool:
    merchant_lower = merchant.lower()
    if merchant_lower.startswith("me dc si "):
        return True

    # Judge the cleaned name, so fragments of UPI handles (e.g. "...69Lt") don't count
    cleaned = clean_merchant_name(merchant).lower()
    if set(re.findall(r"[a-z]+", cleaned.replace("*", " "))) & _BUSINESS_WORDS:
        return True

    raw = f"{merchant_lower} {narration.lower()}"
    if any(marker in raw for marker in _GATEWAY_MARKERS):
        return True

    # Shop QR codes are registered in the owner's personal name, and the rules' keywords
    # include such vendor names, so for them only a business word in the name is enough
    if any(marker in raw for marker in _SHOP_QR_MARKERS):
        return False
    return any(pattern.search(cleaned) for pattern in _KNOWN_KEYWORD_PATTERNS)


def shareable_merchant(merchant: str, narration: str, category: str) -> Optional[str]:
    """
    Cleaned business name that's safe to send, or None if the payee might be a person.
    Allowlist approach: unless it clearly looks like a business, it isn't named.
    """
    if category in UNNAMED_CATEGORIES:
        return None
    if not _looks_like_business(merchant, narration):
        return None
    return clean_merchant_name(merchant) or None
