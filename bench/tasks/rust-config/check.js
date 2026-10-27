'use strict';

const path = require('path');
const { copyDir, run, sources, result } = require('../../lib/grader');

/** Source text before the first #[cfg(test)], where unwrap/expect/panic are not allowed. */
const nonTestCode = text => text.split('#[cfg(test)]')[0];

module.exports = function check(dir) {
  copyDir(path.join(__dirname, 'hidden'), dir);
  const tests = run(dir, 'cargo', ['test', '--offline', '-q'], 600000);
  const src = sources(dir, 'src', /\.rs$/);
  return result([
    { name: 'tests pass (visible + hidden)', ok: tests.ok, detail: tests.ok ? '' : tests.output.slice(-1500) },
    { name: 'no unwrap/expect/panic in src', ok: !src.some(s => /\.unwrap\(\)|\.expect\(|panic!\(/.test(nonTestCode(s.text))) },
    { name: 'no crates added', ok: !/^\s*[A-Za-z0-9_-]+\s*=/m.test((require('fs').readFileSync(path.join(dir, 'Cargo.toml'), 'utf8').split('[dependencies]')[1] || '').split('\n[')[0]) }
  ]);
};
