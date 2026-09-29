"""Made-up statement files built in code, so tests never need real statements or binary fixtures."""

# Helvetica with Latin-1 text, plus ₹ on a spare code (PDF's standard encoding has no ₹)
RUPEE_CODE = b'\x80'


def text_pdf(*pages, broken_widths=False):
    """
    A PDF with one page per argument; each page is a list of lines, top to bottom

    A line is a string (drawn at the left margin) or a list of (x, text) pieces, for
    statements laid out in columns.

    broken_widths copies GPay's PDFs: the font says every character is as wide as the
    font size, and each word is placed on its own at its real position. Words then
    overlap, and pdfplumber's text layout scrambles their letters.
    """
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', None]
    font = 3
    widths = b' /FirstChar 0 /LastChar 255 /Widths [%s]' % (b'1000 ' * 256) if broken_widths else b''
    objects.append(
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding '
        b'/BaseEncoding /WinAnsiEncoding /Differences [128 /uni20B9] >>%s >>' % widths
    )
    kids = []
    for lines in pages:
        stream = _page_stream(lines, broken_widths)
        objects.append(b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream')
        objects.append(
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
            b'/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>' % (font, len(objects))
        )
        kids.append(len(objects))
    objects[1] = b'<< /Type /Pages /Kids [%s] /Count %d >>' % (
        b' '.join(b'%d 0 R' % k for k in kids), len(kids)
    )

    out = bytearray(b'%PDF-1.4\n')
    offsets = []
    for number, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b'%d 0 obj\n' % number + body + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)
    out += b''.join(b'%010d 00000 n \n' % offset for offset in offsets)
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objects) + 1, xref)
    return bytes(out)


def _page_stream(lines, word_by_word):
    ops = [b'BT /F1 10 Tf']
    for row, line in enumerate(lines):
        y = 800 - row * 16
        for x, text in ([(40, line)] if isinstance(line, str) else line):
            if not word_by_word:
                ops.append(b'1 0 0 1 %d %d Tm (%s) Tj' % (x, y, _encode(text)))
                continue
            for word in text.split():
                ops.append(b'1 0 0 1 %d %d Tm (%s) Tj' % (x, y, _encode(word)))
                x += 5 * len(word) + 3   # roughly where the real font would put the next word
    ops.append(b'ET')
    return b'\n'.join(ops)


def _encode(text):
    raw = text.replace('₹', '\x80').encode('latin-1')
    return raw.replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)')
