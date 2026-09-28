"""
Excel Extraction Module

Extracts transactions from HDFC bank statement Excel files (.xls, .xlsx)
Much simpler and more reliable than PDF parsing!
"""

import pandas as pd
import logging
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path

from .merchant import extract_merchant_name, detect_transaction_type, is_p2p_transfer
from ..categorizer.rules import categorize_transaction

logger = logging.getLogger(__name__)


def extract_hdfc_transactions_excel(excel_path: str, progress_callback=None) -> List[Dict]:
    """
    Extract transactions from HDFC bank statement Excel file

    Excel Format (HDFC):
    - Row 20: Column headers (Date | Narration | Chq./Ref.No. | Value Dt | Withdrawal Amt. | Deposit Amt. | Closing Balance)
    - Row 21: Separator row with asterisks
    - Row 22+: Transaction data
    - Last rows: Summary and footer

    Args:
        excel_path: Path to Excel file (.xls or .xlsx)
        progress_callback: Optional callback function(page_num, total_pages, transactions_count, stage)

    Returns:
        List of transaction dictionaries:
        [
            {
                'date': 'YYYY-MM-DD',
                'merchant': str,
                'narration': str,
                'amount': float,
                'txn_type': 'debit' | 'credit',
                'balance': float,
                'category': str
            }
        ]

    Raises:
        FileNotFoundError: If Excel file doesn't exist
        ValueError: If Excel cannot be parsed
    """
    excel_path = Path(excel_path)
    if not excel_path.exists():
        raise FileNotFoundError(f"Excel file not found: {excel_path}")

    logger.info(f"Extracting transactions from Excel: {excel_path}")

    try:
        # Report initial stage
        if progress_callback:
            progress_callback(0, 1, 0, "Opening Excel file...")

        # Read Excel file without header (we'll find it ourselves)
        df = pd.read_excel(excel_path, sheet_name=0, header=None)

        logger.info(f"Excel file loaded: {len(df)} rows, {len(df.columns)} columns")

        # Report structure analysis
        if progress_callback:
            progress_callback(0, 1, 0, "Analyzing Excel structure...")

        # Find the header row (contains "Date", "Narration", "Withdrawal", etc.)
        header_row_idx = None
        for i in range(min(25, len(df))):  # Check first 25 rows
            row = df.iloc[i]
            row_text = ' '.join([str(x).lower() for x in row if pd.notna(x)])

            if 'date' in row_text and 'narration' in row_text and 'withdrawal' in row_text:
                header_row_idx = i
                logger.info(f"Found header row at index {i}")
                break

        if header_row_idx is None:
            raise ValueError("Could not find transaction table header in Excel file")

        # Report parsing progress
        if progress_callback:
            progress_callback(0, 1, 0, "Parsing transactions...")

        # Extract column headers from header row
        headers = df.iloc[header_row_idx].tolist()
        logger.debug(f"Headers: {headers}")

        # Map column indices (find which column is which)
        col_map = _map_columns(headers)
        logger.info(f"Column mapping: {col_map}")

        # Extract transaction rows. HDFC's own export puts a row of asterisks under
        # the header; other exports don't, so start right after the header and let
        # _parse_excel_row skip anything whose date doesn't parse.
        transactions = []
        data_start_row = header_row_idx + 1

        for row_idx in range(data_start_row, len(df)):
            row = df.iloc[row_idx]

            # Check if this is end of transactions (footer section or empty row)
            date_val = row.iloc[col_map['date']] if col_map['date'] < len(row) else None

            # Stop if we hit empty date or footer text
            if pd.isna(date_val):
                logger.debug(f"Reached end of transactions at row {row_idx}")
                break

            # HDFC's separator row
            if not str(date_val).strip('* '):
                continue

            # Check for footer markers
            first_col_text = str(row.iloc[0]).lower() if pd.notna(row.iloc[0]) else ''
            if any(marker in first_col_text for marker in ['generated on', 'state account', 'hdfc bank gstin', 'registered office', 'end of statement']):
                logger.debug(f"Reached footer section at row {row_idx}")
                break

            # Parse transaction row
            try:
                txn = _parse_excel_row(row, col_map)
                if txn:
                    transactions.append(txn)

                    # Report progress every 10 transactions
                    if len(transactions) % 10 == 0 and progress_callback:
                        progress_callback(1, 1, len(transactions), f"Extracted {len(transactions)} transactions...")

            except Exception as e:
                logger.warning(f"Failed to parse row {row_idx}: {e}")
                continue

        # Report completion
        if progress_callback:
            progress_callback(1, 1, len(transactions), "Excel parsing complete!")

        logger.info(f"Total transactions extracted from Excel: {len(transactions)}")
        return transactions

    except Exception as e:
        logger.error(f"Failed to process Excel file: {e}")
        raise ValueError(f"Could not parse Excel file: {e}")


