<?php
declare(strict_types=1);

namespace Billing;

final class BillingService
{
    public const PAYMENT_TERMS_DAYS = 30;

    public function __construct(private readonly InvoiceRepository $invoices)
    {
    }

    public function createInvoice(string $customer): Invoice
    {
        $invoice = new Invoice(IdGenerator::next('INV'), $customer);
        $this->invoices->save($invoice);
        return $invoice;
    }

    public function addLine(string $invoiceId, string $description, Money $amount): Invoice
    {
        $invoice = $this->invoices->get($invoiceId);
        $invoice->addLine($description, $amount);
        $this->invoices->save($invoice);
        return $invoice;
    }

    public function issue(string $invoiceId, \DateTimeImmutable $today): Invoice
    {
        $invoice = $this->invoices->get($invoiceId);
        if ($invoice->status !== 'draft') {
            throw new DomainError('invoice_already_issued', $invoiceId);
        }
        if ($invoice->total()->isZero()) {
            throw new DomainError('invoice_empty', $invoiceId);
        }
        $invoice->status = 'issued';
        $invoice->dueDate = $today->modify('+' . self::PAYMENT_TERMS_DAYS . ' days');
        $this->invoices->save($invoice);
        return $invoice;
    }

    public function markPaid(string $invoiceId): Invoice
    {
        $invoice = $this->invoices->get($invoiceId);
        if ($invoice->status !== 'issued') {
            throw new DomainError('invoice_not_payable', $invoiceId);
        }
        $invoice->status = 'paid';
        $this->invoices->save($invoice);
        return $invoice;
    }
}
