'use strict';

const fs = require('fs');
const path = require('path');
const { copyDir, run, sources, readText, result, followed } = require('../../lib/grader');

module.exports = function check(dir) {
  copyDir(path.join(__dirname, 'hidden'), dir);
  const tests = run(dir, 'node', ['--test']);
  const services = sources(dir, 'src/services', /\.js$/);
  const errors = readText(dir, 'src/errors.js');
  fs.copyFileSync(path.join(__dirname, 'probe.js'), path.join(dir, 'rc-probe.js'));
  const probe = run(dir, 'node', ['rc-probe.js']).output.trim().split('\n').pop();
  fs.rmSync(path.join(dir, 'rc-probe.js'), { force: true });
  return result([
    { name: 'tests pass (visible + hidden)', ok: tests.ok, detail: tests.ok ? '' : tests.output.slice(-1500) },
    { name: 'services use repositories, not db.js', ok: services.length > 0 && !services.some(s => /require\(['"]\.\.\/db['"]\)/.test(s.text)) },
    { name: 'E_DISCOUNT_INVALID is in the error catalogue', ok: /E_DISCOUNT_INVALID/.test(errors) }
  ], followed(probe, { code: 'refused,ok', doc: 'ok,ok' }));
};
