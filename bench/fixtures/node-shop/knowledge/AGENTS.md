# AGENTS.md — node-shop

Order service for the Acme web shop. Plain Node.js, no dependencies.

## Commands
- Test: `npm test` (node --test)

## Layout
```
src/
  index.js          public exports
  money.js          amount helpers (integer cents)
  errors.js         error catalogue + fail()
  db.js             in-memory tables
  bus.js            domain events
  repos/            data access (products, orders)
  services/         business logic (orders)
test/
```

## Rules
- Money is always integer cents. Never use floats for amounts; use `money.js` (`percentOf`, `sum`). Percentages are applied with `money.percentOf`, which rounds the discount **down** (finance rule: the shop never gives away a fraction of a cent).
- Services never touch `db.js` directly. All reads and writes go through a repository in `src/repos/` — add a repo for a new table.
- Every failure is an `AppError` thrown with `fail(ERRORS.X, message)`. New failure kinds get a code in the `ERRORS` catalogue in `src/errors.js`, named `E_<NOUN>_<PROBLEM>`.
- Domain events are published on `bus` **after** the data is saved, named `<entity>.<past-tense verb>`. Every `order.*` event carries `orderId` plus the money it moved in cents: `order.placed` → `totalCents`, `order.cancelled` → `refundCents`.
- Order status flow: `placed` → `shipped`. Only a `placed` order can be cancelled; any other status fails with `E_ORDER_NOT_CANCELLABLE`. Cancelling puts the stock back.

## Decisions
- Discount codes: an unknown, expired or used-up code always fails with the same code, `E_DISCOUNT_INVALID`, so attackers can't probe which codes exist. A discount is stored on the order as `discountCode` and `discountCents`; `totalCents` = `subtotalCents` − `discountCents`. Valid percentages are 1–100 (`E_INVALID_INPUT` otherwise).
