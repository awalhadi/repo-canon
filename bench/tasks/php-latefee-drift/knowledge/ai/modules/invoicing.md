---
module: invoicing
code_paths: [src/BillingService.php, src/Invoice.php, src/CreditNote.php, src/InvoiceRepository.php, src/LateFeePolicy.php, src/ReminderText.php]
verified_at:
---
# invoicing

## Purpose
Draft, issue, pay and correct invoices.

## Invariants
- Issued invoices are immutable (D-001); refunds are credit notes (D-002); late fees are `FEE` invoices (D-003).
- A late fee is 2% of the overdue total, at least 5.00. <!-- rc: anchor=src/LateFeePolicy.php#LateFeePolicy -->
- Every document id comes from `IdGenerator` with its prefix.

## Code map
- `src/BillingService.php` — use cases (`createInvoice`, `addLine`, `issue`, `markPaid`)
- `src/InvoiceRepository.php` — `save`, `get`, `saveCreditNote`, `creditNotesFor`
- `src/ReminderText.php` — reminder sentence quoting the late-fee terms
