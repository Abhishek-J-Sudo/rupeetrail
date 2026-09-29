"""GPay statement reader against a made-up statement in GPay's layout (no real data)."""

import logging

import pdfplumber
import pytest

from app.parser.extract_gpay import extract_gpay_transactions
from app.parser.merchant import extract_merchant_name, detect_transaction_type, is_p2p_transfer, gpay_narration
from app.parser.readers import pick_reader
from fakes import text_pdf

# GPay's columns: date and time, transaction details (the bank line is indented past
# the bank's logo), amount
DATE_X, DETAILS_X, BANK_X, AMOUNT_X = 24, 139, 156, 540
TABLE_HEADER = [(DATE_X, 'Date & time'), (DETAILS_X, 'Transaction details'), (536, 'Amount')]
FOOTER = 'Note: This statement reflects payments made by you on the Google Pay app.'


def _row(date, time, details, upi_id, account_line, amount):
    return [
        [(DATE_X, date), (DETAILS_X, details), (AMOUNT_X, amount)],
        [(DATE_X, time), (DETAILS_X, f'UPI Transaction ID: {upi_id}')],
        [(BANK_X, account_line)],
    ]


def _statement(tmp_path, sent='₹2,885.50', received='₹1,200', broken_widths=True):
    page_1 = [
        'Transaction statement',
        '9999999999, someone@example.com',
        [(DATE_X, 'Transaction statement period'), (327, 'Sent'), (488, 'Received')],
        [(DATE_X, '01 September 2026 - 30 September 2026'), (312, sent), (494, received)],
        TABLE_HEADER,
        *_row('02 Sep, 2026', '10:53 AM', 'Paid to FRESH_MART_', '111111111111', 'Paid by Example Bank 1234', '₹2,350.50'),
        *_row('05 Sep, 2026', '07:46 PM', 'Received from ASHA   VERMA', '222222222222', 'Paid to Example Bank 1234', '₹1,200'),
        # A row shape the reader doesn't know: skipped, not guessed at
        [(DATE_X, '06 Sep, 2026'), (DETAILS_X, 'Cashback won'), (AMOUNT_X, '₹10')],
        [(DATE_X, '09:00 AM')],
        FOOTER,
        [(537, 'Page 1 of 2')],
    ]
    page_2 = [
        'Transaction statement',
        '9999999999, someone@example.com',
        TABLE_HEADER,
        *_row('30 Sep, 2026', '11:40 AM', 'Paid to M/S.CITY DIAGNOSTIC CENTRE 2', '333333333333', 'Paid by Other Bank 5678', '₹535'),
        FOOTER,
        [(537, 'Page 2 of 2')],
    ]
    path = tmp_path / 'gpay.pdf'
    path.write_bytes(text_pdf(page_1, page_2, broken_widths=broken_widths))
    return str(path)


@pytest.fixture(params=[True, False], ids=['gpay-font-widths', 'correct-widths'])
def statement(request, tmp_path):
    return _statement(tmp_path, broken_widths=request.param)


def test_fake_scrambles_like_gpay(tmp_path):
    # The fake must reproduce the real problem, or the tests below prove nothing
    with pdfplumber.open(_statement(tmp_path)) as pdf:
        assert 'Paid to FRESH_MART_' not in (pdf.pages[0].extract_text() or '')


def test_recognised_as_gpay(statement):
    assert pick_reader(statement, 'pdf').source == 'gpay'


def test_reads_every_row(statement):
    txns = extract_gpay_transactions(statement)

    assert [(t['date'], t['txn_type'], t['amount']) for t in txns] == [
        ('2026-09-02', 'debit', 2350.5),
        ('2026-09-05', 'credit', 1200.0),
        ('2026-09-30', 'debit', 535.0),
    ]
    assert [t['upi_id'] for t in txns] == ['111111111111', '222222222222', '333333333333']
    assert [t['ref_no'] for t in txns] == [t['upi_id'] for t in txns]
    assert [t['account'] for t in txns] == ['Example Bank 1234', 'Example Bank 1234', 'Other Bank 5678']
    assert all(t['source'] == 'gpay' and t['balance'] is None for t in txns)


def test_payee_names(statement):
    txns = extract_gpay_transactions(statement)

    assert [t['merchant'] for t in txns] == ['Fresh Mart', 'Asha Verma', 'City Diagnostic Centre']
    assert txns[0]['narration'] == 'Paid to FRESH_MART_ · UPI ref 111111111111'
    assert txns[1]['narration'] == 'Received from ASHA VERMA · UPI ref 222222222222'


def test_header_details_never_read(statement):
    txns = extract_gpay_transactions(statement)
    text = repr(txns)
    assert '9999999999' not in text and 'example.com' not in text


def test_totals_that_disagree_are_logged(tmp_path, caplog):
    with caplog.at_level(logging.WARNING):
        extract_gpay_transactions(_statement(tmp_path))
    assert 'add up to' not in caplog.text

    caplog.clear()
    with caplog.at_level(logging.WARNING):
        extract_gpay_transactions(_statement(tmp_path, sent='₹9,999'))
    assert 'add up to' in caplog.text


@pytest.mark.parametrize('direction', ['Paid to', 'Received from'])
def test_gpay_narration_is_upi(direction):
    # Migrations re-run these on stored narrations, so they must know GPay's shape
    narration = gpay_narration(direction, 'ASHA VERMA', '222222222222')
    assert detect_transaction_type(narration) == 'upi'
    assert extract_merchant_name(narration) == 'Asha Verma'
    assert is_p2p_transfer(narration, 'Asha Verma')
