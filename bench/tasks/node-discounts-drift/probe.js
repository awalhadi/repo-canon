'use strict';

// Prints whether a 60% and a 50% discount are accepted: which cap the code applies
const shop = require('./src');
const out = [60, 50].map(percent => {
  try {
    shop.discounts.createDiscount(`RCPROBE${percent}`, percent);
    return 'ok';
  } catch (error) {
    return error && error.code === 'E_INVALID_INPUT' ? 'refused' : 'error';
  }
});
console.log(`RC_PROBE=${out.join(',')}`);
