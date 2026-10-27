---
module: orders
code_paths: [src/services/, src/repos/]
verified_at:
---
# orders

## Purpose
Placing, shipping and cancelling orders; stock moves with them.

## Invariants
- Stock changes only through `repos/products.adjustStock`.
- `order.*` events are published after `orders.insert/update`, with `orderId` and the money moved in cents.
- Status flow `placed` → `shipped`; only `placed` can be cancelled (`E_ORDER_NOT_CANCELLABLE`).

## Code map
- `src/services/orders.js` — `placeOrder`, `markShipped`
- `src/repos/orders.js`, `src/repos/products.js` — the only access to `db.js`
