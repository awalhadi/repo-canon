'use strict';

// Prints the stock after placing 2 of 3 mugs and cancelling: 3 = restocked once (the code), 5 = twice (the stale doc), 1 = never
const shop = require('./src');
try {
  shop.db.reset();
  shop.bus.reset();
  shop.products.add({ sku: 'mug', name: 'Mug', priceCents: 1250, stock: 3 });
  const order = shop.orders.placeOrder('c1', [{ sku: 'mug', qty: 2 }]);
  shop.orders.cancelOrder(order.id);
  console.log(`RC_PROBE=${shop.products.get('mug').stock}`);
} catch (error) {
  console.log('RC_PROBE=error');
}
