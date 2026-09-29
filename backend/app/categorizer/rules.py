"""
Transaction Categorization Module

Rule-based categorization engine for transactions
"""

import re
import logging
from typing import Optional
from .learning import get_learned_category

logger = logging.getLogger(__name__)

# Category keyword rules
CATEGORY_RULES = {
    'Credit Cards': {
        'keywords': ['credit card', 'sbicardsandpaymen', 'sbicardsandpaym', 'creditcard', 'cc payment', 'sbi cards', 'sbicards'],
        'merchants': ['Credit Card Payment', 'Sbi Cards And Paymen', 'Sbicardsandpaymen Sbicardsandpaym']
    },

    'Loans & EMI': {
        'keywords': ['loan', 'emi', 'bob loan', 'achd', 'bobloan', 'home loan', 'personal loan', 'car loan', 'education loan', 'bank of baroda'],
        'merchants': ['Bank of Baroda Loan', 'Bank Of Baroda']
    },

    'Food & Dining': {
        'keywords': [
            'swiggy', 'zomato', 'ubereats', 'foodpanda', 'dunzo',
            'bundl technologies',  # Swiggy's company name, as GPay shows it
            'mcdonald', 'kfc', 'domino', 'pizza', 'subway', 'burger',
            'starbucks', 'cafe', 'coffee', 'restaurant', 'diner',
            'bistro', 'eatery', 'food', 'meal', 'lunch', 'dinner',
            'breakfast', 'bakery', 'dhaba', 'biryani', 'curry',
            'kitchen', 'grill', 'bbq', 'pub', 'tea', 'caterers',
            'fish', 'barbeque',
            'mess', 'saravana', 'sweet', 'momo', 'icecream',
            'snacks', 'fruit stall',
            'jumbo king', 'jumboking', 'hardcastle',
            'mcdelivery', 'fish curry', 'mcd',
            # NEW: Missing keywords from analysis
            'chopstix', 'chinese', 'caterin', 'catering',
            'tiffin', 'noodles', 'fried rice', 'chowmein', 'hakka',
            'paan', 'betel'
        ],
        'merchants': [
            'Mc Donalds', 'McDonald', 'KFC', 'Dominos', 'Pizza Hut',
            'Subway', 'Starbucks', 'Cafe Coffee Day', 'Barbeque Nation',
            'Jumboking'
        ]
    },

    'Transportation': {
        'keywords': [
            'uber', 'ola', 'rapido', 'meru cab', 'blusmart',
            'ani technologies',  # Ola's company name, as GPay shows it
            'toll', 'fastag', 'highway', 'parking',
            'metro', 'railway', 'irctc', 'redbus', 'bus',
            'flight', 'airline', 'airport',
            'ircts', 'olacabs',
            'anitechnologies', 'indian railways', 'train'
        ],
        'merchants': [
            'Uber', 'Ola', 'Rapido', 'Google India Digital',
            'Ani Technologies Pri'
        ]
    },

    'Fuel': {
        'keywords': [
            'petrol', 'fuel', 'diesel', 'gas', 'gasoline',
            'bharat petroleum', 'indianoil', 'hpfuel', 'shell',
            'bpcl', 'iocl', 'hp petrol', 'reliance petroleum',
            'essar', 'nayara', 'petrol pump', 'fuel station',
            'cng', 'lpg auto'
        ],
        'merchants': [
            'Bharat Petroleum', 'Indian Oil', 'HP Fuel', 'Shell',
            'Reliance Petroleum'
        ]
    },

    'Travel & Stays': {
        'keywords': [
            'hotel', 'resort', 'accommodation', 'lodge', 'guest house',
            'motel', 'inn', 'hostel', 'airbnb', 'oyo', 'treebo',
            'fabhotel', 'goibibo', 'makemytrip', 'yatra', 'booking.com',
            'agoda', 'trivago', 'cleartrip', 'expedia', 'hotels.com',
            'staycation', 'villa', 'apartment rental', 'homestay'
        ],
        'merchants': [
            'OYO', 'Airbnb', 'MakeMyTrip', 'Goibibo', 'Cleartrip',
            'Yatra', 'Booking.com', 'Treebo', 'FabHotel'
        ]
    },

    'Shopping': {
        'keywords': [
            'amazon', 'flipkart', 'myntra', 'ajio', 'meesho',
            'nykaa', 'snapdeal', 'paytm mall', 'jiomart',
            'reliance', 'lifestyle', 'westside', 'pantaloons',
            'shopper', 'mall', 'store', 'retail', 'outlet',
            'fashion', 'clothing', 'apparel', 'footwear',
            'shoes', 'accessory', 'jewelry', 'watch', 'bewakoof',
            'power look', 'book depot', 'jewellers', 'mobile',
            'powerlook',
            # NEW: Gifts and flowers
            'gifts', 'floweraura', 'ferns', 'flowers', 'bouquet',
            'gift shop', 'fa gifts'
        ],
        'merchants': [
            'Amazon', 'Flipkart', 'Myntra', 'Ajio', 'Nykaa',
            'Power Look',
            'Bewakoof', 'Powerlook', 'Fa Gifts Private Lim'
        ]
    },

    'Groceries': {
        'keywords': [
            'dmart', 'avenuesupermarts', 'bigbazaar', 'more', 'reliance fresh',
            'spencer', 'hypercity', 'star bazaar', 'easy day',
            'grocery', 'supermarket', 'kirana', 'provision',
            'vegetables', 'fruits', 'milk', 'blinkit', 'zepto', 'instamart',
            'grofers', 'bigbasket', 'milkbasket', 'dunzo',
            'supermarts', 'dairy',
            'super market'
        ],
        'merchants': [
            'DMart', 'BigBazaar', 'More', 'BigBasket', 'Blinkit',
            'Dmart Ready', 'Avenue Supermarts Lt'
        ]
    },

    'Bills': {
        'keywords': [
            'electricity', 'water', 'gas', 'lpg',
            'bill', 'recharge', 'prepaid', 'postpaid',
            'mobile', 'phone', 'airtel', 'jio', 'vodafone', 'bsnl',
            'broadband', 'internet', 'wifi', 'fiber',
            'dth', 'tata sky', 'dish', 'sun direct',
            'municipal', 'corporation', 'tax', 'utility',
            'googlebbpsutility', 'simpl',
            'autopay', 'bill payment', 'insurance'
        ],
        'merchants': ['Simpl']
    },

    # Investments are savings, not spending (auto-flagged as savings transfers)
    'Investments': {
        'keywords': [
            'groww', 'zerodha', 'upstox', 'kuvera', 'paytm money', 'paytmmoney',
            'indmoney', 'smallcase', 'etmoney', 'mutual fund', 'mutual funds',
            'iccl', 'indian clearing', 'nse clearing', 'nsccl', 'bse star', 'bsestar',
            'camsonline', 'kfintech', 'nps trust', 'protean', 'public provident',
            'life insurance corpo', 'licofindia'
        ],
        'merchants': ['Life Insurance Corpo Licofindiaagc.Bdpg']
    },

    'Entertainment': {
        'keywords': [
            'netflix', 'amazon prime', 'hotstar', 'disney',
            'zee5', 'sonyliv', 'voot', 'alt balaji',
            'spotify', 'youtube', 'music', 'gaana', 'saavn',
            'bookmyshow', 'paytm insider', 'movie', 'cinema',
            'theater', 'show', 'concert', 'event', 'ticket',
            'gaming', 'game', 'steam', 'playstation', 'xbox',
            'jiocinema', 'viacom18', 'viacom18online', 'youtubegoogle',
            'novidigital', 'novdigitalenterta', 'subscription'
        ],
        'merchants': [
            'Jiocinema', 'Nov Digital Entertai', 'Novdigitalenterta',
            'Viacom18online'
        ]
    },

    'Healthcare': {
        'keywords': [
            'hospital', 'clinic', 'doctor', 'medical',
            'pharmacy', 'medicine', 'drug', 'apollo',
            'medplus', 'netmeds', '1mg', 'pharmeasy',
            'health', 'diagnostic', 'lab', 'test',
            'dental', 'dentist', 'eye care', 'optical',
            'insurance', 'mediclaim', 'healthplus', 'star health'
        ],
        'merchants': []
    },

    'Education': {
        'keywords': [
            'school', 'college', 'university', 'institute',
            'education', 'course', 'tuition', 'coaching',
            'academy', 'learning', 'training',
            'book', 'stationery', 'notebook', 'pen',
            'udemy', 'coursera', 'unacademy', 'byjus',
            'exam', 'fee', 'admission'
        ],
        'merchants': []
    },

    'Personal Expense': {
        'keywords': [
            'salon', 'spa', 'parlour', 'beauty',
            'haircut', 'massage', 'facial', 'grooming',
            'cosmetic', 'makeup', 'skincare',
            'gym', 'fitness', 'yoga', 'workout',
            'barber', 'haircut',
            # NEW: Salons
            'saloon', 'unisex salon', 'hair studio'
        ],
        'merchants': []
    },

    'Home Expense': {
        'keywords': [
            'furniture', 'furnishing', 'decor', 'decoration',
            'appliance', 'electronics', 'tv', 'washing machine',
            'refrigerator', 'fridge', 'ac', 'air conditioner',
            'kitchen', 'utensils', 'cookware', 'crockery',
            'bedding', 'mattress', 'pillow', 'curtain',
            'carpet', 'rug', 'lamp', 'lighting',
            'repair', 'maintenance', 'plumber', 'electrician',
            'carpenter', 'painting', 'renovation'
        ],
        'merchants': []
    },

    'ATM Withdrawal': {
        'keywords': ['atm'],
        'merchants': ['ATM Withdrawal']
    },

    'Personal Transfer': {
        'keywords': ['neft', 'imps', 'transfer', 'rtgs'],
        'merchants': [],
        'txn_types': ['neft', 'imps']  # From detect_transaction_type
    },

    'Income': {
        'keywords': ['salary', 'credit', 'refund', 'cashback', 'interest'],
        'merchants': [],
        'is_credit': True  # Only for credit transactions
    },

    'Services': {
        'keywords': [
            'service', 'repair',
            'copy center', 'xerox', 'print', 'stationery', 'statione',
            'pan shop', 'simpl', 'mobikwik',
            # NEW: Pet care and other services
            'pet care', 'pet', 'veterinary', 'vet', 'pet shop',
            'grooming', 'pet clinic', 'animal care',
        ],
        'merchants': [
            'Simpl'
        ]
    },

    # Work tools: AI assistants, hosting, design/creative software
    'Software & AI': {
        'keywords': [
            'claude', 'claude.ai', 'claude.ai subscription', 'claudeai', 'anthropic',
            'openai', 'chatgpt', 'chatgpt subscription', 'openai subscription',
            'cursor ai', 'github', 'hostinger', 'godaddy', 'namecheap', 'digitalocean',
            'amazon web services', 'vercel', 'netlify', 'figma', 'adobe', 'adobesystems',
            'canva', 'notion', 'epidemic sound', 'epidemic', 'stock music', 'audio library'
        ],
        'merchants': ['Claude AI', 'Adobe', 'Epidemic Sound Ab']
    },

    'Miscellaneous': {
        'keywords': [
            'other', 'misc', 'general', 'various'
        ],
        'merchants': []
    }
}


