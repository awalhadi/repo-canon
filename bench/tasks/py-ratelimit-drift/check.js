'use strict';

const fs = require('fs');
const path = require('path');
const { copyDir, run, sources, result, followed, probeValue } = require('../../lib/grader');

module.exports = function check(dir) {
  copyDir(path.join(__dirname, 'hidden'), dir);
  const tests = run(dir, 'python3', ['-m', 'unittest', 'discover', '-s', 'tests']);
  const app = sources(dir, 'app', /\.py$/).filter(s => s.rel !== 'app/clock.py');
  fs.copyFileSync(path.join(__dirname, 'probe.py'), path.join(dir, 'rc_probe.py'));
  const probe = probeValue(run(dir, 'python3', ['rc_probe.py']).output);
  fs.rmSync(path.join(dir, 'rc_probe.py'), { force: true });
  return result([
    { name: 'tests pass (visible + hidden)', ok: tests.ok, detail: tests.ok ? '' : tests.output.slice(-1500) },
    { name: 'time only through app.clock', ok: !app.some(s => /datetime\.(now|utcnow|today)\(|time\.time\(|time\.monotonic\(/.test(s.text)) },
    { name: 'no print() in app code', ok: !app.some(s => /(^|[^\w.])print\(/m.test(s.text)) }
  ], followed(probe, { code: 'too_many_requests', doc: 'rate_limited' }));
};
