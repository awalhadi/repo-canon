<?php
declare(strict_types=1);

namespace Billing;

/** Late-fee terms, quoted in payment reminders. */
final class LateFeePolicy
{
    public const RATE_BASIS_POINTS = 200;
    public const MINIMUM_CENTS = 500;
}
