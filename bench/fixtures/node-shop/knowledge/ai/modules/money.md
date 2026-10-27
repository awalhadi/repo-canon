---
module: money
code_paths: [src/money.js]
verified_at:
---
# money

## Purpose
All amount arithmetic, in integer cents.

## Invariants
- `percentOf` rounds down; discounts use it so the customer never gets a fraction of a cent.
- `assertCents` rejects floats and negatives; call it on any amount from outside.
