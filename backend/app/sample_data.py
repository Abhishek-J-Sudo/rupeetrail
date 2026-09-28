"""
Sample data: six months of a made-up person's HDFC savings account

Used by "Try with sample data" on the welcome screen and for README screenshots. Everything
here is invented: the people, the employer, the loan and card numbers. The rows are written as
an HDFC-style Excel statement and imported through the real reader, so the sample shows the app
exactly as it behaves with a real statement (merchant names, categories, recurring payments).

The same seed gives the same statement for the same end date.
"""

import random
from datetime import date, timedelta
from pathlib import Path
from typing import List, Tuple

import pandas as pd

CARD = "541919XXXXXX4821"
LOAN = "482913577"
HOLDER = "PRIYA SHARMA"
MONTHS = 6
OPENING_BALANCE = 84_250.00

_ref_counter = [610_000_000_000]


def _ref() -> str:
    _ref_counter[0] += 7_919
    return str(_ref_counter[0])


def _upi(name: str, handle: str, ifsc: str, note: str = "UPI") -> str:
    return f"UPI-{name}-{handle}-{ifsc}-{_ref()}-{note}"


# Businesses paid by UPI: (name, handle, ifsc, low, high)
GROCERIES = [
    ("AVENUE SUPERMARTS LTD", "DMARTAVENUE@YBL", "YESB0YBLUPI", 900, 3200),
    ("BLINKIT", "BLINKIT.PAYU@HDFCBANK", "HDFC0MERUPI", 180, 900),
    ("ZEPTO MARKETPLACE PR", "ZEPTOMARKETPLACE@YBL", "YESB0YBLUPI", 150, 750),
]
FOOD = [
    ("SWIGGY", "SWIGGY.STORES@AXB", "UTIB0000100", 220, 780),
    ("ZOMATO LTD", "ZOMATO.ORDER@PTYBL", "YESB0PTMUPI", 250, 850),
    ("STARBUCKS COFFEE", "STARBUCKS.PAYU@HDFCBANK", "HDFC0MERUPI", 320, 690),
    ("MC DONALDS", "MCDONALDS.27329472@HDFCBANK", "HDFC0MERUPI", 180, 520),
]
TRANSPORT = [
    ("UBER INDIA SYSTEMS", "UBERINDIA.PAYU@HDFCBANK", "HDFC0MERUPI", 140, 620),
    ("ANI TECHNOLOGIES PVT", "OLACABS.RZP@AXISBANK", "UTIB0000100", 120, 480),
]
SHOPPING = [
    ("AMAZON INDIA", "AMAZONUPI@APL", "UTIB0000100", 350, 4200),
    ("MYNTRA DESIGNS", "MYNTRA2.PAYU@HDFCBANK", "HDFC0MERUPI", 800, 3500),
]
HEALTH = [("APOLLO PHARMACY", "APOLLOPHARMACY.RZP@AXISBANK", "UTIB0000100", 240, 1400)]
FUEL = [("INDIAN OIL PETROL PUMP", "IOCL.PETROL@SBI", "SBIN0000300", 1500, 2500)]
# Friends paid now and then (the app keeps these as personal transfers and never sends them to AI)
FRIENDS = [
    ("ANANYA IYER", "ANANYA.IYER@OKICICI", "ICIC0000123"),
    ("KARAN MEHTA", "KARANM@OKAXIS", "UTIB0000456"),
    ("ROHAN DAS", "ROHANDAS92@YBL", "YESB0YBLUPI"),
]


def _month_starts(end: date) -> List[date]:
    first = date(end.year, end.month, 1)
    starts = [first]
    for _ in range(MONTHS - 1):
        prev = starts[-1] - timedelta(days=1)
        starts.append(date(prev.year, prev.month, 1))
    return sorted(starts)


def _day(start: date, day: int, end: date) -> date | None:
    """That day of the month, or None when it's past the end of the statement"""
    last = (date(start.year + (start.month == 12), start.month % 12 + 1, 1) - timedelta(days=1)).day
    when = date(start.year, start.month, min(day, last))
    return when if when <= end else None


