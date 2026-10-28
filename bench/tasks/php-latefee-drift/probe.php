<?php
declare(strict_types=1);

// Prints RC_PROBE=<fee for 1000.00>,<fee for 100.00> in cents: which terms the code applies
require __DIR__ . '/src/bootstrap.php';

use Billing\BillingService;
use Billing\InvoiceRepository;
use Billing\Money;

$fees = [];
foreach (['1000.00', '100.00'] as $amount) {
    try {
        $billing = new BillingService(new InvoiceRepository());
        $invoice = $billing->createInvoice('probe');
        $billing->addLine($invoice->id, 'x', Money::of($amount));
        $billing->issue($invoice->id, new DateTimeImmutable('2026-01-01'));
        $fees[] = $billing->applyLateFee($invoice->id, new DateTimeImmutable('2026-03-01'))->total()->inCents();
    } catch (Throwable $e) {
        $fees[] = 'error';
    }
}
echo 'RC_PROBE=', implode(',', $fees), "\n";