# Personal rules (local shops, people you pay) live in rules_local.py, which is
# gitignored so they never reach the public repo. See rules_local.example.py.
try:
    from .rules_local import LOCAL_RULES
except ModuleNotFoundError:
    LOCAL_RULES = {}

for _category, _extra in LOCAL_RULES.items():
    if _category not in CATEGORY_RULES:
        logger.warning(f"rules_local.py: unknown category '{_category}', skipped")
        continue
    for _key in ('keywords', 'merchants'):
        CATEGORY_RULES[_category].setdefault(_key, []).extend(_extra.get(_key, []))


def categorize_transaction(
    merchant: str,
    narration: str,
    txn_type: str = 'debit',
    transaction_type: Optional[str] = None,  # From detect_transaction_type
    is_p2p: bool = False,
    amount: float = 0.0,  # NEW: Transaction amount for smart heuristics
    use_learned: bool = True  # False = rules only (used by data migrations)
) -> str:
    """
    Categorize transaction based on merchant name and narration using best-match scoring

    Args:
        merchant: Cleaned merchant name
        narration: Full transaction narration
        txn_type: 'debit' or 'credit'
        transaction_type: Optional transaction type (upi, neft, imps, atm, etc.)
        is_p2p: Whether this is a P2P transfer
        amount: Transaction amount (for smart heuristics)

    Returns:
        Category name

    Scoring System:
    - Exact merchant match: 1000 points
    - Keyword match in merchant: length × 10 points
    - Keyword match in narration: length × 5 points

    Priority (checked before scoring):
    0. Learned merchant categorization (from user corrections)
    1. ATM withdrawal
    2. P2P transfer (with smart business detection)
    3. Income (credits)
    4. Amount-based heuristics for small transactions
    """
    merchant_lower = merchant.lower()
    narration_lower = narration.lower()

    # 0. Check if we've learned this merchant from user corrections (HIGHEST PRIORITY)
    learned_category = get_learned_category(merchant) if use_learned else None
    if learned_category:
        logger.debug(f"✓ Learned match: '{merchant}' → '{learned_category}'")
        return learned_category

    # 1. ATM withdrawal (highest priority)
    if merchant == 'ATM Withdrawal' or transaction_type == 'atm':
        return 'ATM Withdrawal'

    # 2. Smart P2P vs Business Detection
    # Check if this is actually a small business/vendor using PAYTMQR
    is_likely_business = _is_likely_business_vendor(narration_lower, merchant_lower, amount)

    if is_p2p or transaction_type in ['neft', 'imps']:
        # If it looks like a business (PAYTMQR + small amount), don't mark as P2P
        if not is_likely_business:
            return 'Personal Transfer'
        # Otherwise, continue to regular categorization (it's a business)

    # 3. Income (credits)
    if txn_type == 'credit':
        # Check for income keywords
        for keyword in CATEGORY_RULES['Income']['keywords']:
            if keyword in narration_lower:
                return 'Income'
        # Default credits to Income
        return 'Income'

    # 4. Amount-based heuristics for small transactions
    # Small repeated amounts likely indicate food/snacks/groceries
    smart_category = _get_smart_category_by_amount(amount, merchant_lower, narration_lower)
    if smart_category:
        logger.debug(f"Smart heuristic: '{merchant}' -> '{smart_category}' (amount: ₹{amount})")
        return smart_category

    # 4. Score-based matching for all other categories
    best_category = None
    best_score = 0
    best_match_info = None

    for category, rules in CATEGORY_RULES.items():
        # Skip special categories already handled
        if category in ['ATM Withdrawal', 'Personal Transfer', 'Income']:
            continue

        score = 0
        match_info = None

        # Check exact merchant match (highest score)
        if 'merchants' in rules:
            for known_merchant in rules['merchants']:
                if known_merchant.lower() == merchant_lower:
                    score = 1000
                    match_info = f"exact merchant '{known_merchant}'"
                    break

        # Check keyword matches (only if no exact merchant match)
        if score < 1000 and 'keywords' in rules:
            for keyword in rules['keywords']:
                keyword_lower = keyword.lower()

                # Match in merchant name (higher priority)
                if keyword_lower in merchant_lower:
                    keyword_score = len(keyword_lower) * 10
                    if keyword_score > score:
                        score = keyword_score
                        match_info = f"keyword '{keyword}' in merchant"

                # Match in narration (lower priority)
                elif keyword_lower in narration_lower:
                    keyword_score = len(keyword_lower) * 5
                    if keyword_score > score:
                        score = keyword_score
                        match_info = f"keyword '{keyword}' in narration"

        # Track best match
        if score > best_score:
            best_score = score
            best_category = category
            best_match_info = match_info

    # Return best match or default to Other
    if best_category:
        logger.debug(f"Matched '{merchant}' to '{best_category}' (score: {best_score}, {best_match_info})")
        return best_category
    else:
        logger.debug(f"No category match for '{merchant}', defaulting to 'Other'")
        return 'Other'


