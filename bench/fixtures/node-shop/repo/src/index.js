'use strict';

module.exports = {
  orders: require('./services/orders'),
  products: require('./repos/products'),
  errors: require('./errors'),
  bus: require('./bus'),
  db: require('./db')
};
