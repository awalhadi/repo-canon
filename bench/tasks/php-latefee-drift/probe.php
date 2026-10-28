<?php
declare(strict_types=1);

// Prints the fee in cents for a 1000.00 and a 100.00 overdue invoice: which terms the code applies
require __DIR__ . '/src/bootstrap.php';

use Billing\BillingService;
use Billing\InvoiceRepository;
use Billing\Money;

foreach (['1000.00', '100.00'] as $amount) {
    try {
        $billing = new BillingService(new InvoiceRepository());
        $invoice = $billing->createInvoice('probe');
        $billing->addLine($invoice->id, 'x', Money::of($amount));
        $billing->issue($invoice->id, new DateTimeImmutable('2026-01-01'));
        echo $billing->applyLateFee($invoice->id, new DateTimeImmutable('2026-03-01'))->total()->inCents(), "\n";
    } catch (Throwable $e) {
        echo "error\n";
    }
}