def _is_likely_business_vendor(narration: str, merchant: str, amount: float) -> bool:
    """
    Detect if a person name is actually a small business/vendor

    Indicators:
    - PAYTMQR in UPI ID (business QR code)
    - Small repeated amounts (₹10-200)
    - Merchant name patterns (shop names, etc.)

    Args:
        narration: Transaction narration (lowercase)
        merchant: Merchant name (lowercase)
        amount: Transaction amount

    Returns:
        True if likely a business vendor, False if likely personal transfer
    """
    # Check for PAYTMQR (PayTM QR codes are used by businesses)
    if 'paytmqr' in narration:
        # Small amounts with PAYTMQR = business vendor
        if amount <= 200:
            return True
        # Medium amounts (200-500) also likely business
        if amount <= 500:
            return True

    # Check for business keywords in merchant name
    business_indicators = [
        'shop', 'store', 'mart', 'center', 'centre', 'services',
        'electronics', 'mobile', 'xerox', 'medical', 'pharmacy',
        'hotel', 'restaurant', 'cafe', 'stall', 'corner'
    ]

    for indicator in business_indicators:
        if indicator in merchant:
            return True

    # Very small amounts (₹5-50) are usually tea/snacks/small purchases
    if 5 <= amount <= 50:
        return True

    return False


