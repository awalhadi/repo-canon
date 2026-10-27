<?php
declare(strict_types=1);

namespace Billing;

/** Sequential document numbers per prefix: INV-0001, INV-0002… */
final class IdGenerator
{
    private static array $counters = [];

    public static function next(string $prefix): string
    {
        self::$counters[$prefix] = (self::$counters[$prefix] ?? 0) + 1;
        return sprintf('%s-%04d', $prefix, self::$counters[$prefix]);
    }

    public static function reset(): void
    {
        self::$counters = [];
    }
}
