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
  // Under `node --test`, NODE_TEST_CONTEXT makes a nested `node --test` report to the parent and exit 0
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const result = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs, env: { ...env, NO_COLOR: '1' } });
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
 * @param {'code'|'doc'|'neither'} [followedSource] - drift tasks: whose value the implementation applies
 * @param {{ docFixed?: boolean }} [extra] - drift tasks: diagnostics that don't decide the pass
 * @returns {{ pass: boolean, checks: typeof checks, followed?: string, docFixed?: boolean }}
 */
function result(checks, followedSource, extra = {}) {
  return { pass: checks.every(c => c.ok), checks, ...(followedSource ? { followed: followedSource } : {}), ...extra };
}

/**
 * Drift tasks: whether the agent corrected the stale docs it was given, i.e. none of the
 * knowledge files that exist still contains the sentence that became false.
 *
 * @param {string} dir
 * @param {string} staleText
 * @returns {boolean}
 */
function staleDocFixed(dir, staleText) {
  const files = ['AGENTS.md', ...sources(dir, '.ai', /\.md$/).map(s => s.rel)];
  return !files.some(rel => readText(dir, rel).includes(staleText));
}

/**
 * Drift tasks: which source the implementation agrees with, judged by what a probe printed.
 *
 * @param {string} observed - the probe's output, normalised by the grader
 * @param {{ code: string, doc: string }} expected
 * @returns {'code'|'doc'|'neither'}
 */
function followed(observed, expected) {
  if (observed === expected.code) return 'code';
  if (observed === expected.doc) return 'doc';
  return 'neither';
}

module.exports = { copyDir, run, sources, readText, result, followed, staleDocFixed };
