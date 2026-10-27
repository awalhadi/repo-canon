<?php
declare(strict_types=1);

namespace Billing;

final class CreditNote
{
    public function __construct(
        public readonly string $id,
        public readonly string $invoiceId,
        public readonly Money $amount,
        public readonly string $reason,
    ) {
    }
}