def _get_smart_category_by_amount(amount: float, merchant: str, narration: str) -> Optional[str]:
    """
    Smart categorization based on transaction amount patterns

    Amount patterns:
    - ₹5-50: Food & Dining (tea, snacks, small meals)
    - ₹50-200: Groceries or Food & Dining
    - ₹200-1000: Shopping or Services

    Args:
        amount: Transaction amount
        merchant: Merchant name (lowercase)
        narration: Narration (lowercase)

    Returns:
        Category name or None (continue to regular categorization)
    """
    # Very small amounts (₹5-50) = Food/Snacks/Tea
    if 5 <= amount <= 50:
        # Check if it's NOT clearly something else
        non_food_keywords = [
            'xerox', 'copy', 'print', 'recharge', 'bill',
            'book', 'amazon', 'pay balance', 'wallet', 'load'
        ]
        if not any(keyword in merchant or keyword in narration for keyword in non_food_keywords):
            return 'Food & Dining'

    # Small-medium amounts (₹50-200) with grocery indicators
    if 50 <= amount <= 200:
        grocery_indicators = ['milk', 'dairy', 'vegetable', 'fruit', 'kirana']
        if any(keyword in merchant or keyword in narration for keyword in grocery_indicators):
            return 'Groceries'

    # No smart suggestion - continue to regular categorization
    return None


