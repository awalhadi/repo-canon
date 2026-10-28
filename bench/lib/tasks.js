'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const BENCH_DIR = path.resolve(__dirname, '..');
const TASKS_DIR = path.join(BENCH_DIR, 'tasks');
const FIXTURES_DIR = path.join(BENCH_DIR, 'fixtures');

/**
 * Every task under bench/tasks, with its prompt and grader.
 *
 * @returns {Array<{ id: string, dir: string, fixture: string, language: string, title: string, prompt: string }>}
 */
function loadTasks() {
  return fs.readdirSync(TASKS_DIR)
    .filter(id => fs.existsSync(path.join(TASKS_DIR, id, 'task.json')))
    .sort()
    .map(id => {
      const dir = path.join(TASKS_DIR, id);
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'task.json'), 'utf8'));
      return { id, dir, suite: 'core', ...meta, prompt: fs.readFileSync(path.join(dir, 'task.md'), 'utf8').trim() };
    });
}

const git = (cwd, ...args) => cp.execFileSync('git', ['-c', 'user.email=bench@repocanon.dev', '-c', 'user.name=bench', ...args], { cwd, stdio: 'pipe' });

/**
 * A fresh git repo holding the task's fixture, in a temp folder.
 *
 * @param {{ fixture: string }} task
 * @param {string} [label='run']
 * @returns {string} the repo path
 */
function prepareRepo(task, label = 'run') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rc-bench-${label}-`));
  fs.cpSync(path.join(FIXTURES_DIR, task.fixture, 'repo'), dir, { recursive: true });
  // Drift tasks add code the docs describe correctly at first
  const base = task.dir && path.join(task.dir, 'base');
  if (base && fs.existsSync(base)) fs.cpSync(base, dir, { recursive: true, force: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'fixture');
  return dir;
}

/**
 * Drift tasks: after the knowledge is committed and verified, a later commit changes
 * the code so one documented rule is no longer true. The docs are left as they were.
 * Does nothing for other tasks.
 *
 * @param {{ dir: string, driftMessage?: string }} task
 * @param {string} repoDir
 * @returns {boolean} whether a drift commit was made
 */
function applyDrift(task, repoDir) {
  const drift = path.join(task.dir, 'drift');
  if (!fs.existsSync(drift)) return false;
  fs.cpSync(drift, repoDir, { recursive: true, force: true });
  git(repoDir, 'add', '-A');
  git(repoDir, 'commit', '-qm', task.driftMessage || 'change');
  // In a real repo the change that made a doc wrong is rarely the newest commit; agents that
  // read `git log` would otherwise find it without any help from the docs
  for (let i = 0; i < (task.buryCommits || 0); i++) {
    const [file, line, message] = BURY_COMMITS[i % BURY_COMMITS.length];
    fs.mkdirSync(path.dirname(path.join(repoDir, file)), { recursive: true });
    fs.appendFileSync(path.join(repoDir, file), `${line}\n`);
    git(repoDir, 'add', '-A');
    git(repoDir, 'commit', '-qm', message);
  }
  return true;
}

/** Unrelated later commits that bury a drift: docs and notes only, so no doc goes stale from them. */
const BURY_COMMITS = [
  ['README.md', '', 'docs: fix a typo in the README'],
  ['docs/runbook.md', '- Restart the worker after changing env vars.', 'docs: runbook note on restarts'],
  ['docs/release-notes.md', '- 2.3.1: faster product lookup', 'docs: release notes for 2.3.1'],
  ['README.md', 'Questions: #shop-dev on Slack.', 'docs: where to ask questions'],
  ['docs/runbook.md', '- Logs live in the platform console.', 'docs: where the logs are'],
  ['docs/release-notes.md', '- 2.3.2: clearer error messages', 'docs: release notes for 2.3.2'],
  ['docs/onboarding.md', '- Run the tests before your first PR.', 'docs: onboarding checklist'],
  ['README.md', 'License: proprietary.', 'docs: license line'],
  ['docs/runbook.md', '- Rotate the API keys every quarter.', 'docs: key rotation reminder'],
  ['docs/release-notes.md', '- 2.3.3: smaller install', 'docs: release notes for 2.3.3'],
  ['docs/onboarding.md', '- Ask for repo access in #it-help.', 'docs: access requests'],
  ['docs/glossary.md', '- SKU: stock keeping unit.', 'docs: start a glossary']
];

/**
 * Runs a task's grader against a repo.
 *
 * @param {{ dir: string }} task
 * @param {string} repoDir
 * @returns {{ pass: boolean, checks: Array<{ name: string, ok: boolean, detail?: string }> }}
 */
function grade(task, repoDir) {
  try {
    return require(path.join(task.dir, 'check.js'))(repoDir);
  } catch (error) {
    return { pass: false, checks: [{ name: 'grader ran', ok: false, detail: String(error && error.message) }] };
  }
}

/**
 * Grader self-test: the untouched fixture must fail and the reference solution must pass.
 *
 * @param {ReturnType<typeof loadTasks>[number]} task
 * @returns {{ id: string, baselineFails: boolean, solutionPasses: boolean, solutionChecks: Array<any> }}
 */
function selfTest(task) {
  const baseline = prepareRepo(task, 'self');
  applyDrift(task, baseline);
  const baselineResult = grade(task, baseline);
  const solved = prepareRepo(task, 'self');
  applyDrift(task, solved);
  fs.cpSync(path.join(task.dir, 'solution'), solved, { recursive: true, force: true });
  const solutionResult = grade(task, solved);
  for (const dir of [baseline, solved]) fs.rmSync(dir, { recursive: true, force: true });
  return {
    id: task.id,
    baselineFails: !baselineResult.pass,
    solutionPasses: solutionResult.pass,
    solutionChecks: solutionResult.checks.filter(c => !c.ok),
    solutionFollowed: solutionResult.followed
  };
}

module.exports = { loadTasks, prepareRepo, applyDrift, grade, selfTest, BENCH_DIR, FIXTURES_DIR };
