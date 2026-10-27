<?php
declare(strict_types=1);

namespace Billing;

/** Integer cents in one currency. Immutable. */
final class Money
{
    private function __construct(private readonly int $cents)
    {
    }

    public static function cents(int $cents): self
    {
        return new self($cents);
    }

    /** From a decimal string such as "12.34". */
    public static function of(string $amount): self
    {
        if (!preg_match('/^(-?)(\d+)(?:\.(\d{1,2}))?$/', $amount, $m)) {
            throw new \InvalidArgumentException("not an amount: $amount");
        }
        $cents = (int) $m[2] * 100 + (int) str_pad($m[3] ?? '0', 2, '0');
        return new self($m[1] === '-' ? -$cents : $cents);
    }

    public function plus(Money $other): self
    {
        return new self($this->cents + $other->cents);
    }

    public function minus(Money $other): self
    {
        return new self($this->cents - $other->cents);
    }

    /** Percentage in basis points (250 = 2.5%), rounded down to the cent. */
    public function percent(int $basisPoints): self
    {
        return new self(intdiv($this->cents * $basisPoints, 10000));
    }

    public function max(Money $other): self
    {
        return $this->cents >= $other->cents ? $this : $other;
    }

    public function greaterThan(Money $other): bool
    {
        return $this->cents > $other->cents;
    }

    public function isZero(): bool
    {
        return $this->cents === 0;
    }

    public function inCents(): int
    {
        return $this->cents;
    }

    public function format(): string
    {
        $abs = abs($this->cents);
        return ($this->cents < 0 ? '-' : '') . intdiv($abs, 100) . '.' . str_pad((string) ($abs % 100), 2, '0', STR_PAD_LEFT);
    }

    public static function sum(Money ...$amounts): self
    {
        return new self(array_sum(array_map(fn (Money $m) => $m->cents, $amounts)));
    }
}
