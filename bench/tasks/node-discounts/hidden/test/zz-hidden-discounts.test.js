'use strict';

const test = require('node:test');
const assert = require('node:assert');
const shop = require('../src');

test.beforeEach(() => {
  shop.db.reset();
  shop.bus.reset();
  shop.products.add({ sku: 'lamp', name: 'Lamp', priceCents: 1999, stock: 5 });
});

test('hidden: percentage comes off the total, rounded in the shop\'s favour, stored on the order', () => {
  shop.discounts.createDiscount('SAVE10', 10);
  const order = shop.orders.placeOrder('c1', [{ sku: 'lamp', qty: 1 }], { discountCode: 'SAVE10' });
  assert.equal(order.subtotalCents, 1999);
  assert.equal(order.discountCents, 199);
  assert.equal(order.totalCents, 1800);
  assert.equal(order.discountCode, 'SAVE10');
});

test('hidden: order.placed carries the discounted total', () => {
  shop.discounts.createDiscount('HALF', 50);
  shop.orders.placeOrder('c1', [{ sku: 'lamp', qty: 2 }], { discountCode: 'HALF' });
  assert.equal(shop.bus.published.at(-1).payload.totalCents, 1999);
});

test('hidden: unknown codes fail with E_DISCOUNT_INVALID and take no stock', () => {
  assert.throws(() => shop.orders.placeOrder('c1', [{ sku: 'lamp', qty: 1 }], { discountCode: 'NOPE' }), err => {
    return err instanceof shop.errors.AppError && err.code === 'E_DISCOUNT_INVALID';
  });
  assert.equal(shop.products.get('lamp').stock, 5);
});

test('hidden: percent must be 1–100', () => {
  for (const bad of [0, 101, -5]) {
    assert.throws(() => shop.discounts.createDiscount(`X${bad}`, bad), { code: 'E_INVALID_INPUT' });
  }
});

test('hidden: no code means no discount', () => {
  const order = shop.orders.placeOrder('c1', [{ sku: 'lamp', qty: 1 }]);
  assert.equal(order.totalCents, 1999);
});
