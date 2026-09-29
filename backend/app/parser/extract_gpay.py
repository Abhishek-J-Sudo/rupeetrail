"""
Google Pay statement reader (PDF)

GPay's "Transaction statement" lists the UPI payments made with the app, whichever
bank account paid. Each transaction is a block of three lines in three columns:

    01 Aug, 2026   Paid to <payee>                          ₹1,500
    10:53 AM       UPI Transaction ID: 123456789012
                   Paid by <Bank> <last 4 digits>

Money in reads "Received from <payer>" ... "Paid to <Bank> <last 4 digits>". Page 1
also prints the period's total Sent and Received, which the rows are checked against.

The PDF's font carries no usable character widths, so pdfplumber's own text layout
scrambles the letters. The characters do come in reading order, and each word
starts at its true position, so words are rebuilt from runs of characters that
follow on from each other (_page_lines).
"""

import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import pdfplumber

from .merchant import extract_merchant_name, detect_transaction_type, is_p2p_transfer, gpay_narration
from ..categorizer.rules import categorize_transaction

logger = logging.getLogger(__name__)

# The table header, and the start of the footer note under each page's table
TABLE_HEADER = 'Date & time Transaction details Amount'
FOOTER_START = 'Note:'

DATE = re.compile(r'^\d{1,2} [A-Z][a-z]{2}, \d{4}$')                 # 01 Aug, 2026
AMOUNT = re.compile(r'^₹([\d,]+(?:\.\d+)?)$')                         # ₹1,500 / ₹534.44
DETAILS = re.compile(
    r'^(Paid to|Received from) (.+?) UPI Transaction ID: (\d+) (?:Paid by|Paid to) (.+)$'
)

# Characters on one line can sit a fraction of a point apart vertically
SAME_LINE = 2.0
# A character continuing the same word starts where the previous one ended
SAME_WORD = 0.05


