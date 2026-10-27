'use strict';

const test = require('node:test');
const assert = require('node:assert');
const shop = require('../src');

test.beforeEach(() => {
  shop.db.reset();
  shop.bus.reset();
  shop.products.add({ sku: 'mug', name: 'Mug', priceCents: 1250, stock: 3 });
});

test('places an order, takes stock and announces it', () => {
  const order = shop.orders.placeOrder('c1', [{ sku: 'mug', qty: 2 }]);
  assert.equal(order.totalCents, 2500);
  assert.equal(shop.products.get('mug').stock, 1);
  assert.deepEqual(shop.bus.published.map(e => e.event), ['order.placed']);
});

test('refuses more than the stock', () => {
  assert.throws(() => shop.orders.placeOrder('c1', [{ sku: 'mug', qty: 9 }]), { code: 'E_OUT_OF_STOCK' });
});
