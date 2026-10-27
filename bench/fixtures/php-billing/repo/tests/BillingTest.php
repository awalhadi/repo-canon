<?php
declare(strict_types=1);

use Billing\BillingService;
use Billing\InvoiceRepository;
use Billing\Money;

function test_issue_sets_due_date_and_locks_invoice(): void
{
    $billing = new BillingService(new InvoiceRepository());
    $invoice = $billing->createInvoice('acme');
    $billing->addLine($invoice->id, 'Consulting', Money::of('100.00'));
    $billing->issue($invoice->id, new DateTimeImmutable('2026-01-01'));
    assert_same('INV-0001', $invoice->id);
    assert_same('2026-01-31', $invoice->dueDate->format('Y-m-d'));
    assert_throws('invoice_not_editable', fn () => $billing->addLine($invoice->id, 'Extra', Money::of('1.00')));
}

function test_money_is_exact(): void
{
    assert_same('0.30', Money::of('0.10')->plus(Money::of('0.20'))->format());
    assert_same(250, Money::of('100.00')->percent(250)->inCents());
}
