Customers can now enter a discount code at checkout.

- Add `createDiscount(code, percent)` in `src/services/discounts.js` and export the module from `src/index.js` as `discounts`.
- `placeOrder(customerId, items, { discountCode })` takes an optional third argument; when a code is given, the order total gets that percentage off.
- Keep `npm test` green and add tests for the new behaviour.
