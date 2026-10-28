'use strict';

// The warehouse reacts to order events.
const shipments = [];

function register(bus) {
  bus.subscribeSystem('order.shipped', ({ orderId }) => {
    shipments.push({ orderId });
  });
}

module.exports = { register, shipments };
