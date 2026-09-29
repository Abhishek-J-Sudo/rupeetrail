"""
Merchant Name Extraction Module

Extracts clean merchant names from various transaction types:
- UPI merchants
- UPI P2P transfers
- NEFT/IMPS transfers
- ATM withdrawals
- Other transaction types
"""

import re
import logging
import string

logger = logging.getLogger(__name__)

# Maximum length for merchant names (prevents footer text or very long strings)
MAX_MERCHANT_LENGTH = 100

# The narration the GPay reader writes: "Paid to <payee> · UPI ref <id>" (or "Received from").
# Not GPay's own "UPI Transaction ID": the rule keyword 'ac' would match inside "transaction".
GPAY_NARRATION = re.compile(r'^(?:Paid to|Received from) (.+) · UPI ref \d+$')


def gpay_narration(direction: str, payee: str, upi_id: str) -> str:
    """The narration stored for a GPay row; direction is 'Paid to' or 'Received from'"""
    return f"{direction} {' '.join(payee.split())} · UPI ref {upi_id}"


def _truncate_merchant(merchant: str) -> str:
    """
    Truncate merchant name to maximum length

    Args:
        merchant: Merchant name to truncate

    Returns:
        Truncated merchant name (with '...' if truncated)
    """
    if len(merchant) > MAX_MERCHANT_LENGTH:
        return merchant[:MAX_MERCHANT_LENGTH].strip() + '...'
    return merchant


def extract_merchant_name(narration: str) -> str:
    """
    Extract merchant name from transaction narration

    Handles multiple transaction types:
    - UPI merchants (UPI-MERCHANT-DETAILS@BANK)
    - UPI P2P transfers (UPI-PERSON NAME@BANK)
    - NEFT/IMPS transfers
    - ATM withdrawals
    - Cheque payments
    - Direct debits (ACH/NACH)

    Args:
        narration: Full transaction narration (possibly multi-line, concatenated)

    Returns:
        Cleaned merchant/recipient name

    Examples:
        >>> extract_merchant_name("UPI-MC DONALDS-MCDONALDS.41173767@HDFCBANK-...")
        'Mc Donalds'

        >>> extract_merchant_name("UPI-GOOGLE INDIA DIGITAL-GPAY-TOLL@OKPAY...")
        'Google India Digital'

        >>> extract_merchant_name("UPI-PRIYA NAIR-PRIYA.NAIR@OKHDFCBANK-...")
        'Priya Nair'

        >>> extract_merchant_name("NEFT-JOHN DOE-SALARY-...")
        'John Doe'

        >>> extract_merchant_name("ATM WDL-HDFC ATM LOCATION-...")
        'ATM Withdrawal'
    """
    # Remove extra whitespace and normalize
    narration = ' '.join(narration.split())

    # HDFC POS transactions (new pattern)
    if narration.startswith('POS') or narration.startswith('MEDCSI'):
        return _truncate_merchant(_extract_pos_merchant(narration))

    # HDFC Credit Card Auto-pay (new pattern)
    if narration.startswith('CC') and 'AUTOPAY' in narration.upper():
        return 'Credit Card Payment'

    # HDFC ACH Debit - Loan/Bill payments (new pattern)
    if narration.startswith('ACHD-'):
        return _truncate_merchant(_extract_achd_merchant(narration))

    # HDFC Network Withdrawal (new pattern)
    if narration.startswith('NWD-'):
        return 'ATM Withdrawal'

    # UPI transactions
    if narration.startswith('UPI-'):
        return _truncate_merchant(_extract_upi_merchant(narration))

    # UPI transactions from a GPay statement
    gpay = GPAY_NARRATION.match(narration)
    if gpay:
        return _truncate_merchant(_extract_gpay_merchant(gpay.group(1)))

    # NEFT/IMPS transfers
    if narration.startswith('NEFT-') or narration.startswith('IMPS-'):
        return _truncate_merchant(_extract_neft_imps_merchant(narration))

    # ATM withdrawals (generic)
    if 'ATM' in narration.upper():
        return 'ATM Withdrawal'

    # ACH/NACH direct debits
    if narration.startswith('ACH D-') or narration.startswith('NACH-'):
        return _truncate_merchant(_extract_ach_merchant(narration))

    # Cheque payments
    if narration.startswith('CHQ-') or 'CHEQUE' in narration.upper():
        return _truncate_merchant(_extract_cheque_merchant(narration))

    # Default: Take first meaningful part
    return _truncate_merchant(_extract_default_merchant(narration))


