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
    """Statement upload response (counts from database.import_statement)"""
    total: int = Field(..., description="Transactions found in the statement")
    saved: int = Field(..., description="New transactions saved")
    duplicates: int = Field(..., description="Already imported, skipped")
    replaced: int = Field(0, description="GPay rows replaced by this bank statement's rows")
    removed: int = Field(0, description="GPay rows this bank statement doesn't have, removed")
    in_bank_statement: int = Field(0, description="GPay payments already in a bank statement, skipped")
    not_in_bank_statement: int = Field(0, description="GPay payments on dates a bank statement covers but doesn't have, skipped")
    source: str = Field('', description="Which reader read it: 'hdfc', 'gpay'")
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
