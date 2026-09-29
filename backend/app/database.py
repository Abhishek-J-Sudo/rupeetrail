"""
Database Module

SQLite database operations for RupeeTrail
"""

import re
import sqlite3
import hashlib
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

from .storage import DATA_DIR, SAMPLE_DB_PATH, load_settings

# The database lives in the data folder (see storage.py, RUPEETRAIL_DATA_DIR)
DB_PATH = DATA_DIR / "expenses.db"

# While sample data is on (sample.py), every connection goes to the sample database instead
_sample_on = load_settings()["sample"] and SAMPLE_DB_PATH.exists()


def sample_active() -> bool:
    return _sample_on


def use_sample(on: bool):
    global _sample_on
    _sample_on = on


def active_db_path() -> Path:
    return SAMPLE_DB_PATH if _sample_on else DB_PATH

# Transactions in this category are savings, not spending
INVESTMENT_CATEGORY = "Investments"

# SQL fragment for UPDATEs that change category to the value bound at `?`:
# moving into Investments marks the row as savings, moving out of it clears the flag.
# (SQLite evaluates `category` here against the row's OLD value.)
_SAVINGS_FLAG_ON_RECATEGORIZE = f"""
    is_savings_transfer = CASE
        WHEN ? = '{INVESTMENT_CATEGORY}' AND txn_type = 'debit' THEN 1
        WHEN category = '{INVESTMENT_CATEGORY}' THEN 0
        ELSE is_savings_transfer
    END"""


def get_connection():
    """Get SQLite database connection"""
    path = active_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row  # Return rows as dictionaries
    return conn


def init_db():
    """
    Initialize database schema
    Creates tables: transactions, merchant_aliases, category_overrides
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Transactions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT UNIQUE NOT NULL,
            ref_no TEXT,
            date TEXT NOT NULL,
            merchant TEXT NOT NULL,
            narration TEXT NOT NULL,
            amount REAL NOT NULL,
            txn_type TEXT NOT NULL,
            balance REAL,
            category TEXT NOT NULL,
            is_excluded INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Indexes for performance
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_date ON transactions(date)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_category ON transactions(category)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_month
        ON transactions(strftime('%Y-%m', date))
    """)

    # Merchant aliases table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS merchant_aliases (
            merchant TEXT PRIMARY KEY,
            alias TEXT NOT NULL,
            category TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Who taught a learned merchant its category: 'manual' or 'ai'
    columns = {row['name'] for row in cursor.execute("PRAGMA table_info(merchant_aliases)")}
    if 'source' not in columns:
        cursor.execute("ALTER TABLE merchant_aliases ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'")

    # Older databases were created before the savings flag existed
    columns = {row['name'] for row in cursor.execute("PRAGMA table_info(transactions)")}
    if 'is_savings_transfer' not in columns:
        cursor.execute("ALTER TABLE transactions ADD COLUMN is_savings_transfer INTEGER DEFAULT 0")
    # Who set the category: 'rule' (categorizer), 'manual' (the user), 'ai' (payee review).
    # Rows categorised by a learned merchant take the source of that learning.
    if 'category_source' not in columns:
        cursor.execute("ALTER TABLE transactions ADD COLUMN category_source TEXT NOT NULL DEFAULT 'rule'")
    # Which statement a row came from ('hdfc', 'gpay'), its UPI ID, and the account
    # ('HDFC Bank 6722'), so a payment in both a bank and a GPay statement is kept once
    for column in ('source', 'upi_id', 'account'):
        if column not in columns:
            cursor.execute(f"ALTER TABLE transactions ADD COLUMN {column} TEXT")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_upi_id ON transactions(upi_id)")

    # What each imported bank statement covers: every transaction on `account` from
    # `start` to `end`. A GPay payment in that span that the bank statement doesn't have
    # isn't added (it failed, or was reversed): see import_statement.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS statement_coverage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account TEXT NOT NULL,
            source TEXT NOT NULL,
            start TEXT NOT NULL,
            end TEXT NOT NULL,
            imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Key/value store: one-time data migrations, and the monthly savings target
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # Legacy: latest AI insight per period (superseded by ai_insight_history)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_insights (
            period TEXT PRIMARY KEY,
            data_hash TEXT NOT NULL,
            payload TEXT NOT NULL,
            result TEXT NOT NULL,
            model TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Every generated AI insight, so regenerating never loses an earlier version
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_insight_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period TEXT NOT NULL,
            data_hash TEXT NOT NULL,
            payload TEXT NOT NULL,
            result TEXT NOT NULL,
            model TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_history_period ON ai_insight_history(period)")
    cursor.execute("""
        INSERT INTO ai_insight_history (period, data_hash, payload, result, model, created_at)
        SELECT period, data_hash, payload, result, model, created_at FROM ai_insights i
        WHERE NOT EXISTS (
            SELECT 1 FROM ai_insight_history h WHERE h.period = i.period AND h.created_at = i.created_at
        )
    """)

    # AI review of payees (ai/payees.py): suggested category and display name per cleaned
    # business name; status open / applied / dismissed
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_category_suggestions (
            name TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            confidence TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    columns = {row['name'] for row in cursor.execute("PRAGMA table_info(ai_category_suggestions)")}
    if 'display_name' not in columns:
        cursor.execute("ALTER TABLE ai_category_suggestions ADD COLUMN display_name TEXT")
    if 'status' not in columns:
        cursor.execute("ALTER TABLE ai_category_suggestions ADD COLUMN status TEXT NOT NULL DEFAULT 'open'")

    # Clean display names for raw merchants ("Avenue Supermarts Lt..." -> "DMart")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS payee_names (
            merchant TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Monthly spending limit per category (categories without a row have no budget)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            category TEXT PRIMARY KEY,
            monthly_limit REAL NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Category overrides table (track manual edits)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS category_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id INTEGER NOT NULL,
            old_category TEXT NOT NULL,
            new_category TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        )
    """)

    conn.commit()
    conn.close()
    logger.info("Database initialized successfully")


def _initial_savings_flag(txn: Dict) -> int:
    """Investment debits count as savings from the moment they're imported"""
    return 1 if txn['category'] == INVESTMENT_CATEGORY and txn['txn_type'] == 'debit' else 0


