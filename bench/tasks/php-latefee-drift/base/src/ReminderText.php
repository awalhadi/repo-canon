<?php
declare(strict_types=1);

namespace Billing;

/** The payment-reminder sentence customers see before an invoice is overdue. */
final class ReminderText
{
    public static function forInvoice(Invoice $invoice): string
    {
        $percent = LateFeePolicy::RATE_BASIS_POINTS / 100;
        $minimum = Money::cents(LateFeePolicy::MINIMUM_CENTS);
        return "Invoice $invoice->id is due on {$invoice->dueDate->format('Y-m-d')}. "
            . "After that a late fee of $percent% (at least {$minimum->format()}) applies.";
    }
}
