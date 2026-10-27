---
verified_at:
---
# node-shop
Order service for the Acme web shop. Plain Node.js, no dependencies.

## Commands
- Test: `npm test`

## Boundaries
- `src/services/` hold business logic and call repositories; `src/repos/` are the only code that touches `src/db.js`.
- Public API is what `src/index.js` exports.
