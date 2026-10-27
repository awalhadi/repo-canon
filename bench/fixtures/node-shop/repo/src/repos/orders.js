'use strict';

const db = require('../db');

function insert(order) {
  const id = db.newId('ord');
  const row = { id, ...order };
  db.table('orders').set(id, row);
  return { ...row };
}

function get(id) {
  const row = db.table('orders').get(id);
  return row ? { ...row, lines: row.lines.map(l => ({ ...l })) } : null;
}

function update(id, changes) {
  const row = db.table('orders').get(id);
  Object.assign(row, changes);
  return get(id);
}

module.exports = { insert, get, update };
