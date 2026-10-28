#!/usr/bin/env node
'use strict';

/**
 * RepoCanon benchmark: the same tasks run by Claude Code with no project knowledge,
 * with a hand-written AGENTS.md, and with a RepoCanon knowledge layer.
 *
 *   node bench/run.js --self-test            graders fail the fixture and pass the solution (free)
 *   node bench/run.js --dry-run              whole pipeline with a fake agent (free)
 *   node bench/run.js --runs 5               the real thing (costs money)
 *
 * Options: --suite=core|drift|all  --tasks=a,b  --conditions=a,b  --model=sonnet  --concurrency=3
 *          --budget-per-run=1.5  --max-total-usd=80  --timeout-min=15  --out=bench/results/<date>
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { loadTasks, prepareRepo, applyDrift, grade, selfTest, BENCH_DIR } = require('./lib/tasks');
const { CONDITIONS, SUITE_CONDITIONS, applyCondition } = require('./lib/conditions');
const { runAgent } = require('./lib/agent');
const { renderReport } = require('./lib/report');

function parseOptions(argv) {
  const options = { suite: 'core', runs: 5, model: 'sonnet', concurrency: 3, budgetPerRun: 1.5, maxTotalUsd: 80, timeoutMin: 15 };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=');
    const value = () => (inline !== undefined ? inline : argv[++i]);
    const name = flag.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (['selfTest', 'dryRun', 'keep'].includes(name)) options[name] = true;
    else if (['runs', 'concurrency', 'budgetPerRun', 'maxTotalUsd', 'timeoutMin'].includes(name)) options[name] = Number(value());
    else if (['tasks', 'conditions'].includes(name)) options[name] = value().split(',').filter(Boolean);
    else if (['model', 'out', 'suite'].includes(name)) options[name] = value();
    else throw new Error(`unknown option ${argv[i]}`);
  }
  return options;
}

function readRuns(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function cliVersion() {
  try {
    return cp.execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim().split(' ')[0];
  } catch {
    return null;
  }
}

/** Stands in for the agent in --dry-run: solves every other run with the reference solution. */
function fakeAgent(task, repoDir, index) {
  if (index % 2 === 0) fs.cpSync(path.join(task.dir, 'solution'), repoDir, { recursive: true, force: true });
  return { ok: true, costUsd: 0, inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 1200 + index, turns: 3, durationMs: 1000, model: 'dry-run', subtype: 'success', text: '', tools: { counts: {}, knowledgeReads: [], repocanonCalls: [] }, exitCode: 0, timedOut: false, stderr: '' };
}

