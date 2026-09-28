"""
PDF Extraction Module

Extracts transactions from HDFC bank statement PDFs
Handles multi-line narration and table structure
"""

import pdfplumber
import re
import logging
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path

from .merchant import extract_merchant_name, detect_transaction_type, is_p2p_transfer
from ..categorizer.rules import categorize_transaction

logger = logging.getLogger(__name__)


def extract_hdfc_transactions(pdf_path: str, progress_callback=None) -> List[Dict]:
    """
    Extract transactions from HDFC bank statement PDF

    Process:
    1. Extract table from PDF using pdfplumber
    2. Merge multi-line narration rows
    3. Parse each transaction (date, amount, type, etc.)
    4. Extract merchant names
    5. Categorize transactions

    Args:
        pdf_path: Path to PDF file
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
        FileNotFoundError: If PDF doesn't exist
        ValueError: If PDF cannot be parsed
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    logger.info(f"Extracting transactions from: {pdf_path}")

    transactions = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)

            # Report initial stage
            if progress_callback:
                progress_callback(0, total_pages, 0, "Opening PDF...")

            # Find Deposit column boundaries ONCE from first page (same X coords for all pages)
            deposit_bounds = None
            if total_pages > 0:
                if progress_callback:
                    progress_callback(0, total_pages, 0, "Analyzing PDF structure...")

                deposit_bounds = _find_deposit_column_bounds(pdf.pages[0])
                if deposit_bounds:
                    logger.info(f"Deposit column found at X: {deposit_bounds[0]:.2f} - {deposit_bounds[1]:.2f}")
                else:
                    logger.warning("Could not find Deposit column - all transactions will be marked as debits")

            for page_num, page in enumerate(pdf.pages, 1):
                logger.debug(f"Processing page {page_num}")

                # Report page scanning progress
                if progress_callback:
                    progress_callback(page_num, total_pages, len(transactions), f"Scanning page {page_num}/{total_pages}...")

                # Try text-line extraction first (new method - handles multi-line narrations correctly)
                # Table extraction is DISABLED because it doesn't handle page boundary continuations properly
                try:
                    page_transactions = _extract_from_text_lines(page, deposit_bounds)
                    if page_transactions and len(page_transactions) > 0:
                        transactions.extend(page_transactions)
                        logger.debug(f"Extracted {len(page_transactions)} transactions from text lines on page {page_num}")

                        # Report transaction detection progress
                        if progress_callback:
                            progress_callback(page_num, total_pages, len(transactions), f"Found {len(transactions)} transactions...")
                    else:
                        # No transactions found
                        logger.debug(f"No transactions found on page {page_num}")
                except Exception as e:
                    logger.warning(f"Text line extraction failed on page {page_num}: {e}")
                    # NOTE: Table extraction fallback is disabled - it doesn't handle continuation lines across pages
                    # If text line extraction fails, we skip the page rather than using buggy table extraction

            # Report completion
            if progress_callback:
                progress_callback(total_pages, total_pages, len(transactions), "Processing complete!")

        logger.info(f"Total transactions extracted: {len(transactions)}")
        return transactions

    except Exception as e:
        logger.error(f"Failed to process PDF: {e}")
        raise ValueError(f"Could not parse PDF: {e}")


def _find_deposit_column_bounds(page) -> Optional[tuple]:
    """
    Find the X-coordinate boundaries of the Deposit Amount column

    Args:
        page: pdfplumber page object

    Returns:
        Tuple of (x0, x1) for Deposit column, or None if not found
    """
    try:
        words = page.extract_words()

        # Look for "DepositAmt." text anywhere on the page (not just header)
        for word in words:
            # Look for "Deposit" and "Amt" in the same word
            if 'deposit' in word['text'].lower() and 'amt' in word['text'].lower():
                # Found "DepositAmt." - use its X boundaries
                x0 = word['x0']
                x1 = word['x1']
                logger.debug(f"Found Deposit column: x0={x0}, x1={x1}")
                return (x0, x1)

        # Alternative: Look for just "Deposit" word
        for word in words:
            if 'deposit' in word['text'].lower():
                # Use the word's boundaries with margin
                x0 = word['x0']
                x1 = word['x1'] + 50  # Add margin for column width
                logger.debug(f"Found Deposit column (approximated): x0={x0}, x1={x1}")
                return (x0, x1)

        logger.warning("Could not find Deposit column boundaries")
        return None

    except Exception as e:
        logger.warning(f"Error finding deposit column bounds: {e}")
        return None


def _has_deposit_at_y_position(page, y_position: float, deposit_bounds: tuple, tolerance: float = 5.0) -> bool:
    """
    Check if there's text in the Deposit column at a specific Y position

    Args:
        page: pdfplumber page object
        y_position: Y coordinate to check (from text line)
        deposit_bounds: Tuple of (x0, x1) for Deposit column
        tolerance: Y-coordinate tolerance in points

    Returns:
        True if deposit text exists at this Y position
    """
    if not deposit_bounds:
        return False

    x0, x1 = deposit_bounds

    try:
        words = page.extract_words()

        for word in words:
            # Check if word is in Deposit column X range
            word_in_x_range = (x0 <= word['x0'] <= x1) or (x0 <= word['x1'] <= x1)

            # Check if word is at the same Y position (within tolerance)
            word_in_y_range = abs(word['top'] - y_position) <= tolerance

            if word_in_x_range and word_in_y_range:
                # Check if it's actually a number (deposit amount)
                text = word['text'].replace(',', '').replace('.', '')
                if text.replace('-', '').isdigit():
                    logger.debug(f"Deposit found at Y={y_position}: {word['text']}")
                    return True

        return False

    except Exception as e:
        logger.warning(f"Error checking deposit at Y position: {e}")
        return False


def _extract_from_text_lines(page, deposit_bounds: Optional[tuple] = None) -> List[Dict]:
    """
    Extract transactions using text line positions (Y-coordinates)

    This method extracts text line-by-line and identifies continuation lines
    based on whether they start with a date or not.

    Uses X-Y coordinate detection to identify credit/debit transactions:
    - Uses provided Deposit column X-coordinates (same across all pages)
    - Checks if each transaction line has text in Deposit column

    Args:
        page: pdfplumber page object
        deposit_bounds: Optional tuple of (x0, x1) for Deposit column

    Returns:
        List of transactions
    """
    # Use provided deposit bounds (or find them if not provided)
    if not deposit_bounds:
        deposit_bounds = _find_deposit_column_bounds(page)

    if deposit_bounds:
        logger.debug(f"Using Deposit column bounds: {deposit_bounds}")
    else:
        logger.warning("Could not find Deposit column - all transactions will be marked as debits")

    # Extract text lines
    text_lines = page.extract_text_lines()

    if not text_lines:
        return []

    # Find table header (only on first page - subsequent pages don't have headers)
    header_idx = None
    for i, line_obj in enumerate(text_lines):
        text = line_obj.get('text', '')
        if 'Date' in text and 'Narration' in text and 'Ref' in text:
            header_idx = i
            logger.debug(f"Found table header at line {i}")
            break

    if header_idx is None:
        # No header found - this is likely page 2+, start from beginning
        logger.debug("No table header found (likely continuation page), processing from start")
        header_idx = -1  # Will start from index 0 when we do header_idx + 1

    # Process lines after header (or from start if no header)
    transactions_raw = []
    current_txn = None

    # Date pattern: DD/MM/YY at start of line
    date_pattern = re.compile(r'^(\d{2}/\d{2}/\d{2})\s+')

    # Flag to track if we've found the first valid transaction on this page
    # This helps skip continuation lines from previous page
    found_first_transaction = False
    skipped_lines = 0

    for line_obj in text_lines[header_idx + 1:]:
        text = line_obj.get('text', '').strip()

        if not text:
            continue

        # Check if line starts with a date
        date_match = date_pattern.match(text)

        if date_match:
            # Save previous transaction if exists
            if current_txn:
                transactions_raw.append(current_txn)

            # Start new transaction
            # Parse the line: DD/MM/YY NARRATION REF_NO DD/MM/YY AMOUNT BALANCE
            current_txn = _parse_text_line(text)

            # Store Y-coordinate for deposit column check
            current_txn['_y_position'] = line_obj.get('top', 0)

            found_first_transaction = True

        else:
            # Continuation line - append to current transaction's narration
            # BUT only if we've already found the first transaction on this page
            # This skips continuation lines from the previous page
            if current_txn and found_first_transaction:
                current_txn['narration'] += ' ' + text
            elif not found_first_transaction:
                # Skip this line (it's a continuation from previous page)
                skipped_lines += 1
                logger.debug(f"Skipping continuation line from previous page: {text[:60]}...")

    # Don't forget last transaction
    if current_txn:
        transactions_raw.append(current_txn)

    if skipped_lines > 0:
        logger.debug(f"Skipped {skipped_lines} continuation lines from previous page")
    logger.debug(f"Extracted {len(transactions_raw)} transactions from text lines")

    # Step 3: Check deposit column for each transaction and adjust withdrawal/deposit fields
    for raw in transactions_raw:
        y_pos = raw.get('_y_position', 0)

        # Check if this transaction has a deposit amount
        if deposit_bounds and _has_deposit_at_y_position(page, y_pos, deposit_bounds):
            # This is a credit transaction - swap withdrawal to deposit
            raw['deposit'] = raw['withdrawal']
            raw['withdrawal'] = ''
            logger.debug(f"Transaction at Y={y_pos} identified as CREDIT")
        else:
            # This is a debit transaction - keep as is (withdrawal already set)
            logger.debug(f"Transaction at Y={y_pos} identified as DEBIT")

        # Remove temporary Y position field
        raw.pop('_y_position', None)

    # Parse each transaction
    transactions = []
    for raw in transactions_raw:
        try:
            txn = _parse_transaction_row(raw)
            if txn:
                transactions.append(txn)
        except Exception as e:
            logger.warning(f"Failed to parse transaction: {e}")
            continue

    return transactions


def _parse_text_line(line: str) -> Dict:
    """
    Parse a single text line into transaction fields

    Format: DD/MM/YY NARRATION REF_NO DD/MM/YY AMOUNT BALANCE
    Example: "01/01/25 UPI-MCDONALDS-MCDONALDS.41173767@HDFCBA 0000500100000001 01/01/25 795.99 72,236.64"

    Args:
        line: Text line from PDF

    Returns:
        Dict with transaction fields
    """
    parts = line.split()

    if len(parts) < 4:
        raise ValueError(f"Insufficient parts in line: {line}")

    # First part is date
    date = parts[0]

    # Last part is balance (may have comma)
    balance = parts[-1]

    # Second-to-last part is amount
    amount = parts[-2]

    # Third-to-last part is value date
    value_date = parts[-3]

    # Fourth-to-last part is reference number (16 digits)
    ref_no = parts[-4]

    # Everything between date and ref_no is narration
    narration_parts = parts[1:-4]
    narration = ' '.join(narration_parts)

    # Determine if withdrawal or deposit based on amount
    # We'll check later by looking at balance change
    withdrawal = ''
    deposit = ''

    # For now, assume withdrawal (most common)
    withdrawal = amount

    return {
        'date': date,
        'narration': narration,
        'ref_no': ref_no,
        'value_date': value_date,
        'withdrawal': withdrawal,
        'deposit': deposit,
        'balance': balance
    }


def _extract_from_table(page) -> List[Dict]:
    """
    Extract transactions using table extraction

    Args:
        page: pdfplumber page object

    Returns:
        List of transactions
    """
    # Find all tables on the page
    tables_found = page.find_tables()

    if not tables_found:
        raise ValueError("No tables found on page")

    logger.debug(f"Found {len(tables_found)} tables on page")

    # If multiple tables, select the largest one (transaction table)
    # Transaction table will be bigger than address box
    selected_table = None
    if len(tables_found) > 1:
        # Calculate area of each table and select largest
        largest_area = 0
        for table_obj in tables_found:
            bbox = table_obj.bbox
            area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])  # width * height
            logger.debug(f"Table bbox: {bbox}, area: {area}")
            if area > largest_area:
                largest_area = area
                selected_table = table_obj
        logger.debug(f"Selected largest table with area: {largest_area}")
    else:
        selected_table = tables_found[0]

    # Extract the selected table
    table = selected_table.extract()

    if not table or len(table) < 1:
        raise ValueError("Selected table is empty")

    # Validate table structure - must have 7 columns (Date, Narration, Ref, ValueDt, Withdrawal, Deposit, Balance)
    # Check first data row (skip header if present)
    check_row = table[0] if table else None
    if check_row and 'date' in str(check_row[0]).lower() and 'narration' in str(check_row[1]).lower():
        # Header row, check second row
        check_row = table[1] if len(table) > 1 else None

    if not check_row or len(check_row) < 7:
        raise ValueError(f"Invalid table structure: expected 7 columns, found {len(check_row) if check_row else 0}")

    # Validate Ref No column (column 2) contains 16-digit transaction numbers
    ref_col = str(check_row[2]) if len(check_row) > 2 else ""
    # Look for 16-digit numbers (format: 0000XXXXXXXXXXXXXXXX)
    import re
    has_ref_numbers = bool(re.search(r'\d{16}', ref_col))

    if not has_ref_numbers:
        raise ValueError(f"Table doesn't contain transaction data (no 16-digit ref numbers found in column 2)")

    # Merge multi-line rows
    transactions_raw = _merge_multiline_rows(table)

    # Parse each transaction
    transactions = []
    for raw in transactions_raw:
        try:
            txn = _parse_transaction_row(raw)
            if txn:
                transactions.append(txn)
        except Exception as e:
            logger.warning(f"Failed to parse transaction row: {e}")
            continue

    return transactions


def _merge_narrations_by_count(narration_lines: List[str], num_txns: int) -> List[str]:
    """
    Merge multi-line narrations to match the number of transactions

    Strategy: Evenly distribute narration lines across transactions
    If we have 6 narration lines and 4 transactions, we merge them as:
    - Lines 0-1 → Transaction 0
    - Lines 2-3 → Transaction 1
    - Line 4 → Transaction 2
    - Line 5 → Transaction 3

    Args:
        narration_lines: List of narration lines (may include continuation lines)
        num_txns: Number of actual transactions (from date count)

    Returns:
        List of merged narrations (length = num_txns)
    """
    if len(narration_lines) == num_txns:
        return narration_lines

    if len(narration_lines) < num_txns:
        # Pad with empty strings
        return narration_lines + [''] * (num_txns - len(narration_lines))

    # We have more narration lines than transactions
    # Calculate how many lines per transaction
    lines_per_txn = len(narration_lines) / num_txns

    merged = []
    current_line_idx = 0

    for txn_idx in range(num_txns):
        # Calculate which lines belong to this transaction
        start_idx = int(txn_idx * lines_per_txn)
        end_idx = int((txn_idx + 1) * lines_per_txn)

        # Combine all lines for this transaction
        txn_narration_parts = narration_lines[start_idx:end_idx]
        merged_narration = ' '.join(txn_narration_parts)
        merged.append(merged_narration)

    return merged


def _merge_multiline_rows(table: List[List[str]]) -> List[Dict]:
    """
    Merge continuation rows into single transactions

    HDFC format (COMPACT):
    - Each row contains MULTIPLE transactions with newlines separating values in each column
    - Example: Date column has "01/01/25\n02/01/25\n03/01/25"
    - Need to split by newlines and align across columns

    Args:
        table: List of table rows

    Returns:
        List of merged transaction dictionaries
    """
    transactions = []

    # Detect if first row is a header (contains words like "Date", "Narration", etc.)
    start_row = 0
    if table and len(table) > 0:
        first_row_text = ' '.join([str(cell).lower() for cell in table[0] if cell])
        if 'date' in first_row_text and 'narration' in first_row_text:
            start_row = 1  # Skip header row
            logger.debug("Detected header row, starting from row 1")

    # Process rows starting from start_row
    for row_idx, row in enumerate(table[start_row:], start=start_row):
        # Check if row has enough columns
        if not row or len(row) < 7:
            logger.debug(f"Skipping row {row_idx}: insufficient columns ({len(row) if row else 0})")
            continue

        logger.debug(f"Processing row {row_idx} with {len(row)} columns")

        # DEBUG: Show raw column data BEFORE splitting
        logger.debug(f"Row {row_idx}: RAW row[0] (Date column) = {repr(row[0])}")
        logger.debug(f"Row {row_idx}: RAW row[1] (Narration column) = {repr(row[1][:200] if row[1] else '')}")
        logger.debug(f"Row {row_idx}: RAW row[2] (Ref No column) = {repr(row[2][:200] if row[2] else '')}")

        # NEW APPROACH: Split by newlines but PRESERVE blank positions
        # This allows us to know which narration lines are continuations (blank date)
        dates_raw = [d.strip() for d in str(row[0] or '').split('\n')]
        narrations_raw = [n.strip() for n in str(row[1] or '').split('\n')]
        ref_nos_raw = [r.strip() for r in str(row[2] or '').split('\n')]
        value_dates_raw = [v.strip() for v in str(row[3] or '').split('\n')]
        withdrawals_raw = [w.strip() for w in str(row[4] or '').split('\n')]
        deposits_raw = [d.strip() for d in str(row[5] or '').split('\n')]
        balances_raw = [b.strip() for b in str(row[6] or '').split('\n')]

        logger.debug(f"Row {row_idx}: {len(dates_raw)} date slots, {len(narrations_raw)} narration lines")
        logger.debug(f"Row {row_idx}: dates_raw = {dates_raw}")
        logger.debug(f"Row {row_idx}: narrations_raw (first 3) = {narrations_raw[:3]}")

        # Use reference numbers as transaction anchors
        # Reference numbers are unique per transaction (15 ref_nos = 15 transactions)
        # Narrations need to be distributed across these transactions

        # Filter out empty ref numbers
        ref_nos_filtered = [r for r in ref_nos_raw if r]
        num_transactions = len(ref_nos_filtered)

        logger.debug(f"Row {row_idx}: Found {num_transactions} transactions based on ref numbers")

        # For now, just create transactions based on ref_nos count
        # Each transaction gets corresponding date, ref_no, withdrawal/deposit, balance
        for i in range(num_transactions):
            date = dates_raw[i] if i < len(dates_raw) else ''
            ref_no = ref_nos_filtered[i]
            value_date = value_dates_raw[i] if i < len(value_dates_raw) else ''
            withdrawal = withdrawals_raw[i] if i < len(withdrawals_raw) else ''
            deposit = deposits_raw[i] if i < len(deposits_raw) else ''
            balance = balances_raw[i] if i < len(balances_raw) else ''

            # For narration: temporarily just take the i-th narration line
            # (This is NOT the final solution, but keeps ref_no as anchor)
            narration = narrations_raw[i] if i < len(narrations_raw) else ''

            txn = {
                'date': date,
                'narration': narration,
                'ref_no': ref_no,
                'value_date': value_date,
                'withdrawal': withdrawal,
                'deposit': deposit,
                'balance': balance
            }
            transactions.append(txn)

        logger.debug(f"Row {row_idx}: Created {num_transactions} transactions")

    logger.debug(f"Merged {len(transactions)} total transactions from table")
    return transactions


def _remove_disclaimer_text(narration: str) -> str:
    """
    Remove disclaimer/footer text that gets appended to last transaction on each page

    Common disclaimer patterns in HDFC statements:
    - "*Closingbalanceincludesfundsearmarkedforholdandunclearedfunds"
    - "Contentsofthisstatementwillbeconsideredcorrect..."
    - "StateaccountbranchGSTN:..."
    - "HDFCBankGSTINnumberdetails..."
    - "RegisteredOfficeAddress:HDFCBankHouse..."

    Args:
        narration: Transaction narration text

    Returns:
        Cleaned narration without disclaimer text
    """
    # Define disclaimer markers (start of disclaimer text)
    disclaimer_markers = [
        '*Closing',
        'Closingbalance',
        'Contentsofthisstatement',
        'StateaccountbranchGSTN',
        'HDFCBankGSTIN',
        'RegisteredOfficeAddress',
        '*Contents',
        'TheaddressonthisstatementisthatonrecordwiththeBank',
        'https://www.hdfcbank.com'
    ]

    # Find the earliest disclaimer marker
    earliest_pos = len(narration)
    for marker in disclaimer_markers:
        pos = narration.find(marker)
        if pos != -1 and pos < earliest_pos:
            earliest_pos = pos

    # If found, truncate at that position
    if earliest_pos < len(narration):
        cleaned = narration[:earliest_pos].strip()
        logger.debug(f"Removed disclaimer text from narration (was {len(narration)} chars, now {len(cleaned)} chars)")
        return cleaned

    return narration


def _parse_transaction_row(raw: Dict) -> Optional[Dict]:
    """
    Parse a single transaction row into structured data

    Args:
        raw: Raw transaction dict from table

    Returns:
        Parsed transaction dict or None if invalid
    """
    # Parse date
    date = _parse_date(raw['date'])
    if not date:
        logger.warning(f"Invalid date: {raw['date']}")
        return None

    # Parse amounts
    withdrawal = _parse_amount(raw['withdrawal'])
    deposit = _parse_amount(raw['deposit'])
    balance = _parse_amount(raw['balance'])

    # Determine transaction type and amount
    if withdrawal is not None:
        amount = withdrawal
        txn_type = 'debit'
    elif deposit is not None:
        amount = deposit
        txn_type = 'credit'
    else:
        logger.warning("No amount found in transaction")
        return None

    # Clean narration
    narration = ' '.join(raw['narration'].split())  # Remove extra whitespace
    narration = _remove_disclaimer_text(narration)  # Remove footer/disclaimer text

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

    return {
        'date': date,
        'ref_no': raw.get('ref_no', ''),
        'merchant': merchant,
        'narration': narration,
        'amount': amount,
        'txn_type': txn_type,
        'balance': balance,
        'category': category
    }


def _parse_date(date_str: str) -> Optional[str]:
    """
    Parse HDFC date format (DD/MM/YY) to ISO format (YYYY-MM-DD)

    Args:
        date_str: Date string (e.g., "01/01/25")

    Returns:
        ISO format date string or None if invalid
    """
    if not date_str:
        return None

    try:
        # Try DD/MM/YY format
        match = re.match(r'(\d{2})/(\d{2})/(\d{2})', date_str)
        if match:
            day, month, year = match.groups()

            # Convert 2-digit year to 4-digit (assume 20XX)
            year_full = f"20{year}"

            # Create datetime object
            dt = datetime(int(year_full), int(month), int(day))

            return dt.strftime('%Y-%m-%d')

        # Try DD/MM/YYYY format (less common)
        match = re.match(r'(\d{2})/(\d{2})/(\d{4})', date_str)
        if match:
            day, month, year = match.groups()
            dt = datetime(int(year), int(month), int(day))
            return dt.strftime('%Y-%m-%d')

        logger.warning(f"Unrecognized date format: {date_str}")
        return None

    except ValueError as e:
        logger.warning(f"Invalid date: {date_str} - {e}")
        return None


def _parse_amount(amount_str: str) -> Optional[float]:
    """
    Parse amount string to float

    Handles:
    - Comma-separated thousands (e.g., "3,034.00")
    - Empty strings (None)
    - Negative amounts

    Args:
        amount_str: Amount string

    Returns:
        Float amount or None if empty
    """
    if not amount_str or not amount_str.strip():
        return None

    try:
        # Remove commas
        clean = amount_str.replace(',', '').strip()

        # Handle negative (rare, but possible)
        if clean.startswith('-') or clean.endswith('-'):
            clean = clean.replace('-', '')
            return -float(clean)

        return float(clean)

    except ValueError as e:
        logger.warning(f"Could not parse amount: {amount_str} - {e}")
        return None


def _extract_from_text(page) -> List[Dict]:
    """
    Fallback: Extract transactions from raw text (when table extraction fails)

    This is more fragile but can handle edge cases

    Args:
        page: pdfplumber page object

    Returns:
        List of transactions
    """
    text = page.extract_text()
    if not text:
        return []

    lines = text.split('\n')
    transactions = []
    current_txn = None

    for line in lines:
        # Check if line starts with date pattern
        if re.match(r'^\d{2}/\d{2}/\d{2}', line):
            # Save previous transaction
            if current_txn:
                try:
                    txn = _parse_text_transaction(current_txn)
                    if txn:
                        transactions.append(txn)
                except Exception as e:
                    logger.warning(f"Failed to parse text transaction: {e}")

            # Start new transaction
            current_txn = line
        elif current_txn:
            # Continuation line
            current_txn += ' ' + line.strip()

    # Don't forget last transaction
    if current_txn:
        try:
            txn = _parse_text_transaction(current_txn)
            if txn:
                transactions.append(txn)
        except Exception as e:
            logger.warning(f"Failed to parse text transaction: {e}")

    return transactions


def _parse_text_transaction(text: str) -> Optional[Dict]:
    """
    Parse transaction from raw text line

    Pattern (approximate):
    DD/MM/YY NARRATION REF_NO DD/MM/YY AMOUNT AMOUNT BALANCE

    Args:
        text: Transaction text

    Returns:
        Parsed transaction or None
    """
    # This is a simplified version - actual parsing would need to be more robust
    # For now, we'll rely primarily on table extraction

    # Try to extract date, narration, and amounts
    match = re.match(
        r'(\d{2}/\d{2}/\d{2})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$',
        text
    )

    if match:
        date_str, narration, amount_str, balance_str = match.groups()

        date = _parse_date(date_str)
        amount = _parse_amount(amount_str)
        balance = _parse_amount(balance_str)

        if date and amount:
            narration_clean = ' '.join(narration.split())
            merchant = extract_merchant_name(narration_clean)
            transaction_type = detect_transaction_type(narration_clean)
            is_p2p = is_p2p_transfer(narration_clean, merchant)

            category = categorize_transaction(
                merchant=merchant,
                narration=narration_clean,
                txn_type='debit',  # Assumption
                transaction_type=transaction_type,
                is_p2p=is_p2p,
                amount=amount  # Pass amount for smart heuristics
            )

            return {
                'date': date,
                'merchant': merchant,
                'narration': narration_clean,
                'amount': amount,
                'txn_type': 'debit',
                'balance': balance,
                'category': category
            }

    return None


if __name__ == "__main__":
    import sys

    # Test with a PDF file
    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
        logging.basicConfig(level=logging.DEBUG)

        try:
            transactions = extract_hdfc_transactions(pdf_path)

            print(f"\n{'='*80}")
            print(f"Extracted {len(transactions)} transactions")
            print(f"{'='*80}\n")

            for i, txn in enumerate(transactions[:10], 1):  # Show first 10
                print(f"{i}. {txn['date']} | {txn['merchant']:30} | ₹{txn['amount']:>10.2f} | {txn['category']}")

            if len(transactions) > 10:
                print(f"\n... and {len(transactions) - 10} more transactions")

        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)
    else:
        print("Usage: python -m app.parser.extract <path_to_pdf>")
        print("\nExample:")
        print("  python -m app.parser.extract ../data/uploads/statement.pdf")

