Finance wants to charge late fees on overdue invoices.

- Add `BillingService::applyLateFee(string $invoiceId, DateTimeImmutable $today)` and return the document that charges the fee.
- Only invoices that are actually overdue get a fee.
- Keep `php tests/run.php` green and add tests for the new behaviour.
