"""
Personal categorisation rules: local shops and people you pay.

Copy this file to rules_local.py (gitignored) and add your own entries.
They are merged into CATEGORY_RULES in rules.py when the app starts.
Categories must already exist in rules.py.

- keywords: matched anywhere in the merchant name or narration (lowercase)
- merchants: matched against the whole cleaned merchant name
"""

LOCAL_RULES = {
    'Groceries': {
        'keywords': ['sharma kirana'],
        'merchants': ['Sharma Kirana Store'],
    },
    'Food & Dining': {
        'keywords': ['corner chai'],
        'merchants': [],
    },
}
