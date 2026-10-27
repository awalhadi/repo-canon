#!/usr/bin/env node
'use strict';

/**
 * Runs the commands the README shows, on a small fixture project, and prints their real
 * output. test/readme.test.js checks the README blocks against this, so the docs can't
 * drift from the CLI.
 *
 *   node scripts/readme-examples.js            print every example
 *   node scripts/readme-examples.js --color    with colour (for the SVG screenshot)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const CLI = path.resolve(__dirname, '..', 'bin', 'repocanon.js');

const git = (cwd, ...args) => cp.execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=dev', ...args], { cwd, stdio: 'pipe' });

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
}

/**
 * Commit hashes, dates and temp paths vary between runs; examples show fixed values.
 *
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return text
    .replace(/\b[0-9a-f]{7}\b/g, 'a1b2c3d')
    .replace(/\d{4}-\d{2}-\d{2}/g, '2026-10-27')
    .replace(/\/tmp\/[^\s/]+\//g, '/tmp/')
    .replace(/[ \t]+$/gm, '');
}

/**
 * Builds the fixture and runs each example.
 *
 * @param {{ color?: boolean }} [options={}]
 * @returns {Record<string, string>} example name → output
 */
function runExamples(options = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-readme-'));
  const dir = path.join(parent, 'shop');
  fs.mkdirSync(dir);
  const env = { ...process.env, NO_COLOR: options.color ? undefined : '1', FORCE_COLOR: options.color ? '1' : undefined };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  const run = (...args) => {
    const result = cp.spawnSync('node', [CLI, ...args], { cwd: dir, env, encoding: 'utf8' });
    return normalize(`${result.stdout}${result.stderr}`).trimEnd();
  };

  writeFiles(dir, {
    'package.json': JSON.stringify({ name: 'shop', scripts: { test: 'node --test', lint: 'eslint .' }, dependencies: { express: '^4' } }, null, 2),
    'src/modules/billing/invoice.js': 'module.exports = {};\n',
    'src/modules/billing/refund.js': 'module.exports = {};\n',
    'src/modules/auth/login.js': 'module.exports = {};\n'
  });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'app');

  const examples = {};
  examples.init = run('init', '--targets=claude,cursor', '--yes');
  run('analyze', '--scaffold');
  const doc = path.join(dir, '.ai/modules/billing.md');
  fs.writeFileSync(doc, fs.readFileSync(doc, 'utf8').replace('1–2 lines.', 'Invoices and refunds. Amounts are integer cents.'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'docs');
  run('stamp', '--all');
  git(dir, 'commit', '-qam', 'stamp');
  fs.appendFileSync(path.join(dir, 'src/modules/billing/refund.js'), 'exports.partial = () => {};\n');
  git(dir, 'commit', '-qam', 'partial refunds');

  examples.status = run('status');
  examples.sync = run('sync');
  examples.setup = run('setup');
  examples.doctor = run('doctor');
  fs.rmSync(parent, { recursive: true, force: true });
  return examples;
}

if (require.main === module) {
  const examples = runExamples({ color: process.argv.includes('--color') });
  for (const [name, output] of Object.entries(examples)) {
    process.stdout.write(`<!-- example:${name} -->\n${output}\n\n`);
  }
}

module.exports = { runExamples, normalize };
