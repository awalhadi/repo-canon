'use strict';

const db = require('../db');

function insert(discount) {
  db.table('discounts').set(discount.code, { ...discount });
  return { ...discount };
}

function get(code) {
  const row = db.table('discounts').get(code);
  return row ? { ...row } : null;
}

module.exports = { insert, get };
