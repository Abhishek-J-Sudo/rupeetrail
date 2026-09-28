"""
Clean payee names from rules, for the cases every statement has and no AI is needed

- NEFT / RTGS credits all parse to the merchant "Neft Cr"; the sender is in the narration:
  'NEFT CR-CITI0000002-ACME TECH INDIA PRIVATE LIMITED-A KUMAR-REF SALARY FOR AUG' -> 'Acme Tech India'
- Loan EMIs carry the instalment's cheque number, so each month is a new merchant:
  'Emi 552900417 Chq S5529004170341 0926552900417' -> 'Loan EMI 552900417'

These names win over names saved from the AI review: they're read from the statement itself,
and they stay the same for every future instalment or salary credit.
"""

import re
from typing import Optional

_BANK_CREDIT = re.compile(r"^(?:NEFT|RTGS)\s*CR-[A-Z]{4}0[A-Z0-9]{6}-([^-]+)-", re.IGNORECASE)
_EMI = re.compile(r"^Emi (\d{6,}) Chq\b", re.IGNORECASE)
_LEGAL_SUFFIX = re.compile(r"\b(?:PRIVATE|PVT\.?)\s+(?:LIMITED|LTD\.?)$|\b(?:LIMITED|LTD\.?|LLP)$", re.IGNORECASE)


def _tidy_company(raw: str) -> Optional[str]:
    # Banks print O as 0 inside names ("GR0WW")
    name = re.sub(r"(?<=[A-Za-z])0(?=[A-Za-z])", "O", " ".join(raw.split()))
    name = _LEGAL_SUFFIX.sub("", name).strip(" .,&")
    if not name:
        return None
    # Words of up to 3 letters are usually initials ("ABC"); the rest read better capitalised
    return " ".join(w if len(w) <= 3 else w.capitalize() for w in name.split())


def rule_payee_name(merchant: str, narration: str) -> Optional[str]:
    """A clean name for this payee from the rules above, or None"""
    if merchant.lower() in ("neft cr", "rtgs cr"):
        match = _BANK_CREDIT.match(narration.strip())
        return _tidy_company(match.group(1)) if match else None
    match = _EMI.match(merchant)
    if match:
        return f"Loan EMI {match.group(1)}"
    return None
