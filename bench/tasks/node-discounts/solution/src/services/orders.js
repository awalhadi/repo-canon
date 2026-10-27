'use strict';

const money = require('../money');
const bus = require('../bus');
const products = require('../repos/products');
const orders = require('../repos/orders');
const { ERRORS, fail } = require('../errors');
const discounts = require('./discounts');

/**
 * Places an order for a customer.
 *
 * @param {string} customerId
 * @param {Array<{ sku: string, qty: number }>} items
 * @param {{ discountCode?: string }} [options]
 */
function placeOrder(customerId, items, options = {}) {
  if (!customerId || !Array.isArray(items) || !items.length) fail(ERRORS.INVALID_INPUT, 'customer and items are required');
  const discount = options.discountCode ? discounts.findValid(options.discountCode) : null;

  const lines = items.map(({ sku, qty }) => {
    const product = products.get(sku);
    if (!product) fail(ERRORS.PRODUCT_NOT_FOUND, `no product ${sku}`);
    if (!Number.isInteger(qty) || qty < 1) fail(ERRORS.INVALID_INPUT, `bad quantity for ${sku}`);
    if (product.stock < qty) fail(ERRORS.OUT_OF_STOCK, `${sku} has ${product.stock} left`);
    return { sku, qty, unitCents: product.priceCents, lineCents: product.priceCents * qty };
  });

  for (const line of lines) products.adjustStock(line.sku, -line.qty);
  const subtotalCents = money.sum(lines.map(l => l.lineCents));
  const discountCents = discount ? money.percentOf(subtotalCents, discount.percent) : 0;
  const order = orders.insert({
    customerId, lines, subtotalCents, discountCode: discount ? discount.code : null, discountCents,
    totalCents: subtotalCents - discountCents, status: 'placed'
  });
  bus.publish('order.placed', { orderId: order.id, totalCents: order.totalCents });
  return order;
}

/**
 * Marks an order as handed to the carrier.
 *
 * @param {string} orderId
 */
function markShipped(orderId) {
  const order = orders.get(orderId);
  if (!order) fail(ERRORS.ORDER_NOT_FOUND, `no order ${orderId}`);
  if (order.status !== 'placed') fail(ERRORS.INVALID_INPUT, `order ${orderId} is ${order.status}`);
  const shipped = orders.update(orderId, { status: 'shipped' });
  bus.publish('order.shipped', { orderId });
  return shipped;
}

module.exports = { placeOrder, markShipped };