def _initial_category_source(txn: Dict) -> str:
    """'rule', unless the category came from a learned merchant: then whoever taught it"""
    from .categorizer.learning import get_learned_source  # learning imports this module
    return get_learned_source(txn['merchant'], txn['category']) or 'rule'


def generate_transaction_hash(date: str, amount: float, merchant: str) -> str:
    """
    Generate unique hash for transaction deduplication

    Args:
        date: ISO format date (YYYY-MM-DD)
        amount: Transaction amount
        merchant: Merchant name

    Returns:
        MD5 hash string
    """
    key = f"{date}-{amount}-{merchant}"
    return hashlib.md5(key.encode()).hexdigest()


def insert_transaction(txn: Dict) -> bool:
    """
    Insert transaction with duplicate check

    Args:
        txn: Dictionary with transaction data
            {
                'date': 'YYYY-MM-DD',
                'merchant': str,
                'narration': str,
                'amount': float,
                'txn_type': 'debit' | 'credit',
                'balance': float,
                'category': str
            }

    Returns:
        True if inserted, False if duplicate
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Generate hash
    txn_hash = generate_transaction_hash(
        txn['date'],
        txn['amount'],
        txn['merchant']
    )

    try:
        cursor.execute("""
            INSERT INTO transactions
            (hash, ref_no, date, merchant, narration, amount, txn_type, balance, category, is_savings_transfer, category_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            txn_hash,
            txn.get('ref_no', ''),
            txn['date'],
            txn['merchant'],
            txn['narration'],
            txn['amount'],
            txn['txn_type'],
            txn.get('balance'),
            txn['category'],
            _initial_savings_flag(txn),
            _initial_category_source(txn)
        ))
        conn.commit()
        logger.debug(f"Inserted transaction: {txn['merchant']} - {txn['amount']}")
        return True
    except sqlite3.IntegrityError:
        # Duplicate transaction
        logger.debug(f"Duplicate transaction skipped: {txn['merchant']} - {txn['amount']}")
        return False
    finally:
        conn.close()


def upi_hash(upi_id: str, txn_type: str) -> str:
    return hashlib.md5(f"upi-{upi_id}-{txn_type}".encode()).hexdigest()


def _row_hash(txn: Dict) -> str:
    """
    A row's identity for skipping duplicates. UPI payments use their UPI ID, so two equal
    payments to one payee on one day stay two; other rows use date, amount and merchant.
    """
    if txn.get('upi_id'):
        return upi_hash(txn['upi_id'], txn['txn_type'])
    return generate_transaction_hash(txn['date'], txn['amount'], txn['merchant'])


