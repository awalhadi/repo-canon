<?php
declare(strict_types=1);

namespace Billing;

/** Late-fee terms, quoted in payment reminders. */
final class LateFeePolicy
{
    public const RATE_BASIS_POINTS = 300;
    public const MINIMUM_CENTS = 1000;
}
