<?php
declare(strict_types=1);

namespace Billing;

final class InvoiceRepository
{
    /** @var array<string, Invoice> */
    private array $invoices = [];
    /** @var array<string, CreditNote> */
    private array $creditNotes = [];

    public function save(Invoice $invoice): void
    {
        $this->invoices[$invoice->id] = $invoice;
    }

    public function get(string $id): Invoice
    {
        return $this->invoices[$id] ?? throw new DomainError('invoice_not_found', $id);
    }

    /** @return Invoice[] */
    public function all(): array
    {
        return array_values($this->invoices);
    }

    public function saveCreditNote(CreditNote $note): void
    {
        $this->creditNotes[$note->id] = $note;
    }

    /** @return CreditNote[] */
    public function creditNotesFor(string $invoiceId): array
    {
        return array_values(array_filter($this->creditNotes, fn (CreditNote $n) => $n->invoiceId === $invoiceId));
    }
}