def _insert(cursor, txn: Dict) -> bool:
    """Insert one row; False if it's already there"""
    try:
        cursor.execute("""
            INSERT INTO transactions
            (hash, ref_no, date, merchant, narration, amount, txn_type, balance, category,
             is_savings_transfer, category_source, source, upi_id, account)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            _row_hash(txn),
            txn.get('ref_no', ''),
            txn['date'],
            txn['merchant'],
            txn['narration'],
            txn['amount'],
            txn['txn_type'],
            txn.get('balance'),
            txn['category'],
            _initial_savings_flag(txn),
            _initial_category_source(txn),
            txn.get('source'),
            txn.get('upi_id'),
            txn.get('account'),
        ))
        return True
    except sqlite3.IntegrityError:
        return False


def bulk_insert_transactions(transactions: List[Dict]) -> tuple[int, int]:
    """
    Insert rows in one database transaction, skipping any already there

    Statements go through import_statement, which also keeps a payment that's in both
    a bank and a GPay statement once. This is for rows that need none of that (sample data).

    Returns:
        Tuple of (saved_count, duplicate_count)
    """
    if not transactions:
        return 0, 0

    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            saved = sum(_insert(cursor, txn) for txn in transactions)
        logger.info(f"Bulk insert completed: {saved} saved, {len(transactions) - saved} duplicates")
        return saved, len(transactions) - saved
    finally:
        conn.close()


def _account_key(account: Optional[str]) -> Optional[tuple]:
    """'HDFC Bank 6722' -> ('hdfc', '6722'): the bank's first word and the last 4 digits"""
    digits = re.sub(r'\D', '', account or '')
    words = (account or '').split()
    return (words[0].lower(), digits[-4:]) if words and len(digits) >= 4 else None


def _same_payment(cursor, txn: Dict, gpay: bool) -> Optional[sqlite3.Row]:
    """
    The stored row for the same payment: same UPI ID, amount and direction (a refund can
    carry the original payment's UPI ID), from GPay or from a bank statement
    """
    if not txn.get('upi_id'):
        return None
    return cursor.execute(f"""
        SELECT * FROM transactions
        WHERE upi_id = ? AND txn_type = ? AND ABS(amount - ?) < 0.005
          AND source {'=' if gpay else 'IS NOT'} 'gpay'
        LIMIT 1
    """, (txn['upi_id'], txn['txn_type'], txn['amount'])).fetchone()


def _take_over(cursor, gpay_row: sqlite3.Row, txn: Dict) -> bool:
    """
    Turn a GPay row into the bank statement's row for the same payment

    The bank's row is the fuller record (balance, the bank's own date and narration), so
    it replaces the GPay one in place: the row keeps its id, and a category the user or
    the AI set on it. False if the bank's row is somehow already stored.
    """
    keep_category = gpay_row['category_source'] != 'rule'
    category = gpay_row['category'] if keep_category else txn['category']
    try:
        cursor.execute("""
            UPDATE transactions SET
                hash = ?, ref_no = ?, date = ?, merchant = ?, narration = ?, balance = ?,
                source = ?, upi_id = ?, account = ?, category = ?, category_source = ?,
                is_savings_transfer = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            _row_hash(txn), txn.get('ref_no', ''), txn['date'], txn['merchant'], txn['narration'],
            txn.get('balance'), txn.get('source'), txn.get('upi_id'), txn.get('account'),
            category,
            gpay_row['category_source'] if keep_category else _initial_category_source(txn),
            gpay_row['is_savings_transfer'] if keep_category else _initial_savings_flag(txn),
            gpay_row['id'],
        ))
        return True
    except sqlite3.IntegrityError:
        _delete_rows(cursor, [gpay_row['id']])
        return False


def _delete_rows(cursor, ids: List[int]):
    for row_id in ids:
        cursor.execute("DELETE FROM category_overrides WHERE transaction_id = ?", (row_id,))
        cursor.execute("DELETE FROM transactions WHERE id = ?", (row_id,))


def _covered(txn: Dict, coverage: List[sqlite3.Row]) -> bool:
    """Whether an imported bank statement covers this row's account and date"""
    key = _account_key(txn.get('account'))
    return key is not None and any(
        _account_key(c['account']) == key and c['start'] <= txn['date'] <= c['end'] for c in coverage
    )


def import_statement(transactions: List[Dict], coverage=None, source: Optional[str] = None) -> Dict[str, int]:
    """
    Save a statement's rows, keeping each payment once across bank and GPay statements

    A bank statement (coverage given: account, start, end) is the complete record:
    - a GPay row for the same payment (same UPI ID) becomes the bank's row ('replaced')
    - GPay rows on that account and dates with no bank row are removed ('removed');
      the payment failed or was reversed
    - its span is remembered for later GPay imports

    A GPay statement (no coverage) only fills gaps:
    - a payment already in a bank statement isn't added ('in_bank_statement')
    - nor is one on an account and date a bank statement covers but doesn't have
      ('not_in_bank_statement')

    Returns counts: saved, duplicates, replaced, removed, in_bank_statement, not_in_bank_statement
    """
    counts = dict(saved=0, duplicates=0, replaced=0, removed=0, in_bank_statement=0, not_in_bank_statement=0)
    conn = get_connection()
    try:
        with conn:
            cursor = conn.cursor()
            if coverage:
                replaced = []
                for txn in transactions:
                    gpay_row = _same_payment(cursor, txn, gpay=True)
                    if gpay_row and _take_over(cursor, gpay_row, txn):
                        counts['replaced'] += 1
                        replaced.append(gpay_row['id'])
                    elif _insert(cursor, txn):
                        counts['saved'] += 1
                    else:
                        counts['duplicates'] += 1

                key = _account_key(coverage.account)
                orphans = [
                    row['id'] for row in cursor.execute(
                        "SELECT id, account FROM transactions WHERE source = 'gpay' AND date BETWEEN ? AND ?",
                        (coverage.start, coverage.end),
                    ).fetchall()
                    if _account_key(row['account']) == key
                ]
                _delete_rows(cursor, orphans)
                counts['removed'] = len(orphans)

                cursor.execute(
                    "INSERT INTO statement_coverage (account, source, start, end) VALUES (?, ?, ?, ?)",
                    (coverage.account, source or '', coverage.start, coverage.end),
                )
            else:
                covered_spans = cursor.execute("SELECT account, start, end FROM statement_coverage").fetchall()
                for txn in transactions:
                    if _same_payment(cursor, txn, gpay=False):
                        counts['in_bank_statement'] += 1
                    elif _covered(txn, covered_spans):
                        counts['not_in_bank_statement'] += 1
                    elif _insert(cursor, txn):
                        counts['saved'] += 1
                    else:
                        counts['duplicates'] += 1
        logger.info(f"Imported statement: {counts}")
        return counts
    finally:
        conn.close()


def get_transactions(
    month: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 2000,
    offset: int = 0,
    include_excluded: bool = False
) -> List[Dict]:
    """
    Retrieve transactions with optional filters

    Args:
        month: YYYY-MM format (e.g., "2025-01")
        category: Category name
        limit: Max results
        offset: Pagination offset
        include_excluded: If True, include excluded transactions (default: False)

    Returns:
        List of transaction dictionaries
    """
    conn = get_connection()
    cursor = conn.cursor()

    # display_name: the clean payee name, when one was set (payee_names)
    query = """
        SELECT t.*, p.display_name FROM transactions t
        LEFT JOIN payee_names p ON p.merchant = t.merchant
        WHERE 1=1"""
    if not include_excluded:
        query += " AND t.is_excluded = 0"
    params = []

    if month:
        query += " AND strftime('%Y-%m', t.date) = ?"
        params.append(month)

    if category:
        query += " AND t.category = ?"
        params.append(category)

    query += " ORDER BY t.date DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()

    # Salary credits and loan EMIs are named by rules, over any saved name
    from .payee_rules import rule_payee_name
    for row in rows:
        row['display_name'] = rule_payee_name(row['merchant'], row['narration']) or row['display_name']
    return rows


def get_summary(month: str) -> List[Dict]:
    """
    Get spending summary by category for a month

    Args:
        month: YYYY-MM format

    Returns:
        List of category summaries:
        [
            {
                'category': str,
                'total': float,
                'count': int,
                'percentage': float
            }
        ]
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Get category totals
    cursor.execute("""
        SELECT
            category,
            SUM(amount) as total,
            COUNT(*) as count
        FROM transactions
        WHERE strftime('%Y-%m', date) = ?
        AND txn_type = 'debit'
        GROUP BY category
        ORDER BY total DESC
    """, (month,))

    rows = cursor.fetchall()

    # Calculate total for percentage
    total_spending = sum(row['total'] for row in rows)

    result = []
    for row in rows:
        result.append({
            'category': row['category'],
            'total': row['total'],
            'count': row['count'],
            'percentage': (row['total'] / total_spending * 100) if total_spending > 0 else 0
        })

    conn.close()
    return result


def update_transaction(txn_id: int, merchant: Optional[str] = None, category: Optional[str] = None) -> bool:
    """
    Update transaction merchant or category

    Args:
        txn_id: Transaction ID
        merchant: New merchant name (optional)
        category: New category (optional)

    Returns:
        True if updated, False if not found
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Get current transaction for category override tracking
    cursor.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,))
    current = cursor.fetchone()

    if not current:
        conn.close()
        return False

    updates = []
    params = []

    if merchant:
        updates.append("merchant = ?")
        params.append(merchant)

    if category:
        updates.append(_SAVINGS_FLAG_ON_RECATEGORIZE)
        params.append(category)
        updates.append("category = ?")
        params.append(category)
        updates.append("category_source = 'manual'")

        # Track category override
        cursor.execute("""
            INSERT INTO category_overrides (transaction_id, old_category, new_category)
            VALUES (?, ?, ?)
        """, (txn_id, current['category'], category))

    if not updates:
        conn.close()
        return False

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(txn_id)

    cursor.execute(f"""
        UPDATE transactions
        SET {', '.join(updates)}
        WHERE id = ?
    """, params)

    conn.commit()
    conn.close()
    logger.info(f"Updated transaction {txn_id}")
    return True


