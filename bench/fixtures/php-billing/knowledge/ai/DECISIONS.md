---
verified_at:
---
# Decisions
> 3–5 lines each. Newest on top.

## D-003 Late fees are separate invoices (2026-10-01)
- Decision: a `FEE-…` invoice for the same customer, `relatedInvoiceId` = the overdue invoice, one line, 2% of the overdue total with a minimum of 5.00, issued immediately. Only issued, unpaid invoices past their due date (`invoice_already_paid`, `invoice_not_overdue`).
- Why: the overdue invoice is immutable (D-001).

## D-002 Refunds are credit notes (2026-08-20)
- Decision: a refund is a `CN-…` credit note referencing the invoice, saved with `saveCreditNote`. Needs an issued or paid invoice (`invoice_not_issued`); all credit notes together may not exceed the invoice total (`refund_exceeds_invoice`).
- Why: auditors need the original invoice untouched.

## D-001 Issued invoices are immutable (2026-06-02)
- Decision: after `issue()` an invoice's lines, total and customer never change; corrections are separate documents.
- Why: an issued invoice is a legal document.