def _extract_upi_merchant(narration: str) -> str:
    """
    Extract merchant name from UPI transaction

    Patterns:
    - UPI-MERCHANT NAME-DETAILS@BANK
    - UPI-MERCHANT-MERCHANT.ID@BANK-IFSC-REF-UPI
    - UPI-PERSON NAME-PERSON NAME@BANK (P2P)

    Args:
        narration: UPI transaction string

    Returns:
        Cleaned merchant name
    """
    # Remove "UPI-" prefix
    narration = narration.replace('UPI-', '', 1).strip()

    # Split by '@' to separate merchant part from bank details
    before_at = narration.split('@')[0]

    # Split by '-' to get segments
    segments = before_at.split('-')

    if not segments:
        return 'Unknown UPI'

    # Take first two segments for better context
    merchant_parts = []
    for i, segment in enumerate(segments[:2]):  # Take max 2 segments
        if not segment.strip():
            continue

        # Clean the segment
        cleaned = segment.strip()

        # Remove reference numbers (digits and dots)
        # Example: "MCDONALDS.41173767" → "MCDONALDS"
        cleaned = re.sub(r'\.\d+$', '', cleaned)

        # Remove trailing numbers
        cleaned = re.sub(r'\d+$', '', cleaned).strip()

        # Skip if empty after cleaning or if it's just a UPI reference
        if cleaned and cleaned.upper() != 'UPI':
            merchant_parts.append(cleaned)

        # Stop if we have enough meaningful parts
        if len(merchant_parts) >= 2:
            break

    # Join parts with space
    merchant = ' '.join(merchant_parts) if merchant_parts else 'Unknown UPI'

    # Title case for readability
    merchant = merchant.title()

    # Handle common abbreviations
    merchant = _normalize_merchant_name(merchant)

    return merchant if merchant else 'Unknown UPI'


def _extract_gpay_merchant(payee: str) -> str:
    """
    Clean a payee name as GPay prints it

    GPay shows the registered name, so this only tidies it:
    "Ashapura_Fast_Food_" -> "Ashapura Fast Food", "M/S.AVADHOOT HOSPITAL" -> "Avadhoot Hospital",
    "AURUM FM 2" -> "Aurum Fm" (a terminal number, as the UPI reader drops them)
    """
    name = payee.replace('_', ' ')
    name = re.sub(r'^M/S\.?\s*', '', name, flags=re.IGNORECASE)
    name = re.sub(r'\s+\d+$', '', name.strip())
    # capwords, not title(): title() turns "McDonald's" into "Mcdonald'S"
    name = string.capwords(' '.join(name.split()))
    return _normalize_merchant_name(name) if name else 'Unknown UPI'


def _extract_neft_imps_merchant(narration: str) -> str:
    """
    Extract recipient name from NEFT/IMPS transfer

    Pattern: NEFT-RECIPIENT NAME-DETAILS-...

    Args:
        narration: NEFT/IMPS transaction string

    Returns:
        Recipient name
    """
    # Remove prefix
    narration = re.sub(r'^(NEFT|IMPS)-', '', narration).strip()

    # Take first segment
    parts = narration.split('-')
    if parts:
        recipient = parts[0].strip().title()
        return recipient if recipient else 'Transfer'

    return 'Transfer'


