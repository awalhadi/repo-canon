'use strict';

const path = require('path');
const { copyDir, run, sources, result } = require('../../lib/grader');

module.exports = function check(dir) {
  copyDir(path.join(__dirname, 'hidden'), dir);
  const tests = run(dir, 'php', ['tests/run.php']);
  const src = sources(dir, 'src', /\.php$/).filter(s => s.rel !== 'src/Money.php');
  return result([
    { name: 'tests pass (visible + hidden)', ok: tests.ok, detail: tests.ok ? '' : tests.output.slice(-1500) },
    { name: 'no float math on amounts', ok: !src.some(s => /\(float\)|floatval\(|\bround\(|number_format\(|\d\.\d+\s*\*/.test(s.text)) },
    { name: 'ids only from IdGenerator', ok: !src.filter(s => s.rel !== 'src/IdGenerator.php').some(s => /['"](INV|CN|FEE)-\d|sprintf\(\s*['"](INV|CN|FEE)/.test(s.text)) }
  ]);
};
