'use strict';

const db = require('../db');

function add({ sku, name, priceCents, stock }) {
  db.table('products').set(sku, { sku, name, priceCents, stock });
  return get(sku);
}

function get(sku) {
  const row = db.table('products').get(sku);
  return row ? { ...row } : null;
}

function adjustStock(sku, delta) {
  const row = db.table('products').get(sku);
  row.stock += delta;
  return { ...row };
}

module.exports = { add, get, adjustStock };
