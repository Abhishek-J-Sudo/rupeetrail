"""Keeping each payment once across bank and GPay statements, in a throwaway database with made-up rows."""

import pytest

from app import database
from app.migrations import _backfill_upi_ids
from app.parser.readers import Coverage, _hdfc_coverage, _hdfc_upi_id

ACCOUNT = 'Example Bank 1234'
SEPTEMBER = Coverage(ACCOUNT, '2026-09-01', '2026-09-30')


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'test.db')
    monkeypatch.setattr(database, '_sample_on', False)
    database.init_db()
    return database


def bank(upi_id, date, amount, merchant, txn_type='debit'):
    return {
        'date': date, 'amount': amount, 'txn_type': txn_type, 'merchant': merchant,
        'narration': f'UPI-{merchant.upper()}-SHOP@OKBANK-EXMP0000001-{upi_id}-UPI',
        'ref_no': f'0000{upi_id}', 'balance': 10000.0, 'category': 'Groceries',
        'source': 'hdfc', 'upi_id': upi_id, 'account': ACCOUNT,
    }


def gpay(upi_id, date, amount, payee, txn_type='debit', account=ACCOUNT):
    direction = 'Paid to' if txn_type == 'debit' else 'Received from'
    return {
        'date': date, 'amount': amount, 'txn_type': txn_type, 'merchant': payee,
        'narration': f'{direction} {payee} · UPI ref {upi_id}', 'ref_no': upi_id, 'balance': None,
        'category': 'Other', 'source': 'gpay', 'upi_id': upi_id, 'account': account,
    }


def rows(db):
    conn = db.get_connection()
    try:
        return {r['upi_id']: dict(r) for r in conn.execute('SELECT * FROM transactions')}
    finally:
        conn.close()


def test_gpay_after_bank(db):
    db.import_statement([bank('100000000001', '2026-09-02', 250.0, 'Fresh Mart'),
                         bank('100000000002', '2026-09-03', 90.0, 'Tea Stall')], SEPTEMBER, 'hdfc')

    counts = db.import_statement([
        gpay('100000000001', '2026-09-02', 250.0, 'Fresh Mart'),              # the same payment
        gpay('100000000003', '2026-09-10', 40.0, 'Juice Bar'),                # September, bank doesn't have it
        gpay('100000000004', '2026-10-01', 60.0, 'Juice Bar'),                # after the bank statement
        gpay('100000000005', '2026-09-12', 70.0, 'Book Shop', account='Other Bank 5678'),  # another account
    ])

    assert counts['in_bank_statement'] == 1
    assert counts['not_in_bank_statement'] == 1
    assert counts['saved'] == 2
    stored = rows(db)
    assert set(stored) == {'100000000001', '100000000002', '100000000004', '100000000005'}
    assert stored['100000000001']['source'] == 'hdfc'


def test_bank_after_gpay(db):
    db.import_statement([
        gpay('100000000001', '2026-09-02', 250.0, 'Fresh Mart'),
        gpay('100000000003', '2026-09-10', 40.0, 'Juice Bar'),
        gpay('100000000004', '2026-10-01', 60.0, 'Juice Bar'),
    ])
    # The user recategorised the GPay row by hand
    first = rows(db)['100000000001']['id']
    db.update_transaction(first, category='Food & Dining')

    counts = db.import_statement([bank('100000000001', '2026-09-03', 250.0, 'Fresh Mart'),
                                  bank('100000000002', '2026-09-03', 90.0, 'Tea Stall')], SEPTEMBER, 'hdfc')

    assert counts == dict(saved=1, duplicates=0, replaced=1, removed=1, in_bank_statement=0, not_in_bank_statement=0)
    stored = rows(db)
    assert set(stored) == {'100000000001', '100000000002', '100000000004'}
    replaced = stored['100000000001']
    assert replaced['id'] == first                                   # same row, so edits stay attached
    assert (replaced['source'], replaced['date'], replaced['balance']) == ('hdfc', '2026-09-03', 10000.0)
    assert (replaced['category'], replaced['category_source']) == ('Food & Dining', 'manual')


