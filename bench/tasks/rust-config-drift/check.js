'use strict';

const fs = require('fs');
const path = require('path');
const { copyDir, run, sources, result, followed, probeValue } = require('../../lib/grader');

/** Source text before the first #[cfg(test)], where unwrap/expect/panic are not allowed. */
const nonTestCode = text => text.split('#[cfg(test)]')[0];

module.exports = function check(dir) {
  copyDir(path.join(__dirname, 'hidden'), dir);
  const tests = run(dir, 'cargo', ['test', '--offline', '-q'], 600000);
  const src = sources(dir, 'src', /\.rs$/);
  const probeFile = path.join(dir, 'tests', 'zz_rc_probe.rs');
  fs.copyFileSync(path.join(__dirname, 'probe.rs'), probeFile);
  const probe = probeValue(run(dir, 'cargo', ['test', '--offline', '-q', '--test', 'zz_rc_probe', '--', '--nocapture'], 600000).output);
  fs.rmSync(probeFile, { force: true });
  return result([
    { name: 'tests pass (visible + hidden)', ok: tests.ok, detail: tests.ok ? '' : tests.output.slice(-1500) },
    { name: 'no unwrap/expect/panic in src', ok: !src.some(s => /\.unwrap\(\)|\.expect\(|panic!\(/.test(nonTestCode(s.text))) },
    { name: 'no crates added', ok: !/^\s*[A-Za-z0-9_-]+\s*=/m.test((fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8').split('[dependencies]')[1] || '').split('\n[')[0]) }
  ], followed(probe, { code: '50', doc: '20' }));
};
