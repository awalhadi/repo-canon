'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const cfApi = require('../src/index');
const { parseArgs } = require('../src/cli/args');
const { parseFrontmatter, stripFrontmatter, setFrontmatterValue } = require('../src/core/frontmatter');
const { upsertManagedBlock, BLOCK_START, BLOCK_END } = require('../src/core/blocks');
const { estimateTokens, estimateRepoTokens } = require('../src/core/tokens');
const { validateConfig, loadConfig } = require('../src/core/config');
const { detectModules } = require('../src/core/modules');
const { executeTool } = require('../src/mcp/tools');
const { installPreCommitHook } = require('../src/services/hook.service');

function createTempRepo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-mod-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  cp.execFileSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=tester', 'init', '-q'], { cwd: dir });
  cp.execFileSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=tester', 'add', '-A'], { cwd: dir });
  cp.execFileSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=tester', 'commit', '--allow-empty', '-qm', 'init'], { cwd: dir });
  return dir;
}

test('CLI args parser correctly parses flags, key=val and key val options', () => {
  const parsed1 = parseArgs(['status', '--ci', '--json', '--root=/tmp/project']);
  assert.equal(parsed1.command, 'status');
  assert.ok(parsed1.isCi);
  assert.ok(parsed1.isJson);
  assert.equal(parsed1.root, path.resolve('/tmp/project'));

  const parsed2 = parseArgs(['context', 'search', 'query', '--max', '2000', '--files=src/a.js,src/b.js']);
  assert.equal(parsed2.command, 'context');
  assert.deepEqual(parsed2.args, ['search', 'query']);
  assert.equal(parsed2.options.max, '2000');
  assert.equal(parsed2.options.files, 'src/a.js,src/b.js');
});

test('Frontmatter parsing, updating, and stripping', () => {
  const raw = `---
module: billing
verified_at: abc1234
code_paths: [app/Services, app/Models]
---
# Billing Module
Content here.`;

  const parsed = parseFrontmatter(raw);
  assert.equal(parsed.module, 'billing');
  assert.equal(parsed.verified_at, 'abc1234');
  assert.deepEqual(parsed.code_paths, ['app/Services', 'app/Models']);

  const updated = setFrontmatterValue(raw, 'verified_at', 'def5678');
  const parsedUpdated = parseFrontmatter(updated);
  assert.equal(parsedUpdated.verified_at, 'def5678');
  assert.equal(parsedUpdated.module, 'billing');

  const stripped = stripFrontmatter(raw);
  assert.ok(!stripped.includes('---'));
  assert.match(stripped, /^# Billing Module/);
});

test('Managed blocks insertion and idempotency', () => {
  const tempFile = path.join(os.tmpdir(), `block-test-${Date.now()}.md`);
  try {
    const status1 = upsertManagedBlock(tempFile, 'Rule 1\nRule 2', '# Header\n\n');
    assert.equal(status1, 'created');
    let content = fs.readFileSync(tempFile, 'utf8');
    assert.ok(content.includes('# Header'));
    assert.ok(content.includes(BLOCK_START));
    assert.ok(content.includes('Rule 1'));

    const status2 = upsertManagedBlock(tempFile, 'Rule 1\nRule 2');
    assert.equal(status2, 'unchanged');

    const status3 = upsertManagedBlock(tempFile, 'Rule 1 Updated');
    assert.equal(status3, 'updated');
    content = fs.readFileSync(tempFile, 'utf8');
    assert.ok(content.includes('Rule 1 Updated'));
    assert.ok(!content.includes('Rule 2'));
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test('Configuration validation and default fallbacks', () => {
  const valid = validateConfig({ preset: 'laravel', moduleRoots: ['src/domains'], modules: {}, exclude: [] });
  assert.equal(valid.length, 0);

  const invalid = validateConfig({ preset: 'nonexistent', unknownKey: 123, modules: 'not-an-obj' });
  assert.ok(invalid.some(err => err.includes('preset "nonexistent" unknown')));
  assert.ok(invalid.some(err => err.includes('unknown key "unknownKey"')));
  assert.ok(invalid.some(err => err.includes('modules must be an object')));
});

test('Token estimation and repo token bounding', () => {
  const sample = 'a'.repeat(400);
  assert.equal(estimateTokens(sample), 100);

  const repoDir = createTempRepo({
    'src/index.js': 'console.log("hello world");\n',
    'image.png': Buffer.alloc(100),
    'package-lock.json': '{"lockfileVersion": 3}'
  });

  const tokens = estimateRepoTokens(repoDir);
  assert.ok(tokens > 0);
  assert.ok(tokens < 100);
});

test('Module detection with exclusions and explicit config override', () => {
  const files = [
    'src/modules/billing/index.js',
    'src/modules/auth/index.js',
    'src/modules/vendor/ignore.js',
    'custom/path/feature.js'
  ];

  const config = {
    preset: 'node',
    moduleRoots: [],
    exclude: ['src/modules/vendor/'],
    modules: {
      custom: ['custom/path/']
    }
  };

  const detected = detectModules(files, config, ['Node.js']);
  const slugs = detected.map(m => m.slug);
  assert.ok(slugs.includes('billing'));
  assert.ok(slugs.includes('auth'));
  assert.ok(slugs.includes('custom'));
  assert.ok(!slugs.includes('vendor'));
});

test('Pre-commit hook installation and idempotency', () => {
  const repoDir = createTempRepo();
  const res1 = installPreCommitHook(repoDir);
  assert.match(res1, /installed/);

  const res2 = installPreCommitHook(repoDir);
  assert.equal(res2, 'already installed');

  const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-'));
  const res3 = installPreCommitHook(nonGitDir);
  assert.equal(res3, 'no .git folder');
});

test('MCP tool execution directly via API', () => {
  const repoDir = createTempRepo({
    'package.json': '{"name": "test-pkg"}',
    'src/features/auth/login.js': 'export const login = () => {};'
  });

  cfApi.init(repoDir);
  cfApi.analyze(repoDir, { scaffold: true });

  const contextResult = executeTool(repoDir, 'rc_context', { query: 'auth login', max_tokens: 1000 });
  assert.ok(typeof contextResult === 'string');
  assert.ok(contextResult.includes('.ai/PROJECT.md'));

  const ownerResult = JSON.parse(executeTool(repoDir, 'rc_find_owner', { path: 'src/features/auth/login.js' }));
  assert.equal(ownerResult[0].module, 'auth');

  const statusResult = JSON.parse(executeTool(repoDir, 'rc_status', {}));
  assert.ok(Array.isArray(statusResult));
  assert.ok(statusResult.some(r => r.doc.includes('PROJECT.md')));

  assert.throws(() => executeTool(repoDir, 'cf_context', {}), /unknown tool cf_context/);
});

test('MCP rc_prepare_fill and rc_sync_report return actionable text, not a copy-paste prompt', () => {
  const repoDir = createTempRepo({
    'package.json': '{"name": "test-pkg"}',
    'src/features/auth/login.js': 'export const login = () => {};'
  });

  cfApi.init(repoDir);
  cfApi.analyze(repoDir, { scaffold: true });

  const fillBrief = executeTool(repoDir, 'rc_prepare_fill', {});
  assert.ok(typeof fillBrief === 'string' && fillBrief.length > 0);

  const compactBrief = executeTool(repoDir, 'rc_prepare_fill', { compact: true });
  assert.ok(compactBrief.length < fillBrief.length);

  const syncReport = executeTool(repoDir, 'rc_sync_report', {});
  assert.ok(typeof syncReport === 'string');
});