def test_a_refund_is_not_the_payment(db):
    # A reversal can carry the original payment's UPI ID; direction must match too
    db.bulk_insert_transactions([bank('100000000001', '2026-09-02', 250.0, 'Fresh Mart')])

    counts = db.import_statement([gpay('100000000001', '2026-09-04', 250.0, 'Fresh Mart', txn_type='credit')])

    assert counts['saved'] == 1 and counts['in_bank_statement'] == 0


@pytest.mark.parametrize('make', [gpay, bank], ids=['gpay', 'bank'])
def test_equal_payments_on_one_day_stay_two(db, make):
    # Two bus tickets: same payee, amount and day, different UPI IDs
    counts = db.import_statement([make('100000000001', '2026-09-02', 13.0, 'Bus Ticket'),
                                  make('100000000002', '2026-09-02', 13.0, 'Bus Ticket')], SEPTEMBER, 'hdfc')
    assert counts['saved'] == 2


def test_importing_again_adds_nothing(db):
    statement = [gpay('100000000001', '2026-09-02', 250.0, 'Fresh Mart')]
    db.import_statement(statement)
    assert db.import_statement(statement)['duplicates'] == 1

    statement = [bank('100000000002', '2026-09-03', 90.0, 'Tea Stall')]
    db.import_statement(statement, SEPTEMBER, 'hdfc')
    assert db.import_statement(statement, SEPTEMBER, 'hdfc')['duplicates'] == 1


def test_clearing_data_forgets_coverage(db):
    db.import_statement([bank('100000000001', '2026-09-02', 250.0, 'Fresh Mart')], SEPTEMBER, 'hdfc')
    db.clear_all_transactions()

    assert db.import_statement([gpay('100000000003', '2026-09-10', 40.0, 'Juice Bar')])['saved'] == 1


def test_backfill_for_rows_imported_before_gpay(db):
    conn = db.get_connection()
    with conn:
        for i, (narration, ref) in enumerate([
            ('UPI-FRESH MART-SHOP@OKBANK-EXMP0000001-100000000001-UPI', '0000100000000001'),
            ('NEFT CR-EXMP0000001-ACME PVT LTD-SALARY', 'EXMPN12345678901'),
        ]):
            conn.execute(
                "INSERT INTO transactions (hash, ref_no, date, merchant, narration, amount, txn_type, category) "
                "VALUES (?, ?, '2026-09-02', 'x', ?, 1, 'debit', 'Other')", (f'h{i}', ref, narration))
        _backfill_upi_ids(conn.cursor())
    stored = conn.execute('SELECT hash, source, upi_id FROM transactions ORDER BY id').fetchall()
    conn.close()

    assert [(r['source'], r['upi_id']) for r in stored] == [('hdfc', '100000000001'), ('hdfc', None)]
    # Keyed by UPI ID now, so importing the same statement again still skips the row
    assert stored[0]['hash'] == db.upi_hash('100000000001', 'debit')
    assert stored[1]['hash'] == 'h1'


@pytest.mark.parametrize('sample', [
    # Excel: cells joined with spaces
    'Nomination : Registered Account No :50100012345678   SAVINGS Statement From  :  01/09/2026         To  :  30/09/2026',
    # PDF, as pdfplumber lays it out
    'MUMBAI AccountNo : 50100012345678 SAVINGS\nFrom : 01/09/2026 To : 30/09/2026 Statementof account',
], ids=['excel', 'pdf'])
def test_hdfc_coverage_from_header(sample):
    assert _hdfc_coverage(sample) == Coverage('HDFC Bank 5678', '2026-09-01', '2026-09-30')


def test_hdfc_coverage_needs_both_fields():
    assert _hdfc_coverage('Statement From : 01/09/2026 To : 30/09/2026') is None


def test_hdfc_upi_id():
    assert _hdfc_upi_id(bank('100000000001', '2026-09-02', 1.0, 'Fresh Mart')) == '100000000001'
    assert _hdfc_upi_id({'narration': 'NEFT CR-ACME', 'ref_no': '0000100000000001'}) is None
    assert _hdfc_upi_id({'narration': 'UPI-FRESH MART', 'ref_no': ''}) is None
