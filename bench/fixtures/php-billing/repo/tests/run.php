<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

function assert_same(mixed $expected, mixed $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        throw new \RuntimeException(($message ? "$message: " : '') . 'expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

function assert_throws(string $reason, callable $fn): void
{
    try {
        $fn();
    } catch (\Billing\DomainError $e) {
        assert_same($reason, $e->reason, 'DomainError reason');
        return;
    }
    throw new \RuntimeException("expected DomainError $reason");
}

$files = glob(__DIR__ . '/*Test.php');
sort($files);
$failed = 0;
$passed = 0;
foreach ($files as $file) {
    $before = get_defined_functions()['user'];
    require $file;
    foreach (array_diff(get_defined_functions()['user'], $before) as $fn) {
        if (!str_starts_with($fn, 'test_')) {
            continue;
        }
        \Billing\IdGenerator::reset();
        try {
            $fn();
            $passed++;
        } catch (\Throwable $e) {
            $failed++;
            echo "FAIL $fn: {$e->getMessage()}\n";
        }
    }
}
echo "$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
