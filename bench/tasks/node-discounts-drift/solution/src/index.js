'use strict';

module.exports = {
  orders: require('./services/orders'),
  discounts: require('./services/discounts'),
  products: require('./repos/products'),
  errors: require('./errors'),
  bus: require('./bus'),
  db: require('./db')
};