def _map_columns(headers: List) -> Dict[str, int]:
    """
    Map column names to their indices

    Args:
        headers: List of column header values

    Returns:
        Dict mapping field names to column indices
    """
    col_map = {
        'date': None,
        'narration': None,
        'ref_no': None,
        'value_date': None,
        'withdrawal': None,
        'deposit': None,
        'balance': None
    }

    for i, header in enumerate(headers):
        if pd.isna(header):
            continue

        header_lower = str(header).lower()

        if 'date' in header_lower and 'value' not in header_lower:
            col_map['date'] = i
        elif 'narration' in header_lower:
            col_map['narration'] = i
        elif 'chq' in header_lower or 'ref' in header_lower:
            col_map['ref_no'] = i
        elif 'value' in header_lower and 'dt' in header_lower:
            col_map['value_date'] = i
        elif 'withdrawal' in header_lower:
            col_map['withdrawal'] = i
        elif 'deposit' in header_lower:
            col_map['deposit'] = i
        elif 'closing' in header_lower or 'balance' in header_lower:
            col_map['balance'] = i

    # Validate that we found all required columns
    missing = [k for k, v in col_map.items() if v is None]
    if missing:
        logger.warning(f"Missing columns in Excel: {missing}")

    return col_map


def _parse_excel_row(row, col_map: Dict[str, int]) -> Optional[Dict]:
    """
    Parse a single Excel row into a transaction

    Args:
        row: Pandas Series (Excel row)
        col_map: Column mapping dict

    Returns:
        Parsed transaction dict or None if invalid
    """
    # Extract raw values
    date_val = row.iloc[col_map['date']] if col_map['date'] is not None else None
    narration_val = row.iloc[col_map['narration']] if col_map['narration'] is not None else ''
    ref_no_val = row.iloc[col_map['ref_no']] if col_map['ref_no'] is not None else ''
    withdrawal_val = row.iloc[col_map['withdrawal']] if col_map['withdrawal'] is not None else None
    deposit_val = row.iloc[col_map['deposit']] if col_map['deposit'] is not None else None
    balance_val = row.iloc[col_map['balance']] if col_map['balance'] is not None else None

    # Parse date
    date = _parse_excel_date(date_val)
    if not date:
        logger.warning(f"Invalid date in row: {date_val}")
        return None

    # Parse amounts
    withdrawal = _parse_excel_amount(withdrawal_val)
    deposit = _parse_excel_amount(deposit_val)
    balance = _parse_excel_amount(balance_val)

    # Determine transaction type and amount
    if withdrawal is not None and withdrawal > 0:
        amount = withdrawal
        txn_type = 'debit'
    elif deposit is not None and deposit > 0:
        amount = deposit
        txn_type = 'credit'
    else:
        logger.warning("No valid amount found in row")
        return None

    # Clean narration
    narration = str(narration_val) if pd.notna(narration_val) else ''
    narration = ' '.join(narration.split())  # Remove extra whitespace

    # Extract merchant name
    merchant = extract_merchant_name(narration)

    # Detect transaction type
    transaction_type = detect_transaction_type(narration)

    # Check if P2P
    is_p2p = is_p2p_transfer(narration, merchant)

    # Categorize
    category = categorize_transaction(
        merchant=merchant,
        narration=narration,
        txn_type=txn_type,
        transaction_type=transaction_type,
        is_p2p=is_p2p,
        amount=amount  # Pass amount for smart heuristics
    )

    # Extract ref_no
    ref_no = str(ref_no_val) if pd.notna(ref_no_val) else ''

    return {
        'date': date,
        'ref_no': ref_no,
        'merchant': merchant,
        'narration': narration,
        'amount': amount,
        'txn_type': txn_type,
        'balance': balance,
        'category': category
    }


