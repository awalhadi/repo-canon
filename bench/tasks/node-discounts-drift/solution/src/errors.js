'use strict';

const ERRORS = {
  INVALID_INPUT: 'E_INVALID_INPUT',
  PRODUCT_NOT_FOUND: 'E_PRODUCT_NOT_FOUND',
  OUT_OF_STOCK: 'E_OUT_OF_STOCK',
  ORDER_NOT_FOUND: 'E_ORDER_NOT_FOUND',
  DISCOUNT_INVALID: 'E_DISCOUNT_INVALID'
};

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function fail(code, message) {
  throw new AppError(code, message);
}

module.exports = { ERRORS, AppError, fail };