def _extract_pos_merchant(narration: str) -> str:
    """
    Extract merchant name from HDFC POS/MEDCSI transactions

    Patterns:
    - POS541919XXXXXX4821YOUTUBEGOOGLE 0000000000100001 08/03/25
    - MEDCSI541919XXXXXX4821YOUTUBEGOOGLE 0000000000100002 08/02/25
    - POS541919XXXXXX4821CLAUDE.AISUBSCR 0000000000100003 14/01/25

    Args:
        narration: POS transaction string

    Returns:
        Cleaned merchant name
    """
    # Remove POS/MEDCSI prefix
    narration = re.sub(r'^(POS|MEDCSI)', '', narration).strip()

    # Remove card number pattern (XXXXXX followed by digits)
    narration = re.sub(r'\d+XXXXXX\d+', '', narration).strip()

    # Remove reference numbers (long digit sequences)
    narration = re.sub(r'\s+\d{10,}\s+', ' ', narration).strip()

    # Remove dates at the end (DD/MM/YY)
    narration = re.sub(r'\s+\d{2}/\d{2}/\d{2}$', '', narration).strip()

    # Clean up merchant name
    merchant = narration.strip().title()

    # Handle specific merchants
    if 'youtube' in merchant.lower():
        return 'YouTube'
    if 'claude' in merchant.lower():
        return 'Claude AI'
    if 'google' in merchant.lower():
        return 'Google'
    if 'netflix' in merchant.lower():
        return 'Netflix'
    if 'amazon' in merchant.lower():
        return 'Amazon'

    return merchant if merchant else 'POS Transaction'


def _extract_achd_merchant(narration: str) -> str:
    """
    Extract merchant name from HDFC ACH Debit transactions

    Pattern: ACHD-BOBLOANCOLLECTION-9000000000000 0000001234567890 16/03/25

    Args:
        narration: ACHD transaction string

    Returns:
        Merchant name
    """
    # Remove ACHD- prefix
    narration = narration.replace('ACHD-', '', 1).strip()

    # Take first segment before space or hyphen
    parts = re.split(r'[-\s]', narration)
    if parts:
        merchant = parts[0].strip().title()

        # Handle specific cases
        if 'bob' in merchant.lower() and 'loan' in merchant.lower():
            return 'Bank of Baroda Loan'
        if 'loan' in merchant.lower():
            return f"{merchant} (Loan)"

        return merchant if merchant else 'ACH Debit'

    return 'ACH Debit'


def _extract_ach_merchant(narration: str) -> str:
    """
    Extract merchant name from ACH/NACH direct debit

    Pattern: ACH D-MERCHANT NAME-...

    Args:
        narration: ACH transaction string

    Returns:
        Merchant name
    """
    # Remove prefix
    narration = re.sub(r'^(ACH D|NACH)-', '', narration).strip()

    # Take first segment
    parts = narration.split('-')
    if parts:
        merchant = parts[0].strip().title()
        return merchant if merchant else 'Auto Debit'

    return 'Auto Debit'


def _extract_cheque_merchant(narration: str) -> str:
    """
    Extract payee from cheque transaction

    Args:
        narration: Cheque transaction string

    Returns:
        Payee name or "Cheque Payment"
    """
    # Try to extract meaningful info
    # Pattern varies, often includes cheque number
    parts = narration.split('-')
    for part in parts:
        part = part.strip()
        # Skip cheque numbers and generic terms
        if part and not part.isdigit() and 'CHQ' not in part.upper() and 'CHEQUE' not in part.upper():
            return part.title()

    return 'Cheque Payment'


def _extract_default_merchant(narration: str) -> str:
    """
    Default extraction for unknown transaction types

    Args:
        narration: Transaction string

    Returns:
        Best-guess merchant name
    """
    # Take first segment before hyphen or slash
    parts = re.split(r'[-/]', narration)
    if parts:
        merchant = parts[0].strip().title()
        return merchant if merchant else 'Other'

    return 'Other'


def _normalize_merchant_name(name: str) -> str:
    """
    Normalize common merchant name abbreviations and formatting

    Args:
        name: Merchant name

    Returns:
        Normalized name
    """
    # Common replacements
    replacements = {
        'Mcdonald': 'McDonald',
        'Mc Donald': 'McDonald',
        'Kfc': 'KFC',
        'Atm': 'ATM',
        'Sbi': 'SBI',
        'Hdfc': 'HDFC',
        'Icici': 'ICICI',
        'Axis': 'Axis',
    }

    for old, new in replacements.items():
        if name.lower() == old.lower():
            return new

    return name