async function runOne(job, options) {
  const repoDir = prepareRepo(job.task, job.condition);
  const { mcpConfig } = applyCondition(job.condition, repoDir, job.task);
  // Drift tasks: the code changes after the docs were verified, and the docs are not updated
  applyDrift(job.task, repoDir);
  const agent = options.dryRun
    ? fakeAgent(job.task, repoDir, job.index)
    : await runAgent({ repoDir, prompt: job.task.prompt, model: options.model, budgetUsd: options.budgetPerRun, mcpConfig, timeoutMs: options.timeoutMin * 60000 });
  const graded = grade(job.task, repoDir);
  if (!options.keep) fs.rmSync(repoDir, { recursive: true, force: true });
  return {
    task: job.task.id,
    language: job.task.language,
    condition: job.condition,
    index: job.index,
    pass: graded.pass,
    ...(graded.followed ? { followed: graded.followed } : {}),
    checks: graded.checks.map(({ name, ok }) => ({ name, ok })),
    failures: graded.checks.filter(c => !c.ok).map(c => ({ name: c.name, detail: (c.detail || '').slice(-600) })),
    agent,
    repoDir: options.keep ? repoDir : undefined,
    finishedAt: new Date().toISOString()
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (!['core', 'drift', 'all'].includes(options.suite)) throw new Error(`unknown suite ${options.suite} (core, drift or all)`);
  const tasks = loadTasks()
    .filter(t => options.suite === 'all' || t.suite === options.suite)
    .filter(t => !options.tasks || options.tasks.includes(t.id));
  const defaults = options.suite === 'all' ? CONDITIONS : SUITE_CONDITIONS[options.suite];
  const conditions = CONDITIONS.filter(c => (options.conditions ? options.conditions.includes(c) : defaults.includes(c)));

  if (options.selfTest) {
    let ok = true;
    for (const task of tasks) {
      const result = selfTest(task);
      const good = result.baselineFails && result.solutionPasses;
      ok = ok && good;
      const drift = task.suite === 'drift' ? `, solution follows the ${result.solutionFollowed}` : '';
      const good2 = good && (task.suite !== 'drift' || result.solutionFollowed === 'code');
      ok = ok && good2;
      console.log(`${good2 ? '✓' : '✗'} ${task.id}: fixture ${result.baselineFails ? 'fails' : 'PASSES'}, solution ${result.solutionPasses ? 'passes' : 'FAILS'}${drift}`);
      for (const check of result.solutionChecks) console.log(`    ${check.name}: ${(check.detail || '').slice(-400)}`);
    }
    process.exitCode = ok ? 0 : 1;
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve(options.out || path.join(BENCH_DIR, 'results', `${options.dryRun ? 'dry-run-' : ''}${date}${options.suite === 'core' ? '' : `-${options.suite}`}`));
  fs.mkdirSync(outDir, { recursive: true });
  const runsFile = path.join(outDir, 'runs.jsonl');
  const done = readRuns(runsFile);
  const doneKeys = new Set(done.map(r => `${r.task}|${r.condition}|${r.index}`));

  // Interleave tasks and conditions so a stopped run still leaves comparable cells
  const jobs = [];
  for (let index = 0; index < options.runs; index++) {
    for (const task of tasks) {
      for (const condition of conditions) {
        if (!doneKeys.has(`${task.id}|${condition}|${index}`)) jobs.push({ task, condition, index });
      }
    }
  }

  let spent = done.reduce((sum, r) => sum + r.agent.costUsd, 0);
  console.log(`${jobs.length} run(s) to go (${done.length} already done, $${spent.toFixed(2)} spent) → ${path.relative(process.cwd(), runsFile)}`);

  let cursor = 0;
  let stopped = false;
  const worker = async () => {
    while (cursor < jobs.length && !stopped) {
      if (spent >= options.maxTotalUsd) {
        stopped = true;
        console.log(`stopping: $${spent.toFixed(2)} spent, cap $${options.maxTotalUsd}`);
        break;
      }
      const job = jobs[cursor++];
      let record = await runOne(job, options);
      // An agent that crashed or timed out says nothing about the condition: retry once
      if (!options.dryRun && (!record.agent.ok || record.agent.timedOut) && !record.pass) {
        spent += record.agent.costUsd;
        record = { ...(await runOne(job, options)), retried: true };
      }
      spent += record.agent.costUsd;
      fs.appendFileSync(runsFile, `${JSON.stringify(record)}\n`);
      console.log(`${record.pass ? '✓' : '✗'} ${job.task.id} · ${job.condition} · #${job.index}${record.followed ? ` · followed ${record.followed}` : ''} · ${Math.round(record.agent.totalTokens / 1000)}k tokens · $${record.agent.costUsd.toFixed(3)} · total $${spent.toFixed(2)}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, worker));

  const runs = readRuns(runsFile);
  const env = {
    date,
    cli: options.dryRun ? 'dry-run' : cliVersion(),
    model: [...new Set(runs.map(r => r.agent.model).filter(Boolean))].join(', ') || options.model,
    modelAlias: options.model,
    node: process.version,
    os: `${os.type()} ${os.release()}`,
    budgetPerRunUsd: options.budgetPerRun,
    timeoutMin: options.timeoutMin
  };
  const { markdown, summary } = renderReport(runs, { conditions, tasks: tasks.map(t => t.id), env });
  fs.writeFileSync(path.join(outDir, 'summary.md'), markdown);
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify({ env, summary }, null, 2)}\n`);
  console.log(`\n${markdown}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