def add_merchant_alias(merchant: str, alias: str, category: Optional[str] = None) -> bool:
    """
    Create merchant alias for better categorization

    Args:
        merchant: Original merchant name
        alias: User-friendly alias
        category: Preferred category

    Returns:
        True if created/updated
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO merchant_aliases (merchant, alias, category)
        VALUES (?, ?, ?)
    """, (merchant, alias, category))

    conn.commit()
    conn.close()
    logger.info(f"Added alias: {merchant} -> {alias}")
    return True


def get_merchant_alias(merchant: str) -> Optional[Dict]:
    """
    Get merchant alias if exists

    Args:
        merchant: Merchant name

    Returns:
        Alias dict or None
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM merchant_aliases WHERE merchant = ?
    """, (merchant,))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def get_transaction_by_id(txn_id: int) -> Optional[Dict]:
    """
    Get single transaction by ID

    Args:
        txn_id: Transaction ID

    Returns:
        Transaction dict or None
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,))
    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def get_transactions_by_merchant(merchant: str, exclude_id: Optional[int] = None) -> List[Dict]:
    """
    Find all transactions from similar merchants using fuzzy matching

    Extracts the person/business name (first 2-3 words) and finds all transactions
    with merchants starting with that pattern. This handles UPI IDs that have
    transaction-specific suffixes.

    Args:
        merchant: Merchant name
        exclude_id: Optional transaction ID to exclude (the one being updated)

    Returns:
        List of transaction dictionaries
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Extract base merchant name (first 2-3 words before Paytmqr/numbers/IDs)
    # Examples:
    #   "Farhan Ali Paytmqr100000..." -> "Farhan Ali%"
    #   "Ruksana Bano Wo Farhan Paytmqr..." -> "Ruksana Bano Wo Farhan%"
    #   "Golden Dragon Family" -> "Golden Dragon Family%"

    # Split by spaces and take first 2-4 words (before technical IDs)
    words = merchant.split()

    # If merchant has "Paytmqr" or similar, take words before it
    # Otherwise take first 2-3 words
    base_words = []
    for word in words:
        if any(x in word.lower() for x in ['paytmqr', 'bajajpay', '@']):
            break
        base_words.append(word)
        if len(base_words) >= 3:  # Limit to 3 words for person names
            break

    # If we got no words (merchant started with technical ID), use first word
    if not base_words:
        base_words = words[:1]

    fuzzy_pattern = ' '.join(base_words) + '%'

    logger.debug(f"Fuzzy matching: '{merchant}' -> pattern '{fuzzy_pattern}'")

    if exclude_id:
        cursor.execute("""
            SELECT * FROM transactions
            WHERE merchant LIKE ? AND id != ?
            ORDER BY date DESC
        """, (fuzzy_pattern, exclude_id))
    else:
        cursor.execute("""
            SELECT * FROM transactions
            WHERE merchant LIKE ?
            ORDER BY date DESC
        """, (fuzzy_pattern,))

    rows = cursor.fetchall()
    conn.close()

    logger.debug(f"Fuzzy match found {len(rows)} similar transactions")
    return [dict(row) for row in rows]


