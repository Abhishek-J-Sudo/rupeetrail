"""
One-time data migrations, run on startup

Each migration runs once and is recorded in the app_meta table.
The database is backed up before any pending migration runs.
"""

import shutil
import logging
from datetime import datetime

from .database import get_connection, active_db_path, INVESTMENT_CATEGORY
from .categorizer.rules import categorize_transaction
from .categorizer.learning import get_learned_category, load_learned_merchants
from .parser.merchant import detect_transaction_type, is_p2p_transfer

logger = logging.getLogger(__name__)


def _recategorize_investments(cursor) -> str:
    """
    Move investment debits (Groww, mutual funds, LIC...) into Investments and flag them
    as savings, and re-sort rows the old 'meru' keyword wrongly put in Transportation
    (it matched the HDFC0MERUPI IFSC in most merchant UPI narrations).

    Rows the user categorized by hand, and merchants the app has learned, are left alone.
    """
    overridden = {row[0] for row in cursor.execute("SELECT transaction_id FROM category_overrides")}
    rows = cursor.execute("""
        SELECT id, merchant, narration, amount, category
        FROM transactions
        WHERE txn_type = 'debit'
    """).fetchall()

    moved_to_investments = 0
    transport_fixed = 0

    for row in rows:
        if row['id'] in overridden or get_learned_category(row['merchant']):
            continue

        narration = row['narration']
        new_category = categorize_transaction(
            merchant=row['merchant'],
            narration=narration,
            txn_type='debit',
            transaction_type=detect_transaction_type(narration),
            is_p2p=is_p2p_transfer(narration, row['merchant']),
            amount=abs(row['amount']),
        )

        is_investment = new_category == INVESTMENT_CATEGORY and row['category'] != INVESTMENT_CATEGORY
        is_meru_fix = (
            row['category'] == 'Transportation'
            and 'merupi' in narration.lower()
            and new_category != 'Transportation'
        )
        if not (is_investment or is_meru_fix):
            continue

        cursor.execute(
            """
            UPDATE transactions
            SET category = ?, is_savings_transfer = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (new_category, 1 if new_category == INVESTMENT_CATEGORY else 0, row['id']),
        )
        if is_investment:
            moved_to_investments += 1
        else:
            transport_fixed += 1

    return f"{moved_to_investments} moved to Investments, {transport_fixed} Transportation rows re-sorted"


def _move_to_software_ai(cursor) -> str:
    """
    Move AI tools, hosting and design software into 'Software & AI', including rows
    and learned merchants previously set to Services/Other/Bills (the user asked for
    these to be tracked separately).
    """
    target = "Software & AI"
    rows = cursor.execute("""
        SELECT id, merchant, narration, amount, category
        FROM transactions
        WHERE txn_type = 'debit' AND category != ?
    """, (target,)).fetchall()

    moved_ids = []
    merchants = set()
    for row in rows:
        rules_category = categorize_transaction(
            merchant=row['merchant'],
            narration=row['narration'],
            txn_type='debit',
            amount=abs(row['amount']),
            use_learned=False,
        )
        if rules_category == target:
            moved_ids.append(row['id'])
            merchants.add(row['merchant'])

    for txn_id in moved_ids:
        cursor.execute(
            "UPDATE transactions SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (target, txn_id),
        )

    relearned = 0
    for merchant in merchants:
        cursor.execute(
            "UPDATE merchant_aliases SET category = ? WHERE merchant = ? AND category IS NOT NULL",
            (target, merchant),
        )
        relearned += cursor.rowcount

    return f"{len(moved_ids)} moved to {target}, {relearned} learned merchants updated"


def _backfill_category_source(cursor) -> str:
    """
    Mark rows the user categorised: single edits (category_overrides), and any row whose
    category differs from what the rules alone give, which covers bulk edits and merchants
    the user taught (neither left a record). Everything else stays 'rule'. Rows changed by
    an applied AI payee review are 'ai'.
    """
    overridden = {row[0] for row in cursor.execute("SELECT transaction_id FROM category_overrides")}
    ai_merchants = {}
    applied = cursor.execute("""
        SELECT name, category FROM ai_category_suggestions WHERE status = 'applied'
    """).fetchall()
    if applied:
        from .ai.privacy import shareable_merchant
        by_name = {row['name']: row['category'] for row in applied}
        for row in cursor.execute("SELECT DISTINCT merchant, narration, category FROM transactions WHERE txn_type = 'debit'"):
            name = shareable_merchant(row['merchant'], row['narration'], row['category'])
            if name in by_name and by_name[name] == row['category']:
                ai_merchants[row['merchant']] = row['category']
        # Learned from the AI review, so later imports of these merchants count as AI too
        for merchant, category in ai_merchants.items():
            cursor.execute(
                "UPDATE merchant_aliases SET source = 'ai' WHERE merchant = ? AND category = ?",
                (merchant, category),
            )

    rows = cursor.execute("SELECT id, merchant, narration, amount, txn_type, category FROM transactions").fetchall()
    manual, ai = [], []
    for row in rows:
        if row['id'] in overridden:
            manual.append(row['id'])
            continue
        rules_category = categorize_transaction(
            merchant=row['merchant'],
            narration=row['narration'],
            txn_type=row['txn_type'],
            transaction_type=detect_transaction_type(row['narration']),
            is_p2p=is_p2p_transfer(row['narration'], row['merchant']),
            amount=abs(row['amount']),
            use_learned=False,
        )
        if rules_category == row['category']:
            continue
        if ai_merchants.get(row['merchant']) == row['category']:
            ai.append(row['id'])
        else:
            manual.append(row['id'])

    cursor.executemany("UPDATE transactions SET category_source = 'manual' WHERE id = ?", [(i,) for i in manual])
    cursor.executemany("UPDATE transactions SET category_source = 'ai' WHERE id = ?", [(i,) for i in ai])
    return f"{len(manual)} rows set by the user, {len(ai)} by AI, {len(rows) - len(manual) - len(ai)} by rules"


MIGRATIONS = [
    ("recategorize_investments_v1", _recategorize_investments),
    ("software_ai_v1", _move_to_software_ai),
    ("category_source_v1", _backfill_category_source),
]


def mark_migrations_done():
    """A new, empty database (the sample one) has nothing to migrate"""
    conn = get_connection()
    with conn:
        conn.executemany(
            "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, 'not needed: new database')",
            [(key,) for key, _ in MIGRATIONS],
        )
    conn.close()


def run_migrations():
    conn = get_connection()
    cursor = conn.cursor()
    done = {row[0] for row in cursor.execute("SELECT key FROM app_meta")}
    pending = [(key, fn) for key, fn in MIGRATIONS if key not in done]

    if not pending:
        conn.close()
        return

    # Safety net: keep a copy of the database as it was before migrating
    db_path = active_db_path()
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(exist_ok=True)
    backup_path = backup_dir / f"expenses-{datetime.now():%Y%m%d-%H%M%S}.db"
    conn.close()
    shutil.copy2(db_path, backup_path)
    logger.info(f"Backed up database to {backup_path}")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        for key, fn in pending:
            summary = fn(cursor)
            cursor.execute("INSERT INTO app_meta (key, value) VALUES (?, ?)", (key, summary))
            conn.commit()
            logger.info(f"Migration {key}: {summary}")
    except Exception:
        conn.rollback()
        logger.exception("Migration failed; database left unchanged")
        raise
    finally:
        conn.close()

    # Migrations may have changed learned merchants
    load_learned_merchants()