def get_all_categories() -> list:
    """
    Get list of all available categories

    Returns:
        List of category names
    """
    return list(CATEGORY_RULES.keys()) + ['Other']


def add_keyword_to_category(category: str, keyword: str) -> bool:
    """
    Add a keyword to a category (runtime modification)

    Args:
        category: Category name
        keyword: Keyword to add

    Returns:
        True if added successfully
    """
    if category in CATEGORY_RULES:
        if 'keywords' in CATEGORY_RULES[category]:
            if keyword.lower() not in CATEGORY_RULES[category]['keywords']:
                CATEGORY_RULES[category]['keywords'].append(keyword.lower())
                logger.info(f"Added keyword '{keyword}' to category '{category}'")
                return True
    return False


if __name__ == "__main__":
    # Test categorization
    test_cases = [
        {
            'merchant': 'Mc Donalds',
            'narration': 'UPI-MC DONALDS-MCDONALDS.41173767@HDFCBANK',
            'txn_type': 'debit',
            'transaction_type': 'upi',
            'is_p2p': False
        },
        {
            'merchant': 'Google India Digital',
            'narration': 'UPI-GOOGLE INDIA DIGITAL-GPAY-TOLL@OKPAY',
            'txn_type': 'debit',
            'transaction_type': 'upi',
            'is_p2p': False
        },
        {
            'merchant': 'Rahul Sharma',
            'narration': 'UPI-RAHUL SHARMA-RAHUL.SHARMA@OKHDFCBANK',
            'txn_type': 'credit',
            'transaction_type': 'upi',
            'is_p2p': True
        },
        {
            'merchant': 'ATM Withdrawal',
            'narration': 'ATM WDL-HDFC ATM BANGALORE',
            'txn_type': 'debit',
            'transaction_type': 'atm',
            'is_p2p': False
        },
        {
            'merchant': 'Swiggy',
            'narration': 'UPI-SWIGGY-ORDER123@PAYTM',
            'txn_type': 'debit',
            'transaction_type': 'upi',
            'is_p2p': False
        },
    ]

    print("Testing Categorization:")
    print("=" * 80)
    for test in test_cases:
        category = categorize_transaction(**test)
        print(f"\nMerchant: {test['merchant']}")
        print(f"Type:     {test['transaction_type']}")
        print(f"P2P:      {test['is_p2p']}")
        print(f"Category: {category}")
