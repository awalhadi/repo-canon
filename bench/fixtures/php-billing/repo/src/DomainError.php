<?php
declare(strict_types=1);

namespace Billing;

final class DomainError extends \RuntimeException
{
    public function __construct(public readonly string $reason, string $message = '')
    {
        parent::__construct($message ?: $reason);
    }
}