def _parse_excel_date(date_val) -> Optional[str]:
    """
    Parse Excel date value to ISO format (YYYY-MM-DD)

    Handles:
    - Excel datetime objects
    - String dates in DD/MM/YY format
    - String dates in DD/MM/YYYY format

    Args:
        date_val: Date value from Excel cell

    Returns:
        ISO format date string or None if invalid
    """
    if pd.isna(date_val):
        return None

    try:
        # If it's already a datetime object (Excel date)
        if isinstance(date_val, datetime):
            return date_val.strftime('%Y-%m-%d')

        # If it's a pandas Timestamp
        if isinstance(date_val, pd.Timestamp):
            return date_val.strftime('%Y-%m-%d')

        # If it's a string, try to parse it
        date_str = str(date_val).strip()

        # Try DD/MM/YY format
        if '/' in date_str:
            parts = date_str.split('/')
            if len(parts) == 3:
                day, month, year = parts

                # Convert 2-digit year to 4-digit (assume 20XX)
                if len(year) == 2:
                    year = f"20{year}"

                # Create datetime object
                dt = datetime(int(year), int(month), int(day))
                return dt.strftime('%Y-%m-%d')

        logger.warning(f"Unrecognized date format: {date_val}")
        return None

    except Exception as e:
        logger.warning(f"Invalid date: {date_val} - {e}")
        return None


def _parse_excel_amount(amount_val) -> Optional[float]:
    """
    Parse Excel amount value to float

    Args:
        amount_val: Amount value from Excel cell

    Returns:
        Float amount or None if empty/invalid
    """
    if pd.isna(amount_val):
        return None

    try:
        # If it's already a number
        if isinstance(amount_val, (int, float)):
            return float(amount_val) if amount_val != 0 else None

        # If it's a string, clean and parse
        amount_str = str(amount_val).strip()
        if not amount_str or amount_str == '':
            return None

        # Remove commas
        clean = amount_str.replace(',', '').strip()

        # Handle negative (rare, but possible)
        if clean.startswith('-') or clean.endswith('-'):
            clean = clean.replace('-', '')
            return -float(clean)

        value = float(clean)
        return value if value != 0 else None

    except ValueError as e:
        logger.warning(f"Could not parse amount: {amount_val} - {e}")
        return None


if __name__ == "__main__":
    import sys

    # Test with an Excel file
    if len(sys.argv) > 1:
        excel_path = sys.argv[1]
        logging.basicConfig(level=logging.DEBUG)

        try:
            transactions = extract_hdfc_transactions_excel(excel_path)

            print(f"\n{'='*80}")
            print(f"Extracted {len(transactions)} transactions from Excel")
            print(f"{'='*80}\n")

            for i, txn in enumerate(transactions[:10], 1):  # Show first 10
                print(f"{i}. {txn['date']} | {txn['merchant']:30} | ₹{txn['amount']:>10.2f} | {txn['category']}")

            if len(transactions) > 10:
                print(f"\n... and {len(transactions) - 10} more transactions")

        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)
    else:
        print("Usage: python -m app.parser.extract_excel <path_to_excel>")
        print("\nExample:")
        print("  python -m app.parser.extract_excel ../data/uploads/statement.xls")