def bulk_update_categories(transaction_ids: List[int], category: str, source: str = 'manual') -> int:
    """
    Update category for multiple transactions at once

    Args:
        transaction_ids: List of transaction IDs
        category: New category to apply
        source: Who set it ('manual' or 'ai'), saved as category_source

    Returns:
        Number of transactions updated
    """
    if not transaction_ids:
        return 0

    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Create placeholders for SQL IN clause
        placeholders = ','.join('?' * len(transaction_ids))

        cursor.execute(f"""
            UPDATE transactions
            SET {_SAVINGS_FLAG_ON_RECATEGORIZE}, category = ?, category_source = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id IN ({placeholders})
        """, [category, category, source] + transaction_ids)

        updated_count = cursor.rowcount
        conn.commit()

        logger.info(f"Bulk updated {updated_count} transactions to category '{category}'")
        return updated_count

    except Exception as e:
        conn.rollback()
        logger.error(f"Bulk update failed: {e}")
        raise
    finally:
        conn.close()


def get_category_suggestions() -> List[Dict]:
    """
    Get merchant-to-category suggestions based on manual edits

    Analyzes category_overrides table to find patterns where users
    consistently recategorize the same merchant.

    Returns:
        List of suggestions:
        [
            {
                'merchant': str,
                'suggested_category': str,
                'edit_count': int,
                'confidence': float  # 0-1
            }
        ]
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Find merchants that have been manually recategorized multiple times
    cursor.execute("""
        SELECT
            t.merchant,
            co.new_category,
            COUNT(*) as edit_count
        FROM category_overrides co
        JOIN transactions t ON co.transaction_id = t.id
        GROUP BY t.merchant, co.new_category
        HAVING edit_count >= 2
        ORDER BY edit_count DESC
    """)

    rows = cursor.fetchall()
    conn.close()

    suggestions = []
    for row in rows:
        suggestions.append({
            'merchant': row['merchant'],
            'suggested_category': row['new_category'],
            'edit_count': row['edit_count'],
            'confidence': min(row['edit_count'] / 5.0, 1.0)  # Max out at 5 edits
        })

    return suggestions


SAVINGS_TARGET_KEY = "savings_target"


def get_budgets() -> Dict:
    """Monthly limits per category and the monthly savings target (None when not set)"""
    conn = get_connection()
    try:
        limits = {
            row['category']: row['monthly_limit']
            for row in conn.execute("SELECT category, monthly_limit FROM budgets ORDER BY category")
        }
        row = conn.execute("SELECT value FROM app_meta WHERE key = ?", (SAVINGS_TARGET_KEY,)).fetchone()
        return {"limits": limits, "savings_target": float(row['value']) if row else None}
    finally:
        conn.close()


def save_budgets(limits: Dict[str, float], savings_target: Optional[float]) -> Dict:
    """
    Replace every budget with `limits` ({category: monthly limit}) in one transaction.
    Limits of 0 or less, and a savings target of 0 or less, mean "none".
    """
    conn = get_connection()
    try:
        with conn:
            conn.execute("DELETE FROM budgets")
            conn.executemany(
                "INSERT INTO budgets (category, monthly_limit) VALUES (?, ?)",
                [(name, amount) for name, amount in limits.items() if amount and amount > 0],
            )
            if savings_target and savings_target > 0:
                conn.execute(
                    "INSERT INTO app_meta (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (SAVINGS_TARGET_KEY, str(savings_target)),
                )
            else:
                conn.execute("DELETE FROM app_meta WHERE key = ?", (SAVINGS_TARGET_KEY,))
    finally:
        conn.close()
    return get_budgets()


def clear_all_transactions() -> int:
    """
    Clear all transactions from the database

    Returns:
        Number of transactions deleted
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM transactions")
    count = cursor.rowcount
    cursor.execute("DELETE FROM statement_coverage")

    conn.commit()
    conn.close()

    logger.info(f"Cleared {count} transactions from database")
    return count


if __name__ == "__main__":
    # Test database initialization
    logging.basicConfig(level=logging.INFO)
    init_db()
    print(f"Database initialized at: {DB_PATH}")
