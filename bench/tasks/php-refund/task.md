Customers sometimes get part of their money back.

- Add `BillingService::refund(string $invoiceId, Money $amount, string $reason)` and return the document that records the refund.
- A customer can't get back more than they were billed.
- Keep `php tests/run.php` green and add tests for the new behaviour.
