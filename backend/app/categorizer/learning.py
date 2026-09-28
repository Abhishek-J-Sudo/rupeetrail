"""
Merchant Learning System

Learns from user corrections to improve future categorization accuracy.
"""

import logging
import sqlite3
from typing import Optional, Dict
from ..database import get_connection

logger = logging.getLogger(__name__)

# In-memory cache for learned merchants (loaded on startup)
_learned_merchants_cache = {}
# merchant (lowercase) -> who taught it: 'manual' or 'ai'
_learned_sources = {}


def load_learned_merchants():
    """
    Load all learned merchant categorizations from database into memory

    This is called on startup and after each new learning event.
    """
    global _learned_merchants_cache, _learned_sources

    conn = get_connection()
    cursor = conn.cursor()

    # Get all merchants with learned categories. On a first run this module is imported
    # before init_db() has created the table, and there is nothing learned yet.
    # The source column is added by init_db(), which may not have run yet either.
    try:
        rows = cursor.execute("""
            SELECT merchant, category, source
            FROM merchant_aliases
            WHERE category IS NOT NULL
        """).fetchall()
    except sqlite3.OperationalError:
        try:
            rows = cursor.execute("""
                SELECT merchant, category, 'manual' AS source
                FROM merchant_aliases
                WHERE category IS NOT NULL
            """).fetchall()
        except sqlite3.OperationalError:
            rows = []
    finally:
        conn.close()

    # Build cache: merchant (lowercase) -> category
    _learned_merchants_cache = {
        row['merchant'].lower(): row['category']
        for row in rows
    }
    _learned_sources = {row['merchant'].lower(): row['source'] for row in rows}

    logger.info(f"Loaded {len(_learned_merchants_cache)} learned merchants into cache")
    return _learned_merchants_cache


def get_learned_category(merchant: str) -> Optional[str]:
    """
    Check if we have learned a category for this merchant

    Args:
        merchant: Merchant name (will be lowercased)

    Returns:
        Learned category or None
    """
    merchant_lower = merchant.lower()
    return _learned_merchants_cache.get(merchant_lower)


def get_learned_source(merchant: str, category: str) -> Optional[str]:
    """Who taught this merchant ('manual' or 'ai'), if category is the one it learned"""
    merchant_lower = merchant.lower()
    if _learned_merchants_cache.get(merchant_lower) != category:
        return None
    return _learned_sources.get(merchant_lower, 'manual')


def taught_by_user(merchant: str) -> bool:
    """True if the user taught this merchant a category (the AI review leaves those alone)"""
    merchant_lower = merchant.lower()
    return merchant_lower in _learned_merchants_cache and _learned_sources.get(merchant_lower) == 'manual'


def learn_merchant_category(merchant: str, category: str, source: str = 'manual') -> bool:
    """
    Learn/remember that this merchant should be categorized as this category

    This is called when a user manually corrects a transaction category.
    Future transactions from this merchant will automatically use this category.

    Args:
        merchant: Merchant name
        category: Correct category for this merchant
        source: Who taught it, 'manual' (the user) or 'ai' (payee review)

    Returns:
        True if learning was successful
    """
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Store in database (UPSERT - update if exists, insert if not)
        cursor.execute("""
            INSERT INTO merchant_aliases (merchant, alias, category, source)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(merchant) DO UPDATE SET
                category = excluded.category,
                source = excluded.source,
                created_at = CURRENT_TIMESTAMP
        """, (merchant, merchant, category, source))  # Use merchant as its own alias

        conn.commit()

        # Update in-memory cache
        _learned_merchants_cache[merchant.lower()] = category
        _learned_sources[merchant.lower()] = source

        logger.info(f"✓ Learned: '{merchant}' → '{category}'")
        return True

    except Exception as e:
        conn.rollback()
        logger.error(f"Failed to learn merchant category: {e}")
        return False
    finally:
        conn.close()


def get_learning_stats() -> Dict:
    """
    Get statistics about learned merchants

    Returns:
        Dictionary with learning statistics
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Count learned merchants
    cursor.execute("""
        SELECT COUNT(*) as total
        FROM merchant_aliases
        WHERE category IS NOT NULL
    """)
    total = cursor.fetchone()['total']

    # Count by category
    cursor.execute("""
        SELECT category, COUNT(*) as count
        FROM merchant_aliases
        WHERE category IS NOT NULL
        GROUP BY category
        ORDER BY count DESC
    """)
    by_category = [dict(row) for row in cursor.fetchall()]

    # Get recent learnings (last 10)
    cursor.execute("""
        SELECT merchant, category, created_at
        FROM merchant_aliases
        WHERE category IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 10
    """)
    recent = [dict(row) for row in cursor.fetchall()]

    conn.close()

    return {
        'total_learned': total,
        'by_category': by_category,
        'recent': recent,
        'cache_size': len(_learned_merchants_cache)
    }


def clear_learned_merchant(merchant: str) -> bool:
    """
    Remove learned category for a merchant (useful for corrections)

    Args:
        merchant: Merchant name

    Returns:
        True if removed
    """
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            DELETE FROM merchant_aliases
            WHERE merchant = ?
        """, (merchant,))

        conn.commit()

        # Remove from cache
        merchant_lower = merchant.lower()
        if merchant_lower in _learned_merchants_cache:
            del _learned_merchants_cache[merchant_lower]
        _learned_sources.pop(merchant_lower, None)

        logger.info(f"✗ Unlearned: '{merchant}'")
        return True

    except Exception as e:
        conn.rollback()
        logger.error(f"Failed to clear learned merchant: {e}")
        return False
    finally:
        conn.close()


# Initialize cache on module import
load_learned_merchants()
