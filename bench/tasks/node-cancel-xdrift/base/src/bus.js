'use strict';

const published = [];
const handlers = new Map();
// App-wide listeners, registered once at startup; reset() keeps them
const system = new Map();

function publish(event, payload) {
  published.push({ event, payload });
  for (const handler of [...(system.get(event) || []), ...(handlers.get(event) || [])]) handler(payload);
}

function subscribe(event, handler) {
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event).push(handler);
}

function subscribeSystem(event, handler) {
  if (!system.has(event)) system.set(event, []);
  system.get(event).push(handler);
}

function reset() {
  published.length = 0;
  handlers.clear();
}

module.exports = { publish, subscribe, subscribeSystem, published, reset };
