# AGENTS.md — php-billing

Invoicing domain in plain PHP 8 — no Composer packages.

## Commands
- Test: `php tests/run.php` (functions named `test_*` in `tests/*Test.php`; helpers `assert_same`, `assert_throws`)

## Layout
```
src/
  BillingService.php     use cases
  Invoice.php            invoice + lines
  CreditNote.php         correction document
  InvoiceRepository.php  storage (invoices + credit notes)
  Money.php              integer-cent amounts
  IdGenerator.php        document numbers
  DomainError.php        business-rule failures
tests/
```

## Rules
- Amounts are `Money` (integer cents) everywhere. Never use floats, `round()` or `number_format()` on amounts. Percentages are basis points: `$money->percent(200)` is 2%, rounded down to the cent.
- An issued invoice is a legal document and is **immutable**: never change its lines, total or customer after `issue()`. Corrections are separate documents.
- Document ids come only from `IdGenerator::next(<prefix>)`: `INV` invoices, `CN` credit notes, `FEE` late-fee invoices.
- Business-rule failures throw `DomainError` with a snake_case `reason`.
- Everything is stored through `InvoiceRepository`.

## Decisions
- Refunds are credit notes (`CN-…`) that reference the invoice; they are saved with `saveCreditNote`. A refund needs an issued or paid invoice (`invoice_not_issued` otherwise) and all credit notes together may not exceed the invoice total (`refund_exceeds_invoice`).
- Late fees are a **separate** `FEE-…` invoice for the same customer, with `relatedInvoiceId` set to the overdue invoice, one line, 2% of the overdue total with a minimum of 5.00, issued immediately. Only an issued, unpaid invoice past its due date gets one (`invoice_already_paid`, `invoice_not_overdue`).
