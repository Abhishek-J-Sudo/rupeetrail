"""
Sample mode: "Try with sample data" on the welcome screen

Turning it on creates a separate database (storage.SAMPLE_DB_PATH), imports the made-up statement
from sample_data.py into it through the real reader, and points every connection there. The real
database is never opened meanwhile, so nothing the user does with the sample (edits, budgets, AI
answers, learned merchants) can reach their own data. Clearing deletes the sample database and
goes back to the real one; importing a real statement clears it first.
"""

import logging
from datetime import date

from . import storage
from .database import bulk_insert_transactions, init_db, sample_active, save_budgets, use_sample
from .migrations import mark_migrations_done
from .categorizer.learning import load_learned_merchants
from .parser.extract_excel import extract_hdfc_transactions_excel
from .sample_data import write_statement

logger = logging.getLogger(__name__)

# Monthly limits that make the Budgets section show a mix of under, near and over
SAMPLE_BUDGETS = {
    "Groceries": 8000,
    "Food & Dining": 6000,
    "Transportation": 4500,
    "Shopping": 4000,
    "Bills": 3500,
    "Credit Cards": 16000,
    "Loans & EMI": 11860,
    "Entertainment": 1000,
    "Fuel": 3000,
    "Healthcare": 1500,
}
SAMPLE_SAVINGS_TARGET = 12000  # the SIP alone falls short; months with a top-up meet it


def status() -> dict:
    return {"active": sample_active()}


def _switch(on: bool):
    use_sample(on)
    storage.save_settings({"sample": on})
    load_learned_merchants()


def start() -> dict:
    """Fresh sample data, six months up to today"""
    use_sample(False)
    storage.SAMPLE_DB_PATH.unlink(missing_ok=True)
    use_sample(True)
    init_db()
    mark_migrations_done()

    path = storage.incoming_path("xlsx")
    try:
        write_statement(path, date.today())
        transactions = extract_hdfc_transactions_excel(str(path))
    finally:
        path.unlink(missing_ok=True)
    saved, _ = bulk_insert_transactions(transactions)
    save_budgets(SAMPLE_BUDGETS, SAMPLE_SAVINGS_TARGET)

    _switch(True)
    logger.info(f"Sample data on: {saved} made-up transactions")
    return {"active": True, "count": saved}


def clear() -> dict:
    """Back to the user's own data; the sample database is deleted"""
    _switch(False)
    storage.SAMPLE_DB_PATH.unlink(missing_ok=True)
    logger.info("Sample data cleared")
    return {"active": False}
