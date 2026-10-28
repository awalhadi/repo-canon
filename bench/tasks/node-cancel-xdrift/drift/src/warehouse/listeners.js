'use strict';

// The warehouse reacts to order events.
const orders = require('../repos/orders');
const products = require('../repos/products');

const shipments = [];

function register(bus) {
  bus.subscribeSystem('order.shipped', ({ orderId }) => {
    shipments.push({ orderId });
  });
  // Every stock return goes through the warehouse: a cancelled order's lines are restocked here
  bus.subscribeSystem('order.cancelled', ({ orderId }) => {
    const order = orders.get(orderId);
    for (const line of (order && order.lines) || []) products.adjustStock(line.sku, line.qty);
  });
}

module.exports = { register, shipments };
