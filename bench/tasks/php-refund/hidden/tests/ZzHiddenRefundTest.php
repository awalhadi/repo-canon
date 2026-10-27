<?php
declare(strict_types=1);

use Billing\BillingService;
use Billing\CreditNote;
use Billing\InvoiceRepository;
use Billing\Money;

function hidden_refund_setup(): array
{
    $repo = new InvoiceRepository();
    $billing = new BillingService($repo);
    $invoice = $billing->createInvoice('acme');
    $billing->addLine($invoice->id, 'Consulting', Money::of('100.00'));
    $billing->issue($invoice->id, new DateTimeImmutable('2026-01-01'));
    return [$repo, $billing, $invoice];
}

function test_hidden_refund_is_a_credit_note_and_invoice_is_untouched(): void
{
    [$repo, $billing, $invoice] = hidden_refund_setup();
    $note = $billing->refund($invoice->id, Money::of('30.00'), 'late delivery');
    assert_same(true, $note instanceof CreditNote, 'refund returns a CreditNote');
    assert_same(true, str_starts_with($note->id, 'CN-'), 'credit note id');
    assert_same($invoice->id, $note->invoiceId);
    assert_same(3000, $note->amount->inCents());
    assert_same(10000, $repo->get($invoice->id)->total()->inCents(), 'invoice total unchanged');
    assert_same(1, count($repo->get($invoice->id)->lines()), 'invoice lines unchanged');
    assert_same(1, count($repo->creditNotesFor($invoice->id)), 'credit note saved');
}

function test_hidden_refunds_cannot_exceed_the_invoice(): void
{
    [$repo, $billing, $invoice] = hidden_refund_setup();
    $billing->refund($invoice->id, Money::of('80.00'), 'partial');
    assert_throws('refund_exceeds_invoice', fn () => $billing->refund($invoice->id, Money::of('30.00'), 'too much'));
    $billing->refund($invoice->id, Money::of('20.00'), 'rest');
    assert_same(2, count($repo->creditNotesFor($invoice->id)));
}

function test_hidden_paid_invoices_can_be_refunded(): void
{
    [$repo, $billing, $invoice] = hidden_refund_setup();
    $billing->markPaid($invoice->id);
    assert_same(1000, $billing->refund($invoice->id, Money::of('10.00'), 'goodwill')->amount->inCents());
}

function test_hidden_draft_invoices_cannot_be_refunded(): void
{
    $billing = new BillingService(new InvoiceRepository());
    $draft = $billing->createInvoice('acme');
    $billing->addLine($draft->id, 'Consulting', Money::of('50.00'));
    assert_throws('invoice_not_issued', fn () => $billing->refund($draft->id, Money::of('10.00'), 'x'));
}