def detect_transaction_type(narration: str) -> str:
    """
    Detect the type of transaction from narration

    Args:
        narration: Transaction narration

    Returns:
        Transaction type: 'upi', 'neft', 'imps', 'atm', 'cheque', 'ach', 'other'
    """
    narration_upper = narration.upper()

    if narration.startswith('UPI-') or GPAY_NARRATION.match(narration):
        return 'upi'
    elif narration.startswith('NEFT-'):
        return 'neft'
    elif narration.startswith('IMPS-'):
        return 'imps'
    elif 'ATM' in narration_upper:
        return 'atm'
    elif narration.startswith('CHQ-') or 'CHEQUE' in narration_upper:
        return 'cheque'
    elif narration.startswith('ACH D-') or narration.startswith('NACH-'):
        return 'ach'
    else:
        return 'other'


def is_p2p_transfer(narration: str, merchant: str) -> bool:
    """
    Detect if UPI transaction is person-to-person transfer

    Heuristics:
    - Merchant name looks like a person name (2-3 words, capitalized)
    - No common merchant keywords
    - Not matching any business keywords from category rules

    Args:
        narration: UPI transaction narration
        merchant: Extracted merchant name

    Returns:
        True if likely P2P transfer
    """
    if detect_transaction_type(narration) != 'upi':
        return False

    # Check if merchant name looks like a person (2-3 words)
    words = merchant.split()
    if len(words) not in [2, 3]:
        return False

    merchant_lower = merchant.lower()

    # Check for corporate/merchant keywords (if present, not P2P)
    merchant_keywords = [
        'pvt', 'ltd', 'private', 'limited', 'india', 'services',
        'technologies', 'solutions', 'store', 'mart', 'shop',
        'restaurant', 'cafe', 'hotel', 'hospital', 'clinic'
    ]

    for keyword in merchant_keywords:
        if keyword in merchant_lower:
            return False

    # Check against category rules to avoid false positives
    # Import here to avoid circular dependency
    try:
        from ..categorizer.rules import CATEGORY_RULES

        # Check if merchant matches any business keywords from all categories
        for category, rules in CATEGORY_RULES.items():
            # Skip checking against P2P and income categories
            if category in ['Personal Transfer', 'Income', 'ATM Withdrawal']:
                continue

            # Check keywords
            if 'keywords' in rules:
                for keyword in rules['keywords']:
                    if keyword in merchant_lower:
                        return False

            # Check known merchants
            if 'merchants' in rules:
                for known_merchant in rules['merchants']:
                    if known_merchant.lower() == merchant_lower:
                        return False
    except ImportError:
        pass

    # Likely a person name
    return True


if __name__ == "__main__":
    # Test cases
    test_cases = [
        "UPI-MC DONALDS-MCDONALDS.41173767@HDFCBANK-HDFC0000001-500100000001-UPI",
        "UPI-GOOGLE INDIA DIGITAL-GPAY-TOLL@OKPAY AXIS-UTIB0000553-500100000002-UPI",
        "UPI-PRIYA NAIR-PRIYA.NAIR@OKHDFCBANK-HDFC0001234-500100000003-UPI",
        "UPI-KULKARNI RAMESH VIJAY-Q100000004@YBL-YESB0YBLUPI-500100000004-UPI",
        "UPI-SAGAR FISH CURRY-VYAPAR.100000000005",
        "NEFT-JOHN DOE-SALARY PAYMENT-REF12345",
        "ATM WDL-HDFC ATM BANGALORE-12345",
        "ACH D-NETFLIX-SUBSCRIPTION-MONTHLY",
    ]

    print("Testing Merchant Extraction:")
    print("=" * 80)
    for narration in test_cases:
        merchant = extract_merchant_name(narration)
        txn_type = detect_transaction_type(narration)
        is_p2p = is_p2p_transfer(narration, merchant)

        print(f"\nNarration: {narration[:60]}...")
        print(f"Merchant:  {merchant}")
        print(f"Type:      {txn_type}")
        print(f"P2P:       {is_p2p}")
