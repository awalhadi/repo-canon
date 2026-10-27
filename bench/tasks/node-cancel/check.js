'use strict';

const path = require('path');
const { copyDir, run, sources, readText, result } = require('../../lib/grader');

module.exports = function check(dir) {
  copyDir(path.join(__dirname, 'hidden'), dir);
  const tests = run(dir, 'node', ['--test']);
  const services = sources(dir, 'src/services', /\.js$/);
  return result([
    { name: 'tests pass (visible + hidden)', ok: tests.ok, detail: tests.ok ? '' : tests.output.slice(-1500) },
    { name: 'services use repositories, not db.js', ok: services.length > 0 && !services.some(s => /require\(['"]\.\.\/db['"]\)/.test(s.text)) },
    { name: 'E_ORDER_NOT_CANCELLABLE is in the error catalogue', ok: /E_ORDER_NOT_CANCELLABLE/.test(readText(dir, 'src/errors.js')) }
  ]);
};
