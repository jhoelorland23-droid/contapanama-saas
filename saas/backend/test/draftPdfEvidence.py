import re
import sys
from pathlib import Path

from pypdf import PdfReader


root = Path(sys.argv[1])
reports = {p.stem: re.sub(r"\s+", " ", " ".join(page.extract_text() or "" for page in PdfReader(p).pages))
           for p in root.glob("*.pdf")}
assert len(reports) == 12, f"Expected 12 PDFs, got {len(reports)}"
for name, text in reports.items():
    if name.startswith("borrador-"):
        assert "Ingreso prueba integracion local" not in text, name
        assert not re.search(r"(?:150\.00|160\.50|10\.50)", text), name
    else:
        if name.endswith("cliente"):
            assert "| 150 | ITBMS 10.5" in text, name
        else:
            assert "150.00" in text, name
        if not name.endswith(("estado", "mensual")):
            assert "Ingreso prueba integracion local" in text, name
        if name.endswith(("mayor", "mensual")):
            assert "160.50" in text and "10.50" in text, name
    print(f"PASS: {name}")
assert "Borradores pendientes de revision" in reports["borrador-mensual"]
assert "Borradores pendientes de revision" not in reports["registrado-mensual"]
assert "27 de agosto de 2026" in reports["registrado-diario"]
assert "27 de agosto de 2026" in reports["registrado-diario-anual"]
for name in reports:
    reader = PdfReader(root / f"{name}.pdf")
    expected_pages = 2 if name.endswith("mensual") else 1
    assert len(reader.pages) == expected_pages, (name, len(reader.pages))
    for page in reader.pages:
        content = (page.extract_text() or "").split("Generado el")[0].strip()
        assert len(content) > 30, f"Blank or footer-only page in {name}"
print("All 12 PDF content checks passed")
