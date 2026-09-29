"""
Statement readers, and picking the right one for an uploaded file

Each reader says which file types it takes, how to recognise its statements and how
to extract them. An upload asks each reader in turn and uses the first that
recognises the file, so a file nobody recognises is refused before anything is saved.

To add a statement type, write its extract function and add a Reader to READERS.
"""

import re
from dataclasses import dataclass
from typing import Callable, Dict, List

import pandas as pd
import pdfplumber
from pdfminer.pdfdocument import PDFPasswordIncorrect

from .extract import extract_hdfc_transactions
from .extract_excel import extract_hdfc_transactions_excel
from .extract_gpay import extract_gpay_transactions

# How many Excel rows to look through for a table header (HDFC's is on row 21)
EXCEL_SAMPLE_ROWS = 40


class UnrecognisedStatement(ValueError):
    """The file isn't a statement RupeeTrail can read; the message is shown to the user"""


@dataclass(frozen=True)
class Reader:
    source: str                            # short id, e.g. 'hdfc'
    label: str                             # shown to the user, e.g. 'HDFC Bank statement'
    file_types: tuple                      # extensions it takes, without the dot
    detect: Callable[[str], bool]          # sample text (squashed, see _squash) -> is it ours?
    extract: Callable[..., List[Dict]]     # (path, progress_callback=None) -> transactions


def _looks_like_hdfc(sample: str) -> bool:
    # The table header: "Withdrawal Amt." in Excel, "WithdrawalAmt." in the PDF
    return all(word in sample for word in ('narration', 'withdrawalamt', 'depositamt'))


def _looks_like_gpay(sample: str) -> bool:
    # The table header and the line under every payee
    return 'date&timetransactiondetailsamount' in sample and 'upitransactionid:' in sample


READERS = [
    Reader('hdfc', 'HDFC Bank statement', ('pdf',), _looks_like_hdfc, extract_hdfc_transactions),
    Reader('hdfc', 'HDFC Bank statement', ('xls', 'xlsx'), _looks_like_hdfc, extract_hdfc_transactions_excel),
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


def pick_reader(path: str, file_type: str) -> Reader:
    """The reader for this file, or UnrecognisedStatement if none recognises it"""
    sample = _squash(_sample(path, file_type))
    for reader in READERS:
        if file_type in reader.file_types and reader.detect(sample):
            return reader
    raise UnrecognisedStatement(
        f"This doesn't look like a statement RupeeTrail can read. It reads {SUPPORTED}."
    )
