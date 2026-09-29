"""Picking the reader for an upload, against made-up files built on the fly."""

import io
import warnings

import openpyxl
import pytest
from pypdf import PdfReader, PdfWriter

from app.parser.readers import pick_reader, UnrecognisedStatement
from fakes import text_pdf

# The table header as each HDFC format prints it
HDFC_EXCEL_HEADER = ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance']
HDFC_PDF_HEADER = 'Date Narration Chq./Ref.No. ValueDt WithdrawalAmt. DepositAmt. ClosingBalance'


def _xlsx(tmp_path, rows):
    wb = openpyxl.Workbook()
    for row in rows:
        wb.active.append(row)
    path = tmp_path / 'statement.xlsx'
    wb.save(path)
    return str(path)


def _pdf(tmp_path, lines):
    path = tmp_path / 'statement.pdf'
    path.write_bytes(text_pdf(lines))
    return str(path)


def test_hdfc_excel(tmp_path):
    rows = [['Made-up statement for tests']] + [[]] * 18 + [HDFC_EXCEL_HEADER]
    assert pick_reader(_xlsx(tmp_path, rows), 'xlsx').source == 'hdfc'


def test_hdfc_pdf(tmp_path):
    path = _pdf(tmp_path, ['Made-up statement for tests', HDFC_PDF_HEADER])
    assert pick_reader(path, 'pdf').source == 'hdfc'


def test_other_excel_is_refused(tmp_path):
    path = _xlsx(tmp_path, [['Date', 'Description', 'Debit', 'Credit', 'Balance']])
    with pytest.raises(UnrecognisedStatement, match='HDFC Bank statement'):
        pick_reader(path, 'xlsx')


def test_other_pdf_is_refused(tmp_path):
    path = _pdf(tmp_path, ['Quarterly newsletter', 'Nothing to see here'])
    with pytest.raises(UnrecognisedStatement, match='HDFC Bank statement'):
        pick_reader(path, 'pdf')


def test_password_protected_pdf(tmp_path):
    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(text_pdf([HDFC_PDF_HEADER]))))
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')  # pypdf's ARC4 deprecation notice from cryptography
        writer.encrypt('made-up-password')
    path = tmp_path / 'statement.pdf'
    with open(path, 'wb') as f:
        writer.write(f)

    with pytest.raises(UnrecognisedStatement, match='password-protected'):
        pick_reader(str(path), 'pdf')


def test_broken_file(tmp_path):
    path = tmp_path / 'statement.pdf'
    path.write_bytes(b'not really a pdf')
    with pytest.raises(UnrecognisedStatement, match="Couldn't open"):
        pick_reader(str(path), 'pdf')
