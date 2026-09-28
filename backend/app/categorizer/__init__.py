"""
Categorization Module

Rule-based categorization with smart learning from user corrections
"""

from .rules import categorize_transaction, CATEGORY_RULES
from .learning import (
    get_learned_category,
    learn_merchant_category,
    get_learning_stats,
    load_learned_merchants,
    clear_learned_merchant
)

__all__ = [
    "categorize_transaction",
    "CATEGORY_RULES",
    "get_learned_category",
    "learn_merchant_category",
    "get_learning_stats",
    "load_learned_merchants",
    "clear_learned_merchant"
]
