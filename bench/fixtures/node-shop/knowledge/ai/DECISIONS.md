---
verified_at:
---
# Decisions
> 3–5 lines each. Newest on top.

## D-002 Discount codes fail with one code (2026-09-14)
- Decision: an unknown, expired or used-up code always fails with `E_DISCOUNT_INVALID`. The order stores `discountCode` and `discountCents`; `totalCents` = `subtotalCents` − `discountCents`. Percentages are 1–100 (`E_INVALID_INPUT` otherwise).
- Why: distinct errors let attackers probe which codes exist.
- Revisit if: codes become per-customer.

## D-001 Only placed orders can be cancelled (2026-08-02)
- Decision: status flow is `placed` → `shipped`; cancelling any non-`placed` order fails with `E_ORDER_NOT_CANCELLABLE`. Cancelling restores stock.
- Why: shipped goods come back through returns, not cancellation.
- Revisit if: we add a returns flow.
