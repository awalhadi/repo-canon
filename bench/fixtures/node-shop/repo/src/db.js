'use strict';

const tables = { products: new Map(), orders: new Map() };
let nextId = 1;

function table(name) {
  if (!tables[name]) tables[name] = new Map();
  return tables[name];
}

function newId(prefix) {
  return `${prefix}_${nextId++}`;
}

function reset() {
  for (const t of Object.values(tables)) t.clear();
  nextId = 1;
}

module.exports = { table, newId, reset };
