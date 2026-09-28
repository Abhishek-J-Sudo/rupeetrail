"""
Pydantic Models

Data validation models for API requests/responses
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import date as DateType


class Transaction(BaseModel):
    """Transaction response model"""
    id: int
    ref_no: Optional[str] = None
    date: str
    merchant: str
    narration: str
    amount: float
    txn_type: str  # 'debit' or 'credit'
    balance: Optional[float] = None
    category: str
    is_excluded: int = 0  # 0 = included, 1 = excluded
    is_savings_transfer: int = 0  # 0 = not savings, 1 = savings
    category_source: str = 'rule'  # who set the category: 'rule', 'manual' or 'ai'
    display_name: Optional[str] = None  # clean payee name, when set (payee_names)
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class TransactionUpdate(BaseModel):
    """Transaction update request"""
    merchant: Optional[str] = None
    category: Optional[str] = None


class BulkUpdateRequest(BaseModel):
    """Bulk update request"""
    transaction_ids: list[int]
    category: str


class MerchantAlias(BaseModel):
    """Merchant alias creation request"""
    merchant: str
    alias: str
    category: Optional[str] = None


class UploadResponse(BaseModel):
    """PDF upload response"""
    total: int = Field(..., description="Total transactions found in PDF")
    saved: int = Field(..., description="New transactions saved")
    duplicates: int = Field(..., description="Duplicate transactions skipped")
    message: str = Field(..., description="Success message")


class CategorySummary(BaseModel):
    """Category spending summary"""
    category: str
    total: float
    count: int
    percentage: float


class ErrorResponse(BaseModel):
    """Error response"""
    error: str
    detail: Optional[str] = None
