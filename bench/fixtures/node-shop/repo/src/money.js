'use strict';

/** Amounts are integer cents everywhere. */

function assertCents(value) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`not an amount in cents: ${value}`);
  return value;
}

function percentOf(cents, percent) {
  assertCents(cents);
  return Math.floor((cents * percent) / 100);
}

function sum(amounts) {
  return amounts.reduce((total, cents) => total + assertCents(cents), 0);
}

function format(cents) {
  assertCents(cents);
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

module.exports = { assertCents, percentOf, sum, format };
