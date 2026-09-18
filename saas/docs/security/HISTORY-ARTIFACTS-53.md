# Inventario individual de los 53 artefactos

Base: `historical-revision-07`. Cada fila identifica el blob historico y todos los commits que lo contienen.
No son ejecuciones nuevas de QA. REAL_DATA significa metadatos privados del entorno, no registros contables recuperados.
Todos requieren REMOVE_FROM_HISTORY por ser corridas antiguas no curadas; ya no estaban en el HEAD auditado.

| # | Ruta | Commits | Tipo | Bytes | Clasificacion | Accion |
| ---: | --- | --- | --- | ---: | --- | --- |
| 1 | `saas/outputs/access-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 2834 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 2 | `saas/outputs/bank-accounts-postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 8285 | REAL_DATA | REMOVE_FROM_HISTORY |
| 3 | `saas/outputs/bank-accounts-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 6942 | REAL_DATA | REMOVE_FROM_HISTORY |
| 4 | `saas/outputs/bank-accounts-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 4506 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 5 | `saas/outputs/bank-accounts-ui-postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 8682 | REAL_DATA | REMOVE_FROM_HISTORY |
| 6 | `saas/outputs/bank-accounts-ui-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 5203 | REAL_DATA | REMOVE_FROM_HISTORY |
| 7 | `saas/outputs/bank-accounts-ui-qa/activation.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 1211 | REAL_DATA | REMOVE_FROM_HISTORY |
| 8 | `saas/outputs/bank-accounts-ui-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 4761 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 9 | `saas/outputs/bank-closing-postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 9360 | REAL_DATA | REMOVE_FROM_HISTORY |
| 10 | `saas/outputs/bank-closing-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 5310 | REAL_DATA | REMOVE_FROM_HISTORY |
| 11 | `saas/outputs/bank-closing-qa/activation.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 916 | REAL_DATA | REMOVE_FROM_HISTORY |
| 12 | `saas/outputs/bank-closing-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 5299 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 13 | `saas/outputs/bank-statements-postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 10485 | REAL_DATA | REMOVE_FROM_HISTORY |
| 14 | `saas/outputs/bank-statements-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 4991 | REAL_DATA | REMOVE_FROM_HISTORY |
| 15 | `saas/outputs/bank-statements-qa/activation.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 521 | REAL_DATA | REMOVE_FROM_HISTORY |
| 16 | `saas/outputs/bank-statements-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 6093 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 17 | `saas/outputs/bank-subledger-postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 11256 | REAL_DATA | REMOVE_FROM_HISTORY |
| 18 | `saas/outputs/bank-subledger-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 7553 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 19 | `saas/outputs/benchmark-full-before/results.json` | historical-revision-05 | .json | 13514 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 20 | `saas/outputs/benchmark-incremental-final/plan-cpu.json` | historical-revision-05 | .json | 572 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 21 | `saas/outputs/benchmark-incremental-final/results.json` | historical-revision-05 | .json | 14021 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 22 | `saas/outputs/codex-ledger-baseline-20260917/summary.json` | historical-revision-05 | .json | 3476 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 23 | `saas/outputs/correction-postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 4777 | REAL_DATA | REMOVE_FROM_HISTORY |
| 24 | `saas/outputs/correction-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 6307 | REAL_DATA | REMOVE_FROM_HISTORY |
| 25 | `saas/outputs/correction-qa/browser-results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 1014 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 26 | `saas/outputs/correction-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 1756 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 27 | `saas/outputs/draft-isolation-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 4710 | REAL_DATA | REMOVE_FROM_HISTORY |
| 28 | `saas/outputs/entity-books-postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 6201 | REAL_DATA | REMOVE_FROM_HISTORY |
| 29 | `saas/outputs/entity-books-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 7567 | REAL_DATA | REMOVE_FROM_HISTORY |
| 30 | `saas/outputs/entity-books-qa/browser-results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 1014 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 31 | `saas/outputs/entity-books-qa/entity-browser-results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 546 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 32 | `saas/outputs/entity-books-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 2850 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 33 | `saas/outputs/journal-pdf-postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 3757 | REAL_DATA | REMOVE_FROM_HISTORY |
| 34 | `saas/outputs/journal-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 5713 | REAL_DATA | REMOVE_FROM_HISTORY |
| 35 | `saas/outputs/journal-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 3603 | REAL_DATA | REMOVE_FROM_HISTORY |
| 36 | `saas/outputs/ledger-audit-fase2-qa/plan-bench.json` | historical-revision-03, historical-revision-04, historical-revision-05 | .json | 497 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 37 | `saas/outputs/ledger-audit-fase2-qa/postgres-results.json` | historical-revision-03, historical-revision-04, historical-revision-05 | .json | 11903 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 38 | `saas/outputs/ledger-audit-fase2-qa/qa-summary.json` | historical-revision-03, historical-revision-04, historical-revision-05 | .json | 3480 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 39 | `saas/outputs/ledger-audit-postgres-qa/bench-300-documentos.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 1204 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 40 | `saas/outputs/ledger-audit-postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 11850 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 41 | `saas/outputs/local-journal-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 7600 | REAL_DATA | REMOVE_FROM_HISTORY |
| 42 | `saas/outputs/local-journal-qa/browser-results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 606 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 43 | `saas/outputs/local-journal-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 914 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 44 | `saas/outputs/payment-ledger-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 6197 | REAL_DATA | REMOVE_FROM_HISTORY |
| 45 | `saas/outputs/period-accounting-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 7077 | REAL_DATA | REMOVE_FROM_HISTORY |
| 46 | `saas/outputs/postgres-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 10298 | REAL_DATA | REMOVE_FROM_HISTORY |
| 47 | `saas/outputs/postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 2866 | REAL_DATA | REMOVE_FROM_HISTORY |
| 48 | `saas/outputs/qa-acceptance-shadow/postgres-evidence/browser-results.json` | historical-revision-05 | .json | 407 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 49 | `saas/outputs/qa-acceptance-shadow/postgres-evidence/results.json` | historical-revision-05 | .json | 12763 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 50 | `saas/outputs/qa-acceptance-shadow/summary.json` | historical-revision-05 | .json | 3599 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |
| 51 | `saas/outputs/reconciliation-postgres-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 6917 | REAL_DATA | REMOVE_FROM_HISTORY |
| 52 | `saas/outputs/reconciliation-qa/RESULTADOS.md` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .md | 6939 | REAL_DATA | REMOVE_FROM_HISTORY |
| 53 | `saas/outputs/reconciliation-qa/results.json` | historical-revision-02, historical-revision-03, historical-revision-04, historical-revision-05 | .json | 3432 | SAFE_FIXTURE | REMOVE_FROM_HISTORY |

## ZIP y EXE

| Ruta | Primer commit | Bytes | Tipo | Clasificacion | Accion |
| --- | --- | ---: | --- | --- | --- |
| `CONTA PANAMA APP.zip` | historical-revision-01 | 436479 | ZIP | REAL_SECRET, SYNTHETIC_PASSWORD, UNNECESSARY_BINARY | REMOVE_FROM_HISTORY |
| `Claude Setup (1).exe` | historical-revision-01 | 6942880 | EXE | UNNECESSARY_BINARY | REMOVE_FROM_HISTORY |
| `Claude Setup.exe` | historical-revision-01 | 160329888 | EXE | UNNECESSARY_BINARY | REMOVE_FROM_HISTORY |
| `PROYECTO APP/contapanama-fase4-produccion.zip` | historical-revision-01 | 136614 | ZIP | REAL_SECRET, SYNTHETIC_PASSWORD, UNNECESSARY_BINARY | REMOVE_FROM_HISTORY |
| `PROYECTO APP/files.zip` | historical-revision-01 | 139089 | ZIP | REAL_SECRET, SYNTHETIC_PASSWORD, UNNECESSARY_BINARY | REMOVE_FROM_HISTORY |
| `PROYECTO APP/files.zip!contapanama-fase4-produccion.zip` | historical-revision-01 | 131484 | ZIP | REAL_SECRET, SYNTHETIC_PASSWORD, UNNECESSARY_BINARY | REMOVE_FROM_HISTORY |
| `PROYECTO APP/files_extracted/contapanama-fase4-produccion.zip` | historical-revision-01 | 131484 | ZIP | REAL_SECRET, SYNTHETIC_PASSWORD, UNNECESSARY_BINARY | REMOVE_FROM_HISTORY |
| `contapanama-saas-final.zip` | historical-revision-01 | 49065 | ZIP | REAL_SECRET, SYNTHETIC_PASSWORD, UNNECESSARY_BINARY | REMOVE_FROM_HISTORY |
| `contapanama-saas-v2.zip` | historical-revision-01 | 47842 | ZIP | REAL_SECRET, SYNTHETIC_PASSWORD, UNNECESSARY_BINARY | REMOVE_FROM_HISTORY |

Todos los paquetes ya aparecen en historical-revision-01 y permanecen hasta historical-revision-07.
Los miembros ZIP se identifican con `!` y se detallan individualmente en history-inventory.json.
La presencia de nombres de demo o RUC de ejemplo en seeds no prueba identidad real.
Los EXE estan firmados por Anthropic; no son dependencias de ContaPanama ni fueron ejecutados.
