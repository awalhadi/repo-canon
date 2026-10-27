'use strict';

const test = require('node:test');
const assert = require('node:assert');
const shop = require('../src');

test.beforeEach(() => {
  shop.db.reset();
  shop.bus.reset();
  shop.products.add({ sku: 'mug', name: 'Mug', priceCents: 1250, stock: 3 });
});

test('hidden: cancelling a placed order restores stock and sets the status', () => {
  const order = shop.orders.placeOrder('c1', [{ sku: 'mug', qty: 2 }]);
  const cancelled = shop.orders.cancelOrder(order.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(shop.products.get('mug').stock, 3);
});

test('hidden: order.cancelled is published with orderId and refundCents', () => {
  const order = shop.orders.placeOrder('c1', [{ sku: 'mug', qty: 2 }]);
  shop.orders.cancelOrder(order.id);
  const event = shop.bus.published.at(-1);
  assert.equal(event.event, 'order.cancelled');
  assert.deepEqual({ orderId: event.payload.orderId, refundCents: event.payload.refundCents }, { orderId: order.id, refundCents: 2500 });
});

test('hidden: shipped or already cancelled orders fail with E_ORDER_NOT_CANCELLABLE', () => {
  const shipped = shop.orders.placeOrder('c1', [{ sku: 'mug', qty: 1 }]);
  shop.orders.markShipped(shipped.id);
  assert.throws(() => shop.orders.cancelOrder(shipped.id), { code: 'E_ORDER_NOT_CANCELLABLE' });
  const twice = shop.orders.placeOrder('c1', [{ sku: 'mug', qty: 1 }]);
  shop.orders.cancelOrder(twice.id);
  assert.throws(() => shop.orders.cancelOrder(twice.id), { code: 'E_ORDER_NOT_CANCELLABLE' });
  assert.equal(shop.products.get('mug').stock, 2);
});

test('hidden: unknown orders fail with E_ORDER_NOT_FOUND', () => {
  assert.throws(() => shop.orders.cancelOrder('ord_404'), { code: 'E_ORDER_NOT_FOUND' });
});
