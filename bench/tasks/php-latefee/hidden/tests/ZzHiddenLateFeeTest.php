<?php
declare(strict_types=1);

use Billing\BillingService;
use Billing\Invoice;
use Billing\InvoiceRepository;
use Billing\Money;

function hidden_fee_setup(string $amount): array
{
    $repo = new InvoiceRepository();
    $billing = new BillingService($repo);
    $invoice = $billing->createInvoice('acme');
    $billing->addLine($invoice->id, 'Consulting', Money::of($amount));
    $billing->issue($invoice->id, new DateTimeImmutable('2026-01-01'));
    return [$repo, $billing, $invoice];
}

function test_hidden_fee_is_a_separate_issued_invoice(): void
{
    [$repo, $billing, $invoice] = hidden_fee_setup('1000.00');
    $fee = $billing->applyLateFee($invoice->id, new DateTimeImmutable('2026-03-01'));
    assert_same(true, $fee instanceof Invoice, 'fee is an Invoice');
    assert_same(true, str_starts_with($fee->id, 'FEE-'), 'fee id prefix');
    assert_same('acme', $fee->customer);
    assert_same($invoice->id, $fee->relatedInvoiceId);
    assert_same('issued', $fee->status);
    assert_same(2000, $fee->total()->inCents(), '2% of 1000.00');
    assert_same(100000, $repo->get($invoice->id)->total()->inCents(), 'overdue invoice unchanged');
    assert_same(1, count($repo->get($invoice->id)->lines()), 'overdue invoice lines unchanged');
    assert_same($fee, $repo->get($fee->id), 'fee saved');
}

function test_hidden_fee_has_a_minimum(): void
{
    [, $billing, $invoice] = hidden_fee_setup('100.00');
    assert_same(500, $billing->applyLateFee($invoice->id, new DateTimeImmutable('2026-03-01'))->total()->inCents());
}

function test_hidden_only_overdue_unpaid_invoices(): void
{
    [, $billing, $invoice] = hidden_fee_setup('100.00');
    assert_throws('invoice_not_overdue', fn () => $billing->applyLateFee($invoice->id, new DateTimeImmutable('2026-01-15')));
    $billing->markPaid($invoice->id);
    assert_throws('invoice_already_paid', fn () => $billing->applyLateFee($invoice->id, new DateTimeImmutable('2026-03-01')));
}