def build_rows(end: date, seed: int = 7) -> List[Tuple[date, str, float, float]]:
    """(date, narration, withdrawal, deposit) for every transaction, oldest first"""
    rng = random.Random(seed)
    _ref_counter[0] = 610_000_000_000
    rows = []

    def out(when, narration, amount):
        if when:
            rows.append((when, narration, round(amount, 2), 0.0))

    def into(when, narration, amount):
        if when:
            rows.append((when, narration, 0.0, round(amount, 2)))

    for i, start in enumerate(_month_starts(end)):
        # Salary on the 1st (the month's pay arrives at the start of the next month)
        prev_month = (start - timedelta(days=1)).strftime("%b").upper()
        into(_day(start, 1, end), f"NEFT CR-CITI0000002-NORTHWIND TECHNOLOGIES PVT LTD-{HOLDER}-CITIN{_ref()[:11]} SALARY FOR {prev_month}", 92_400)
        # Rent to the landlord, EMI, SIP, bills and subscriptions on fixed days
        out(_day(start, 3, end), _upi("RAHUL VERMA", "RAHULVERMA@OKHDFCBANK", "HDFC0001234", "RENT"), 24_000)
        out(_day(start, 5, end), f"EMI {LOAN} CHQ S{LOAN}{i + 1:03d}1 {start:%m%y}{LOAN}", 11_860)
        out(_day(start, 7, end), _upi("GROWW INVEST TECH PV", "GROWW.BRK@VALIDICICI", "ICIC0DC0099", "SIP"), 10_000)
        out(_day(start, 8, end), f"ME DC SI {CARD} NETFLIX", 649)
        out(_day(start, 12, end), _upi("SPOTIFY", "BILLDESKPG.SPOTIFY@ICICI", "ICIC0000011"), 139)
        out(_day(start, 14, end), _upi("MAHARASHTRA STATE ELE", "MSEDCL.BILLDESK@HDFCBANK", "HDFC0MERUPI", "BILL"), rng.uniform(1100, 2300))
        out(_day(start, 18, end), _upi("AIRTEL", "AIRTELPAYMENTS@AIRTEL", "AIRP0000001", "RECHARGE"), 399)
        out(_day(start, 20, end), f"CC 000{CARD[:6]}XXXXXX9034 AUTOPAY SI-TAD", rng.uniform(9_000, 21_000))

        # Everyday spending spread over the month
        def some(merchants, times):
            for _ in range(times):
                name, handle, ifsc, low, high = rng.choice(merchants)
                out(_day(start, rng.randint(1, 28), end), _upi(name, handle, ifsc), rng.uniform(low, high))

        some(GROCERIES, rng.randint(6, 9))
        some(FOOD, rng.randint(7, 11))
        some(TRANSPORT, rng.randint(5, 9))
        some(SHOPPING, rng.randint(1, 3))
        some(HEALTH, rng.randint(0, 2))
        some(FUEL, rng.randint(1, 2))
        for _ in range(rng.randint(1, 3)):
            name, handle, ifsc = rng.choice(FRIENDS)
            out(_day(start, rng.randint(1, 28), end), _upi(name, handle, ifsc, "SPLIT"), rng.choice([250, 400, 600, 850, 1200]))
        if rng.random() < 0.5:
            name, handle, ifsc = rng.choice(FRIENDS)
            into(_day(start, rng.randint(1, 28), end), _upi(name, handle, ifsc, "SPLIT"), rng.choice([300, 500, 750]))
        out(_day(start, rng.randint(9, 25), end), f"NWD-{CARD}-S1ANMU12-MUMBAI", rng.choice([2000, 3000, 5000]))
        # Now and then a top-up into mutual funds on top of the SIP
        if rng.random() < 0.5:
            out(_day(start, rng.randint(15, 27), end), _upi("GROWW INVEST TECH PV", "GROWW.BRK@VALIDICICI", "ICIC0DC0099", "LUMPSUM"), rng.choice([3000, 5000, 8000]))
        if start.month in (3, 6, 9, 12):
            into(_day(start, 30, end), f"INTEREST PAID TILL {_day(start, 30, end) or end:%d-%b-%Y}".upper(), rng.uniform(600, 900))

    rows.sort(key=lambda r: r[0])
    return rows


def write_statement(path: Path, end: date, seed: int = 7) -> int:
    """Write the sample as an HDFC-style Excel statement; returns the number of transactions"""
    rows = build_rows(end, seed)
    balance = OPENING_BALANCE
    body = []
    for when, narration, withdrawal, deposit in rows:
        balance = round(balance - withdrawal + deposit, 2)
        body.append([
            when.strftime("%d/%m/%y"), narration, f"{_ref()[-10:]:0>16}",
            when.strftime("%d/%m/%y"), withdrawal or None, deposit or None, balance,
        ])
    header = ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"]
    preamble = [["HDFC BANK Ltd."], [f"{HOLDER} (sample data)"], [], ["Statement of account"], []]
    frame = pd.DataFrame(preamble + [header, ["*" * 8] * 7] + body)
    frame.to_excel(path, header=False, index=False)
    return len(body)
