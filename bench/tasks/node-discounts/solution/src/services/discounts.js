'use strict';

const discounts = require('../repos/discounts');
const { ERRORS, fail } = require('../errors');

function createDiscount(code, percent) {
  if (!code || !Number.isInteger(percent) || percent < 1 || percent > 100) fail(ERRORS.INVALID_INPUT, 'percent must be 1–100');
  return discounts.insert({ code, percent });
}

function findValid(code) {
  const discount = discounts.get(code);
  if (!discount) fail(ERRORS.DISCOUNT_INVALID, 'discount code is not valid');
  return discount;
}

module.exports = { createDiscount, findValid };
