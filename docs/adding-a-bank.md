# Adding a bank

RupeeTrail version 1 reads HDFC Bank statements. This page is for anyone adding another bank: how a statement reader plugs in, what it has to return, and how to test it without ever putting a real statement in the repo.

## The golden rule: no real statements

A statement carries a name, account number, address, balance and every payment made. **Never commit one, attach one to an issue, or paste real lines from one**, even with parts blanked out: the payees and amounts alone identify a person.

Instead, build a **fake statement in the same layout**: the same header rows, column names, date style and way of showing money in and out, filled with made-up payees, amounts and reference numbers. The test in `backend/tests/test_extract_excel.py` builds its statements in code while it runs, which keeps binary files out of the repo altogether. Do the same.

## How a statement gets in

1. The screens send the file to `/upload-stream` (or `/upload`) in `backend/app/main.py`.
2. `pick_reader` in `parser/readers.py` reads the start of the file (the first PDF page, or the first Excel rows) and asks each reader in `READERS` whether it recognises it. A file no reader recognises is refused with a message saying what RupeeTrail can read, before anything is saved.
3. The reader returns a list of transactions (below).
4. `bulk_insert_transactions` in `database.py` saves them, skipping any already there. A transaction's identity is its **date, amount and merchant**, so the same statement imported twice adds nothing.
5. The file is deleted (unless the user keeps copies), and the screens reload.

A new bank means a new extract function and a `Reader` entry in `READERS`: its file types, and a `detect` function that recognises the bank's statements. `detect` gets the start of the file as lowercase text with all spaces removed, so `Withdrawal Amt.` and `WithdrawalAmt.` both arrive as `withdrawalamt.`; the table's column names are usually enough. Make it specific enough not to claim another bank's statements.

## What a reader returns

A list of dicts, one per transaction, oldest or newest first (order doesn't matter):

| Key | Type | Notes |
|---|---|---|
| `date` | `str` | `YYYY-MM-DD`, the transaction date (not the value date) |
| `narration` | `str` | The bank's description, whitespace collapsed to single spaces, lines of a multi-line description joined |
| `amount` | `float` | Always positive |
| `txn_type` | `str` | `'debit'` (money out) or `'credit'` (money in) |
| `balance` | `float` or `None` | The closing balance after this row, if the statement has one |
| `ref_no` | `str` | Cheque or reference number, `''` if none |
| `merchant` | `str` | From `extract_merchant_name(narration)` |
| `category` | `str` | From `categorize_transaction(...)` |

`merchant` and `category` come from shared helpers, so every bank gets the same clean-up and categories. `_parse_excel_row` in `extract_excel.py` shows the whole sequence:

```python
from .merchant import extract_merchant_name, detect_transaction_type, is_p2p_transfer
from ..categorizer.rules import categorize_transaction

merchant = extract_merchant_name(narration)
category = categorize_transaction(
    merchant=merchant,
    narration=narration,
    txn_type=txn_type,
    transaction_type=detect_transaction_type(narration),
    is_p2p=is_p2p_transfer(narration, merchant),
    amount=amount,
)
```

Skip rows that aren't transactions (headers, separator rows, totals, footers) by returning nothing for them; a row whose date doesn't parse is the usual sign.

## Where each bank differs

**Columns and dates** are the easy part. Most Indian banks' Excel and CSV exports have a date, a description, a reference, separate withdrawal and deposit columns, and a balance, under different names. Some use a single signed amount (`-2,350.00` / `+85,000.00`) instead of two columns. Dates come as `01/09/26`, `01/09/2026`, `01-09-2026`, `1 Sep 2026` or `01-Sep-2026`.

Starting points, **not checked against real statements** (compiled from public format guides and other open-source parsers; confirm each against a real download before relying on it):

| Bank | Description column | Money out / in | Date style |
|---|---|---|---|
| HDFC (supported) | Narration | Withdrawal Amt. / Deposit Amt. | `01/09/26` |
| ICICI | Transaction Remarks | Withdrawal Amount (INR) / Deposit Amount (INR) | `01/09/2026` |
| SBI | Description | Debit / Credit | `1 Sep 2026` |
| Axis | PARTICULARS | DR / CR | `01-09-2026` |
| Kotak | Description, or Transaction Details | Dr / Cr, or one signed DEBIT/CREDIT (INR) column | `1 Sep 2026` |
| PNB | Particulars | Debit / Credit | `01/09/2026` |
| Bank of Baroda | Description | Debit / Credit | `01/09/2026` |
| Canara | Description | Withdraws / Deposit | `01-09-2026` |
| IDFC FIRST | Particulars | Debit / Credit | `01-Sep-2026` |

**Descriptions** are the hard part, and where most of the value is. `extract_merchant_name` in `parser/merchant.py` knows HDFC's shapes (`UPI-NAME-HANDLE@BANK-IFSC-REF-NOTE`, `POS…`, `NEFT CR-…`, `ACHD-…`). Other banks write the same payment differently (SBI's `BY TRANSFER-UPI/CR/…`, for example), so a new bank usually needs its patterns added there, with examples in the tests. Look at a real statement to learn the shapes, then write the test cases with made-up names.

**PDFs** depend on the exact layout, fonts and table lines of the bank's real PDF, so they can only be developed and tested against real statements. Start with Excel or CSV, which are far more reliable.

## Checklist for a pull request

- A reader for the new bank, and its `Reader` entry (with `detect`) in `parser/readers.py`.
- A test in `backend/tests/test_readers.py` that a fake statement in the bank's layout is recognised, and that the other banks' fakes still go to their own readers (`tests/fakes.py` builds PDFs in code).
- Tests that build a fake statement in the bank's layout and check dates, amounts, money in/out and balances, plus merchant names for the bank's common description shapes.
- The existing HDFC tests still pass: `cd backend && venv/Scripts/python -m pytest` (`venv/bin/python` on Mac and Linux).
- Say in the pull request which real statement format you checked against (for example "SBI savings, Excel export from YONO, September 2026"), without attaching it.
- Update the bank list in the README.

Open-source parsers for Indian banks exist and are useful for learning layouts. Check a project's licence before copying any of its code.
