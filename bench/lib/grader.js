'use strict';

/**
 * Helpers for task graders: copy hidden tests in, run commands, scan sources.
 * A grader returns { pass, checks: [{ name, ok, detail? }] }; pass means every check is ok.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

/**
 * @param {string} src - directory to copy
 * @param {string} dest - destination directory (merged)
 */
function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

/**
 * Runs a command in a directory; never throws.
 *
 * @param {string} cwd
 * @param {string} cmd
 * @param {string[]} args
 * @param {number} [timeoutMs=300000]
 * @returns {{ ok: boolean, output: string }}
 */
function run(cwd, cmd, args, timeoutMs = 300000) {
  const result = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, NO_COLOR: '1' } });
  return { ok: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}`.slice(-4000) };
}

/**
 * Source files under a folder, as { rel, text }.
 *
 * @param {string} dir
 * @param {string} sub - folder inside dir
 * @param {RegExp} [ext=/./]
 * @returns {Array<{ rel: string, text: string }>}
 */
function sources(dir, sub, ext = /./) {
  const base = path.join(dir, sub);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { recursive: true })
    .map(rel => path.join(sub, String(rel)))
    .filter(rel => ext.test(rel) && fs.statSync(path.join(dir, rel)).isFile())
    .map(rel => ({ rel: rel.split(path.sep).join('/'), text: fs.readFileSync(path.join(dir, rel), 'utf8') }));
}

/**
 * Text of a file, or '' when missing.
 *
 * @param {string} dir
 * @param {string} rel
 * @returns {string}
 */
function readText(dir, rel) {
  try {
    return fs.readFileSync(path.join(dir, rel), 'utf8');
  } catch {
    return '';
  }
}

/**
 * @param {Array<{ name: string, ok: boolean, detail?: string }>} checks
 * @returns {{ pass: boolean, checks: typeof checks }}
 */
function result(checks) {
  return { pass: checks.every(c => c.ok), checks };
}

module.exports = { copyDir, run, sources, readText, result };
