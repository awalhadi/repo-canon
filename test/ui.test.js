'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const cp = require('node:child_process');

const { createUi, shouldColor, shouldUseUnicode, strip } = require('../src/cli/ui');
const { parseArgs } = require('../src/cli/args');
const { suggestCommand } = require('../src/cli/help');

const CLI = path.join(__dirname, '..', 'bin', 'repocanon.js');
const sink = () => {
  let text = '';
  return { stream: { isTTY: false, write: chunk => { text += chunk; } }, text: () => text };
};

test('ui: colour only on a TTY, never with NO_COLOR/--no-color/TERM=dumb, always with FORCE_COLOR', () => {
  assert.equal(shouldColor({ isTTY: true }, { env: {} }), true);
  assert.equal(shouldColor({ isTTY: false }, { env: {} }), false);
  assert.equal(shouldColor({ isTTY: true }, { env: { NO_COLOR: '' } }), false);
  assert.equal(shouldColor({ isTTY: true }, { env: {}, noColor: true }), false);
  assert.equal(shouldColor({ isTTY: true }, { env: { TERM: 'dumb' } }), false);
  assert.equal(shouldColor({ isTTY: false }, { env: { FORCE_COLOR: '1' } }), true);
  assert.equal(shouldUseUnicode({ env: {}, platform: 'linux' }), true);
  assert.equal(shouldUseUnicode({ env: {}, platform: 'win32' }), false);
  assert.equal(shouldUseUnicode({ env: { WT_SESSION: '1' }, platform: 'win32' }), true);
});

test('ui: header, rows, aligned tables with colour, meter, verdict, next steps', () => {
  const out = sink();
  const ui = createUi({ stream: out.stream, color: true, unicode: true, columns: 0 });
  ui.header('status', 'shop');
  ui.table([[ui.c.green('fresh'), 'a.md'], ['stale', 'bb.md']]);
  ui.meter('Freshness', 82);
  ui.verdict({ warnings: 1 });
  ui.next([['repocanon sync', 'see what changed'], ['repocanon stamp x', 'after re-checking']]);
  const plain = strip(out.text());
  assert.ok(out.text().includes('\x1b['));
  assert.deepEqual(plain.split('\n').slice(0, 4), ['◆ repocanon status · shop', '', '  fresh  a.md', '  stale  bb.md']);
  assert.match(plain, /Freshness ████████░░ 82\/100/);
  assert.match(plain, /\n! 1 warning\n/);
  assert.match(plain, /Next\n  repocanon sync     see what changed\n  repocanon stamp x  after re-checking/);

  const ascii = sink();
  const plainUi = createUi({ stream: ascii.stream, color: false, unicode: false });
  plainUi.meter('Freshness', 40);
  plainUi.verdict({});
  assert.equal(ascii.text(), 'Freshness ####------ 40/100\n\nok All good\n');
});

test('ui: long details are cut to the terminal width, never in logs', () => {
  const tty = sink();
  createUi({ stream: tty.stream, color: false, columns: 30 }).row('✓', 'doc.md', 'a very long detail that goes on and on');
  assert.equal(strip(tty.text()).trimEnd().length <= 30, true);
  assert.match(tty.text(), /…/);
  const log = sink();
  createUi({ stream: log.stream, color: false, columns: 0 }).row('✓', 'doc.md', 'a very long detail that goes on and on');
  assert.match(log.text(), /goes on and on/);
});

test('args: boolean flags never swallow the next word', () => {
  assert.deepEqual(parseArgs(['stamp', '--force', 'billing']).args, ['billing']);
  assert.equal(parseArgs(['--no-color', 'status']).command, 'status');
  assert.equal(parseArgs(['status', '--no-color']).noColor, true);
  assert.equal(parseArgs(['sync', '--since', 'HEAD~2']).options.since, 'HEAD~2');
});

test('help: grouped overview, per-command help, did-you-mean', () => {
  const { FORCE_COLOR, ...env } = process.env;                                   // npm publish sets it
  const run = (...args) => cp.spawnSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...env, NO_COLOR: '1' } });
  const overview = run('--help').stdout;
  assert.match(overview, /^Start\n  init /m);
  assert.match(overview, /^For your AI agents\n/m);
  assert.doesNotMatch(overview, /agent-hook/);                                   // internal command stays out
  const status = run('status', '--help').stdout;
  assert.match(status, /Usage  repocanon status \[--ci\] \[--json\]/);
  assert.match(status, /Examples\n  npx repocanon status/);
  assert.equal(run('help', 'sync').stdout.split('\n')[0].startsWith('◆ repocanon sync'), true);
  assert.equal(suggestCommand('stauts'), 'status');
  assert.equal(suggestCommand('zzzzzz'), null);
  const bad = run('stauts');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /✗ unknown command "stauts"\n  → did you mean `repocanon status`\?/);
  assert.doesNotMatch(run('--help').stdout, /\x1b\[/);                            // piped: no colour
});
