<?php
declare(strict_types=1);

namespace Billing;

final class Invoice
{
    public string $status = 'draft';
    public ?\DateTimeImmutable $dueDate = null;
    public ?string $relatedInvoiceId = null;
    /** @var array<int, array{description: string, amount: Money}> */
    private array $lines = [];

    public function __construct(public readonly string $id, public readonly string $customer)
    {
    }

    public function addLine(string $description, Money $amount): void
    {
        if ($this->status !== 'draft') {
            throw new DomainError('invoice_not_editable', "$this->id is $this->status");
        }
        $this->lines[] = ['description' => $description, 'amount' => $amount];
    }

    /** @return array<int, array{description: string, amount: Money}> */
    public function lines(): array
    {
        return $this->lines;
    }

    public function total(): Money
    {
        return Money::sum(...array_map(fn (array $line) => $line['amount'], $this->lines));
    }
}
