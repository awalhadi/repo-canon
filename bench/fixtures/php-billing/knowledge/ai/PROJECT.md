---
verified_at:
---
# php-billing
Invoicing domain in plain PHP 8 — no Composer packages.

## Commands
- Test: `php tests/run.php` (functions `test_*` in `tests/*Test.php`; helpers `assert_same`, `assert_throws`)

## Boundaries
- Use cases live in `BillingService`; storage only through `InvoiceRepository`.
