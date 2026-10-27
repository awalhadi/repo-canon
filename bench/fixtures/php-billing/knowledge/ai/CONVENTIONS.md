---
verified_at:
---
# Conventions

- Amounts are `Money` (integer cents). Never floats, `round()` or `number_format()` on amounts. Percentages are basis points: `$money->percent(200)` is 2%, rounded down.
- Document ids come only from `IdGenerator::next(<prefix>)`: `INV` invoices, `CN` credit notes, `FEE` late-fee invoices.
- Business-rule failures throw `DomainError` with a snake_case `reason`.
