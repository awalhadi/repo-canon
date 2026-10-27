'use strict';

const published = [];
const handlers = new Map();

function publish(event, payload) {
  published.push({ event, payload });
  for (const handler of handlers.get(event) || []) handler(payload);
}

function subscribe(event, handler) {
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event).push(handler);
}

function reset() {
  published.length = 0;
  handlers.clear();
}

module.exports = { publish, subscribe, published, reset };
