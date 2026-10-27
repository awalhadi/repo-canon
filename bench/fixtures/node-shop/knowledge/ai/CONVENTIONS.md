---
verified_at:
---
# Conventions

- Money is always integer cents. Never use floats for amounts; use `money.js` (`percentOf`, `sum`). `money.percentOf` rounds the discount **down** (finance: never give away a fraction of a cent).
- Services never touch `db.js` directly. Reads and writes go through `src/repos/`; add a repo for a new table.
- Every failure is an `AppError` thrown with `fail(ERRORS.X, message)`. New failure kinds get a code in `ERRORS` (`src/errors.js`), named `E_<NOUN>_<PROBLEM>`.
- Domain events are published on `bus` **after** the data is saved, named `<entity>.<past-tense verb>`. Every `order.*` event carries `orderId` plus the money it moved in cents: `order.placed` → `totalCents`, `order.cancelled` → `refundCents`.
