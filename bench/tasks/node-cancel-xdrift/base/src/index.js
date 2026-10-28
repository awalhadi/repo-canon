'use strict';

const bus = require('./bus');
const warehouse = require('./warehouse/listeners');

warehouse.register(bus);

module.exports = {
  orders: require('./services/orders'),
  products: require('./repos/products'),
  warehouse,
  errors: require('./errors'),
  bus,
  db: require('./db')
};