def extract_gpay_transactions(pdf_path: str, progress_callback=None) -> List[Dict]:
    """
    Extract transactions from a Google Pay statement PDF

    Returns the usual transaction dicts (see docs/adding-a-bank.md), plus:
        'upi_id':  the UPI Transaction ID (also in ref_no)
        'account': the bank account that paid or was paid, e.g. 'HDFC Bank 6722'
        'source':  'gpay'

    Raises:
        FileNotFoundError: If the PDF doesn't exist
        ValueError: If the PDF cannot be parsed
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    transactions = []
    skipped = 0
    totals = None

    try:
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            if progress_callback:
                progress_callback(0, total_pages, 0, "Opening PDF...")

            for page_num, page in enumerate(pdf.pages, 1):
                if progress_callback:
                    progress_callback(page_num, total_pages, len(transactions), f"Scanning page {page_num}/{total_pages}...")

                lines = _page_lines(page)
                if totals is None:
                    totals = _statement_totals(lines)

                for block in _blocks(lines):
                    txn = _parse_block(block)
                    if txn:
                        transactions.append(txn)
                    else:
                        skipped += 1

            if progress_callback:
                progress_callback(total_pages, total_pages, len(transactions), "Processing complete!")

    except Exception as e:
        logger.error(f"Failed to process GPay PDF: {e}")
        raise ValueError(f"Could not parse PDF: {e}")

    if skipped:
        logger.warning(f"Skipped {skipped} GPay rows in a shape this reader doesn't know")
    _check_totals(transactions, totals)

    logger.info(f"Total GPay transactions extracted: {len(transactions)}")
    return transactions


def _page_lines(page) -> List[List[Dict]]:
    """
    The page as lines of words, top to bottom: [[{'x': x0, 'text': word}, ...], ...]

    Words are rebuilt from the characters in the order the PDF draws them: a character
    that starts where the previous one ended continues the word, anything else
    (a jump, a new line, a space) starts a new one.
    """
    lines = []      # [top, words]
    prev = None
    for char in page.chars:
        if char['text'].isspace():
            prev = None
            continue

        line = next((l for l in lines if abs(l[0] - char['top']) <= SAME_LINE), None)
        if line is None:
            line = [char['top'], []]
            lines.append(line)

        words = line[1]
        continues = (
            prev is not None and words
            and abs(prev['top'] - char['top']) <= SAME_LINE
            and abs(char['x0'] - prev['x1']) <= SAME_WORD
        )
        if continues:
            words[-1]['text'] += char['text']
        else:
            words.append({'x': char['x0'], 'text': char['text']})
        prev = char

    return [words for _, words in sorted(lines, key=lambda l: l[0])]


def _text(words: List[Dict]) -> str:
    return ' '.join(w['text'] for w in words)


def _statement_totals(lines: List[List[Dict]]) -> Optional[tuple]:
    """(sent, received) from page 1's summary, or None if this page doesn't have it"""
    for i, words in enumerate(lines[:-1]):
        texts = [w['text'] for w in words]
        if 'Sent' in texts and 'Received' in texts:
            amounts = [_amount(w['text']) for w in lines[i + 1] if AMOUNT.match(w['text'])]
            if len(amounts) == 2:
                return amounts[0], amounts[1]
    return None


def _blocks(lines: List[List[Dict]]) -> List[Dict]:
    """
    The page's transactions as {'when': [...], 'details': [...], 'amount': str}

    Only the table is read: from the line after the header to the footer note, so the
    name, phone number and email printed at the top of each page are never picked up.
    """
    start = next((i + 1 for i, words in enumerate(lines) if _text(words) == TABLE_HEADER), None)
    if start is None:
        return []

    header = lines[start - 1]
    details_x = next(w['x'] for w in header if w['text'] == 'Transaction')
    date_x = details_x - 5   # the date and time column ends before the details column

    blocks = []
    for words in lines[start:]:
        if words and words[0]['text'] == FOOTER_START:
            break

        when = [w['text'] for w in words if w['x'] < date_x]
        rest = [w for w in words if w['x'] >= date_x]
        amount = next((w['text'] for w in rest if AMOUNT.match(w['text'])), None)
        details = [w['text'] for w in rest if not AMOUNT.match(w['text'])]

        if when and DATE.match(' '.join(when)):
            blocks.append({'when': [' '.join(when)], 'details': details, 'amount': amount})
        elif blocks:
            block = blocks[-1]
            block['when'] += [' '.join(when)] if when else []
            block['details'] += details
            block['amount'] = block['amount'] or amount

    return blocks


def _parse_block(block: Dict) -> Optional[Dict]:
    """One transaction dict, or None for a row this reader doesn't recognise"""
    details = ' '.join(block['details'])
    match = DETAILS.match(details)
    date = _parse_date(block['when'][0])
    amount = _amount(block['amount']) if block['amount'] else None

    if not match or not date or not amount:
        logger.warning(f"Unrecognised GPay row on {block['when'][0]}")
        return None

    direction, payee, upi_id, account = match.groups()
    txn_type = 'debit' if direction == 'Paid to' else 'credit'
    narration = gpay_narration(direction, payee, upi_id)
    merchant = extract_merchant_name(narration)
    category = categorize_transaction(
        merchant=merchant,
        narration=narration,
        txn_type=txn_type,
        transaction_type=detect_transaction_type(narration),
        is_p2p=is_p2p_transfer(narration, merchant),
        amount=amount,
    )

    return {
        'date': date,
        'narration': narration,
        'amount': amount,
        'txn_type': txn_type,
        'balance': None,
        'ref_no': upi_id,
        'merchant': merchant,
        'category': category,
        'upi_id': upi_id,
        'account': ' '.join(account.split()),
        'source': 'gpay',
    }


def _parse_date(text: str) -> Optional[str]:
    """'01 Aug, 2026' -> '2026-08-01'"""
    try:
        return datetime.strptime(text, '%d %b, %Y').strftime('%Y-%m-%d')
    except ValueError:
        return None


def _amount(text: str) -> float:
    """'₹1,500' -> 1500.0"""
    return float(AMOUNT.match(text).group(1).replace(',', ''))


def _check_totals(transactions: List[Dict], totals: Optional[tuple]):
    """
    Compare the rows with page 1's Sent and Received

    GPay leaves self transfers out of those totals, so a difference is logged, not
    treated as a failure.
    """
    if totals is None:
        logger.warning("GPay statement totals not found; rows not checked against them")
        return

    sent = round(sum(t['amount'] for t in transactions if t['txn_type'] == 'debit'), 2)
    received = round(sum(t['amount'] for t in transactions if t['txn_type'] == 'credit'), 2)
    if (sent, received) != totals:
        logger.warning(
            f"GPay rows add up to sent {sent}, received {received}; "
            f"the statement says sent {totals[0]}, received {totals[1]}"
        )
