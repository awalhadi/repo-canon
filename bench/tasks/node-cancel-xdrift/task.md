Support team needs to cancel orders.

- Add `cancelOrder(orderId)` to `src/services/orders.js` (exported next to `placeOrder`) and return the updated order.
- Other parts of the system need to know when an order is cancelled.
- Keep `npm test` green and add tests for the new behaviour.
