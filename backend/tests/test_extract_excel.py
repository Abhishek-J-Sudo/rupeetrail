"""HDFC Excel reader against made-up statements built on the fly (no real data, no binary fixtures)."""

import openpyxl
import pytest

from app.parser.extract_excel import extract_hdfc_transactions_excel

HEADER = ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance']
ROWS = [
    ['01/09/26', 'SALARY CREDIT / ACME TECHNOLOGIES PVT LTD', None, '01/09/26', None, '85,000.00', '1,27,500.00'],
    ['02/09/26', 'UPI-FRESHMART-FRESHMART@OKAXIS-UTIB0000001-624512345678-GROCERY', '624512345678', '02/09/26', '2,350.00', None, '1,25,150.00'],
    ['28/09/26', 'SMS ALERT CHARGES + GST', 'CHG0928', '28/09/26', '29.50', None, '1,25,120.50'],
]


def _statement(tmp_path, separator):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(['Made-up statement for tests'])
    ws.append([])
    ws.append(HEADER)
    if separator:
        ws.append(['*' * 8] * len(HEADER))
    for row in ROWS:
        ws.append(row)
    ws.append([])
    ws.append(['End of statement'])
    path = tmp_path / 'statement.xlsx'
    wb.save(path)
    return path


@pytest.mark.parametrize('separator', [True, False], ids=['hdfc-asterisk-row', 'no-separator'])
def test_reads_every_row(tmp_path, separator):
    txns = extract_hdfc_transactions_excel(str(_statement(tmp_path, separator)))

    assert [t['date'] for t in txns] == ['2026-09-01', '2026-09-02', '2026-09-28']
    assert [(t['txn_type'], t['amount']) for t in txns] == [
        ('credit', 85000.0), ('debit', 2350.0), ('debit', 29.5),
    ]
    assert txns[0]['balance'] == 127500.0
