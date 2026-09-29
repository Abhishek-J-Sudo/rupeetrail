"""
Statement readers, and picking the right one for an uploaded file

Each reader says which file types it takes, how to recognise its statements and how
to extract them. An upload asks each reader in turn and uses the first that
recognises the file, so a file nobody recognises is refused before anything is saved.

To add a statement type, write its extract function and add a Reader to READERS.

A bank statement is complete for its account and dates, so its reader also says what
it covers (Coverage). A GPay statement isn't: it only has the payments made in GPay.
database.import_statement uses both to keep one row per payment.
"""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Dict, List, Optional

import pandas as pd
import pdfplumber
from pdfminer.pdfdocument import PDFPasswordIncorrect

from .extract import extract_hdfc_transactions
from .extract_excel import extract_hdfc_transactions_excel
from .extract_gpay import extract_gpay_transactions

# How many Excel rows to look through for a table header (HDFC's is on row 21)
EXCEL_SAMPLE_ROWS = 40


NO_TRANSACTIONS = (
    "No transactions found in this statement. Check it covers the months you picked, "
    "and that it's the statement as downloaded from your bank."
)


class UnrecognisedStatement(ValueError):
    """The file isn't a statement RupeeTrail can read; the message is shown to the user"""


@dataclass(frozen=True)
class Coverage:
    """A complete bank statement: every transaction on this account between these dates"""
    account: str    # bank and last 4 digits, the way GPay names accounts: 'HDFC Bank 6722'
    start: str      # YYYY-MM-DD
    end: str


@dataclass(frozen=True)
class Reader:
    source: str                            # short id, stored on each row: 'hdfc', 'gpay'
    label: str                             # shown to the user, e.g. 'HDFC Bank statement'
    file_types: tuple                      # extensions it takes, without the dot
    detect: Callable[[str], bool]          # sample text (squashed, see _squash) -> is it ours?
    extract: Callable[..., List[Dict]]     # (path, progress_callback=None) -> transactions
    # Bank statements only: what the statement covers, from the sample text as read
    coverage: Optional[Callable[[str], Optional[Coverage]]] = None
    # A row's UPI ID, when the reader doesn't set 'upi_id' itself
    upi_id: Optional[Callable[[Dict], Optional[str]]] = None


@dataclass
class Statement:
    reader: Reader
    transactions: List[Dict]
    coverage: Optional[Coverage]


def _looks_like_hdfc(sample: str) -> bool:
    # The table header: "Withdrawal Amt." in Excel, "WithdrawalAmt." in the PDF
    return all(word in sample for word in ('narration', 'withdrawalamt', 'depositamt'))


def _hdfc_coverage(sample: str) -> Optional[Coverage]:
    """
    From the header: "Account No :<number>" and "Statement From : dd/mm/yyyy To : dd/mm/yyyy"
    (the PDF prints "AccountNo :" and "From : ... To : ...")
    """
    account = re.search(r'Account\s*No\s*:\s*(\d{6,})', sample)
    period = re.search(r'From\s*:\s*(\d{2}/\d{2}/\d{4})\s*To\s*:\s*(\d{2}/\d{2}/\d{4})', sample)
    if not (account and period):
        return None
    iso = [datetime.strptime(d, '%d/%m/%Y').strftime('%Y-%m-%d') for d in period.groups()]
    return Coverage(f'HDFC Bank {account.group(1)[-4:]}', iso[0], iso[1])


def _hdfc_upi_id(txn: Dict) -> Optional[str]:
    # For a UPI payment, HDFC's Chq./Ref.No. is the 12-digit UPI ID padded to 16 digits
    ref = (txn.get('ref_no') or '').strip()
    if txn['narration'].startswith('UPI-') and re.fullmatch(r'\d{12,16}', ref):
        return ref[-12:]
    return None


def _looks_like_gpay(sample: str) -> bool:
    # The table header and the line under every payee
    return 'date&timetransactiondetailsamount' in sample and 'upitransactionid:' in sample


READERS = [
    Reader('hdfc', 'HDFC Bank statement', ('pdf',), _looks_like_hdfc, extract_hdfc_transactions,
           coverage=_hdfc_coverage, upi_id=_hdfc_upi_id),
    Reader('hdfc', 'HDFC Bank statement', ('xls', 'xlsx'), _looks_like_hdfc, extract_hdfc_transactions_excel,
           coverage=_hdfc_coverage, upi_id=_hdfc_upi_id),
    Reader('gpay', 'Google Pay statement', ('pdf',), _looks_like_gpay, extract_gpay_transactions),
]

SUPPORTED = 'an HDFC Bank statement (PDF or Excel) or a Google Pay statement (PDF)'


def _squash(text: str) -> str:
    """Lowercase with all whitespace removed, so PDF and Excel spacing compare equal"""
    return re.sub(r'\s+', '', text).lower()


def _sample(path: str, file_type: str) -> str:
    """
    The start of the file as text: the first PDF page, or the first Excel rows

    A PDF page comes twice: laid out by pdfplumber, and as its characters in the order
    the file draws them. Some PDFs (GPay's) only read correctly the second way.
    """
    try:
        if file_type == 'pdf':
            with pdfplumber.open(path) as pdf:
                if not pdf.pages:
                    return ''
                page = pdf.pages[0]
                return (page.extract_text() or '') + '\n' + ''.join(c['text'] for c in page.chars)
        df = pd.read_excel(path, sheet_name=0, header=None, nrows=EXCEL_SAMPLE_ROWS)
        return ' '.join(str(v) for v in df.to_numpy().ravel() if pd.notna(v))
    except PDFPasswordIncorrect:
        raise UnrecognisedStatement(
            "This PDF is password-protected. Download the statement again without a password, "
            "or use the Excel version."
        )
    except Exception as e:
        raise UnrecognisedStatement(f"Couldn't open this file ({e}). Is it a statement downloaded from your bank?")


def _pick(sample: str, file_type: str) -> Reader:
    squashed = _squash(sample)
    for reader in READERS:
        if file_type in reader.file_types and reader.detect(squashed):
            return reader
    raise UnrecognisedStatement(
        f"This doesn't look like a statement RupeeTrail can read. It reads {SUPPORTED}."
    )


def pick_reader(path: str, file_type: str) -> Reader:
    """The reader for this file, or UnrecognisedStatement if none recognises it"""
    return _pick(_sample(path, file_type), file_type)


def read_statement(path: str, file_type: str, progress_callback=None) -> Statement:
    """
    Recognise the file and read it: its transactions, each with 'source' (and 'account'
    and 'upi_id' where known), and what it covers if it's a bank statement

    Raises UnrecognisedStatement if no reader recognises it or it has no transactions.
    """
    sample = _sample(path, file_type)
    reader = _pick(sample, file_type)
    transactions = reader.extract(path, progress_callback)
    if not transactions:
        raise UnrecognisedStatement(NO_TRANSACTIONS)

    coverage = reader.coverage(sample) if reader.coverage else None
    for txn in transactions:
        txn.setdefault('source', reader.source)
        if coverage:
            txn.setdefault('account', coverage.account)
        if reader.upi_id:
            txn.setdefault('upi_id', reader.upi_id(txn))
    return Statement(reader, transactions, coverage)
