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

function packFixture() {
  const repoDir = createTempRepo({
    'package.json': '{"name": "pack-test"}',
    'src/features/auth/login.js': 'x',
    'src/features/author/profile.js': 'x',
    'src/features/billing/invoice.js': 'x'
  });
  cfApi.init(repoDir);
  cfApi.analyze(repoDir, { scaffold: true });
  return repoDir;
}

test('pack: stopwords and partial words do not pull in modules', () => {
  const repoDir = packFixture();
  const result = cfApi.pack(repoDir, { query: 'fix the auth api', maxTokens: 4000 });
  assert.deepEqual(result.modules, ['auth']);
});

test('pack: modules are ranked by relevance, rules come first', () => {
  const repoDir = packFixture();
  const mod = (name, body) => `---\nmodule: ${name}\nverified_at:\ncode_paths: [src/features/${name}/]\n---\n# ${name}\n${body}\n`;
  fs.writeFileSync(path.join(repoDir, '.ai/modules/billing.md'), mod('billing', 'Invoice totals. Each invoice is immutable once sent. InvoiceService owns it.'));
  fs.writeFileSync(path.join(repoDir, '.ai/modules/auth.md'), mod('auth', 'Login sends an invoice reminder.'));

  const result = cfApi.pack(repoDir, { query: 'invoice', maxTokens: 4000 });
  assert.deepEqual(result.modules, ['billing', 'auth']);
  assert.ok(result.scores.billing > result.scores.auth);
  const order = result.included.map(item => item.rel);
  assert.deepEqual(order.slice(0, 3), ['.ai/PROJECT.md', '.ai/CONVENTIONS.md', '.ai/DOMAIN.md']);
  assert.ok(order.indexOf('.ai/modules/billing.md') < order.indexOf('.ai/modules/auth.md'));
  assert.equal(order.at(-1), '.ai/STATE.md');
});

test('pack: one huge doc cannot starve the module docs, budget holds', () => {
  const repoDir = packFixture();
  fs.writeFileSync(path.join(repoDir, '.ai/DOMAIN.md'), '# D\n' + 'rule\n'.repeat(5000));
  const result = cfApi.pack(repoDir, { query: 'billing', maxTokens: 1500 });
  assert.ok(result.tokens <= 1500, `tokens ${result.tokens}`);
  const domain = result.included.find(item => item.rel === '.ai/DOMAIN.md');
  assert.ok(domain.tokens <= 750, `domain ${domain.tokens}`);
  assert.ok(result.included.some(item => item.rel === '.ai/modules/billing.md'));
});

test('truncateToTokens keeps the estimate within the limit', () => {
  const { truncateToTokens } = require('../src/core/tokens');
  const text = 'CommissionService computes totals, refunds and taxes. '.repeat(200);
  const cut = truncateToTokens(text, 120);
  assert.ok(estimateTokens(cut) <= 120);
  assert.ok(estimateTokens(cut) > 100);
  assert.equal(truncateToTokens('short', 50), 'short');
});

test('targets: ids, aliases, all/none and unknown names resolve without throwing', () => {
  const { resolveTargetIds, TARGET_IDS } = require('../src/core/targets');
  assert.deepEqual(resolveTargetIds('cloude, ChatGPT,cursor'), { ids: ['claude', 'cursor', 'codex'], unknown: [] });
  assert.deepEqual(resolveTargetIds(['all']).ids, TARGET_IDS);
  assert.deepEqual(resolveTargetIds('none'), { ids: [], unknown: [] });
  assert.deepEqual(resolveTargetIds('claude,nope').unknown, ['nope']);
});

test('targets: detection looks for each tool\'s files and folders', () => {
  const { detectTargets } = require('../src/core/targets');
  const repoDir = createTempRepo({ '.cursor/mcp.json': '{}', 'GEMINI.md': '# mine\n' });
  assert.deepEqual(detectTargets(repoDir), [
    { id: 'cursor', evidence: '.cursor/' },
    { id: 'gemini', evidence: 'GEMINI.md' }
  ]);
});

test('config: targets are validated, updateConfigFile keeps other keys and never clobbers bad JSON', () => {
  const { updateConfigFile } = require('../src/core/config');
  assert.ok(validateConfig({ preset: 'auto', moduleRoots: [], modules: {}, exclude: [], targets: ['claude', 'zed'] })
    .some(err => err.includes('target "zed" unknown')));

  const repoDir = createTempRepo({ '.repocanon.json': '{\n  "preset": "laravel",\n  "exclude": ["legacy/"]\n}\n' });
  assert.equal(updateConfigFile(repoDir, { targets: ['claude'] }).status, 'updated');
  const saved = JSON.parse(fs.readFileSync(path.join(repoDir, '.repocanon.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved), ['preset', 'exclude', 'targets']);
  assert.deepEqual(loadConfig(repoDir).targets, ['claude']);
  assert.equal(updateConfigFile(repoDir, { targets: ['claude'] }).status, 'unchanged');

  fs.writeFileSync(path.join(repoDir, '.repocanon.json'), '{ broken');
  assert.equal(updateConfigFile(repoDir, { targets: [] }).status, 'invalid');
  assert.equal(fs.readFileSync(path.join(repoDir, '.repocanon.json'), 'utf8'), '{ broken');
});

test('removeManagedBlock keeps user text and deletes block-only files', () => {
  const { removeManagedBlock, readManagedBlock } = require('../src/core/blocks');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-blocks-'));
  const mixed = path.join(dir, 'CLAUDE.md');
  upsertManagedBlock(mixed, '@AGENTS.md', 'MY RULES\n\n');
  assert.equal(readManagedBlock(mixed), '@AGENTS.md');
  assert.equal(removeManagedBlock(mixed), 'removed');
  assert.equal(fs.readFileSync(mixed, 'utf8'), 'MY RULES\n');
  assert.equal(readManagedBlock(mixed), null);

  const ruleOnly = path.join(dir, 'project.mdc');
  upsertManagedBlock(ruleOnly, 'Read AGENTS.md', '---\nalwaysApply: true\n---\n');
  assert.equal(removeManagedBlock(ruleOnly, '---\nalwaysApply: true\n---\n'), 'deleted');
  assert.equal(fs.existsSync(ruleOnly), false);
  assert.equal(removeManagedBlock(ruleOnly), 'absent');
});

test('targets service: plan previews create/append/unchanged/keep/remove, apply saves the choice', () => {
  const { planTargets, applyTargets, resolveDefaultTargets } = require('../src/services/targets.service');
  const repoDir = createTempRepo({ 'GEMINI.md': 'MY GEMINI RULES\n' });
  assert.deepEqual(resolveDefaultTargets(repoDir), { ids: ['gemini'], source: 'detected' });

  const first = planTargets(repoDir, ['claude', 'gemini', 'codex']);
  assert.deepEqual(first.rows.map(r => [r.id, r.action]), [['claude', 'create'], ['gemini', 'append'], ['codex', 'native']]);
  applyTargets(repoDir, first);
  assert.deepEqual(loadConfig(repoDir).targets, ['claude', 'gemini', 'codex']);
  assert.deepEqual(resolveDefaultTargets(repoDir), { ids: ['claude', 'gemini', 'codex'], source: 'saved' });

  assert.ok(planTargets(repoDir, ['claude', 'gemini']).rows.every(r => r.action === 'unchanged'));

  assert.deepEqual(planTargets(repoDir, ['claude']).rows.map(r => [r.id, r.action]), [['claude', 'unchanged'], ['gemini', 'keep']]);
  const pruned = planTargets(repoDir, ['claude'], { prune: true });
  assert.deepEqual(pruned.rows.map(r => r.action), ['unchanged', 'remove']);
  applyTargets(repoDir, pruned);
  assert.equal(fs.readFileSync(path.join(repoDir, 'GEMINI.md'), 'utf8'), 'MY GEMINI RULES\n');
  assert.deepEqual(loadConfig(repoDir).targets, ['claude']);
});

test('picker: reduceSelection moves, wraps, toggles, selects all/none, confirms and cancels', () => {
  const { createSelectState, reduceSelection } = require('../src/cli/prompt');
  const items = [{ id: 'claude' }, { id: 'cursor' }, { id: 'codex' }];
  let s = createSelectState(items, ['codex', 'nope']);
  assert.deepEqual(s.selected, ['codex']);
  s = reduceSelection(s, 'up');
  assert.equal(s.cursor, 2);
  s = reduceSelection(reduceSelection(s, 'down'), 'space');
  assert.deepEqual(s.selected, ['claude', 'codex']);
  s = reduceSelection(s, 'a');
  assert.deepEqual(s.selected, ['claude', 'cursor', 'codex']);
  s = reduceSelection(s, 'a');
  assert.deepEqual(s.selected, []);
  assert.equal(reduceSelection(s, 'x'), s);
  assert.equal(reduceSelection(s, 'return').done, true);
  assert.equal(reduceSelection(s, 'escape').cancelled, true);
  assert.equal(reduceSelection(s, 'cancel').cancelled, true);
});

test('picker: renderMenu aligns columns and marks cursor, choice and status', () => {
  const { createSelectState, renderMenu } = require('../src/cli/prompt');
  const items = [
    { id: 'claude', label: 'Claude Code', detail: 'CLAUDE.md', note: 'set up' },
    { id: 'cline', label: 'Cline', detail: '.clinerules' }
  ];
  const text = renderMenu(createSelectState(items, ['claude']), { title: 'Pick', hint: 'keys', footer: 'foot' });
  assert.equal(text, [
    'Pick',
    'keys',
    '',
    '  ❯ [x] Claude Code  CLAUDE.md    set up',
    '    [ ] Cline        .clinerules',
    '\nfoot'
  ].join('\n'));
});

test('release metadata: server.json matches package.json for the MCP Registry', () => {
  const pkg = require('../package.json');
  const server = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server.json'), 'utf8'));
  assert.equal(server.name, pkg.mcpName);
  assert.match(server.name, /^io\.github\.awalhadi\//);
  assert.ok(server.description.length <= 100, `description is ${server.description.length} chars (max 100)`);
  assert.equal(server.packages[0].identifier, pkg.name);
  assert.equal(server.packages[0].version, server.version);
  assert.deepEqual(server.packages[0].packageArguments, [{ type: 'positional', value: 'mcp' }]);
});

test('inferable: trees, pasted code, dependency lists and catalogues are flagged with line numbers', () => {
  const { findInferableContent } = require('../src/services/inferable.service');
  const doc = [
    '# P',                                        // 1
    '```',                                        // 2
    'app/',                                       // 3
    '├── Services/',                              // 4
    '│   └── Billing/',                           // 5
    '└── Models/',                                // 6
    '```',                                        // 7
    '- laravel/framework ^11.0',                  // 8
    '- php 8.2',                                  // 9
    '- vue@3.4.1',                                // 10
    '- "axios": "^1.6.0"',                        // 11
    '```ts',                                      // 12
    'export function total(items) {',            // 13
    '  return items.reduce((a, b) => a + b, 0);', // 14
    '}',                                          // 15
    '```'                                         // 16
  ].join('\n');
  const found = findInferableContent(doc);
  assert.deepEqual(found.map(f => [f.kind, f.line]), [['tree', 2], ['deps', 8], ['code', 12]]);
  assert.ok(found.every(f => f.tokens > 0 && f.hint));

  const catalogue = Array.from({ length: 12 }, (_, i) => `- src/file${i}.js — does thing ${i}`).join('\n');
  assert.equal(findInferableContent(catalogue)[0].kind, 'catalogue');
  assert.deepEqual(findInferableContent(catalogue, { allowCatalogue: true }), []);
});

test('inferable: near misses stay quiet (shell/mermaid fences, few deps, short lists, prose versions, managed blocks)', () => {
  const { findInferableContent } = require('../src/services/inferable.service');
  const quiet = [
    '```bash', 'php artisan serve', 'php artisan test', 'npm run dev', '```',
    '```mermaid', 'graph TD', 'A --> B', 'B --> C', '```',
    '- laravel/framework ^11.0', '- vue@3.4.1', '- php 8.2',
    ...Array.from({ length: 11 }, (_, i) => `- src/file${i}.js — does thing ${i}`),
    '- 2026-10-20: Released v0.4.0', '- 2026-10-22: Released v0.4.1', '- 2026-10-24: Released v0.4.2', '- 2026-10-26: Released v0.5.0',
    '<!-- cf:auto:start -->', 'app/', '├── a', '├── b', '└── c', '<!-- cf:auto:end -->',
    '<!-- repocanon:start -->', '```js', 'const a = 1;', 'const b = 2;', 'const c = 3;', '```', '<!-- repocanon:end -->'
  ].join('\n');
  assert.deepEqual(findInferableContent(quiet), []);
});

test('inferable: a fresh init has nothing to flag', () => {
  const { scanKnowledgeLayer } = require('../src/services/inferable.service');
  const repoDir = createTempRepo({ 'package.json': '{"name": "fresh"}', 'src/features/auth/login.js': 'x' });
  cfApi.init(repoDir, { targets: ['claude', 'cursor'] });
  cfApi.analyze(repoDir, { scaffold: true });
  assert.deepEqual(scanKnowledgeLayer(repoDir), []);
});

// Test-only values assembled at runtime so no secret-shaped literal sits in the repo
const fakeSecret = (prefix, length, alphabet = 'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY') =>
  prefix + Array.from({ length }, (_, i) => alphabet[(i * 7 + 3) % alphabet.length]).join('');

test('secrets: provider formats and random assignments are found, previews stay masked', () => {
  const { findSecrets } = require('../src/services/secrets.service');
  const values = {
    'GitHub token': fakeSecret('ghp_', 36),
    'AWS access key': fakeSecret('AKIA', 16, 'ABCDEFGHJKLMNPQRSTUVWXYZ234567'),
    'Anthropic API key': fakeSecret('sk-ant-', 40),
    'OpenAI API key': fakeSecret('sk-proj-', 40),
    'Stripe live key': fakeSecret('sk_live_', 24),
    'Slack token': fakeSecret('xoxb-', 24),
    'npm token': fakeSecret('npm_', 36),
    'Google API key': fakeSecret('AIza', 35)
  };
  const lines = Object.values(values).map(v => `- key: ${v}`);
  lines.push(['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '));
  lines.push(`DATABASE_URL=postgres://app:${fakeSecret('', 14)}@db.internal:5432/app`);
  lines.push(`client_secret: ${fakeSecret('', 24)}`);

  const found = findSecrets(lines.join('\n'));
  assert.deepEqual(found.map(f => f.kind), [...Object.keys(values), 'private key', 'URL with password', 'secret value']);
  for (const f of found) {
    assert.ok(f.preview.endsWith('…') && f.preview.length <= 5, f.preview);
  }
});

test('secrets: placeholders, env names, low-entropy values and allow-listed lines stay quiet', () => {
  const { findSecrets } = require('../src/services/secrets.service');
  const quiet = [
    'Env: STRIPE_SECRET_KEY, GITHUB_TOKEN, DB_PASSWORD (names only)',
    'password: <your-password-here>',
    'api_key = ${API_KEY}',
    'token: {{ secrets.NPM_TOKEN }}',
    'DATABASE_URL=postgres://user:password@localhost:5432/app',
    'secret: changeme-changeme',
    'password = aaaaaaaaaaaaaaaa',
    'access_key: abcdefghijklmnop',
    `- ci token ${fakeSecret('ghp_', 36)} <!-- repocanon:allow-secret -->`
  ].join('\n');
  assert.deepEqual(findSecrets(quiet), []);
});

test('hook: installs once, upgrades the 0.5.0 snippet, keeps foreign hook lines', () => {
  const { installPreCommitHook, LEGACY_HOOK_SNIPPET } = require('../src/services/hook.service');
  const repoDir = createTempRepo();
  const hookPath = path.join(repoDir, '.git/hooks/pre-commit');
  fs.writeFileSync(hookPath, `#!/bin/sh\necho "lint first"\n\n${LEGACY_HOOK_SNIPPET}`);

  assert.match(installPreCommitHook(repoDir), /^updated/);
  const upgraded = fs.readFileSync(hookPath, 'utf8');
  assert.ok(upgraded.includes('echo "lint first"'));
  assert.equal((upgraded.match(/# repocanon:start/g) || []).length, 1);
  assert.ok(upgraded.includes('secrets --staged --quiet'));
  assert.ok(!upgraded.includes('# repocanon: warn if code changed'));
  assert.equal(installPreCommitHook(repoDir), 'already installed');
});

test('setup: writes MCP entries per tool, keeps other servers, is idempotent, never clobbers bad JSON', () => {
  const { planSetup, applySetup } = require('../src/services/setup.service');
  const repoDir = createTempRepo({
    '.cursor/mcp.json': '{\n  "mcpServers": {\n    "other": { "command": "other-server" }\n  },\n  "extra": true\n}\n',
    '.vscode/mcp.json': '{\n  // my servers\n  "servers": {}\n}\n'
  });
  const plan = planSetup(repoDir, ['claude', 'cursor', 'copilot', 'gemini', 'codex']);
  assert.deepEqual(plan.map(r => [r.id, r.action]), [
    ['claude', 'create'], ['cursor', 'add'], ['copilot', 'invalid'], ['gemini', 'create'], ['codex', 'manual']
  ]);
  applySetup(repoDir, plan);

  const claude = JSON.parse(fs.readFileSync(path.join(repoDir, '.mcp.json'), 'utf8'));
  assert.deepEqual(claude.mcpServers.repocanon, { command: 'npx', args: ['-y', 'repocanon', 'mcp'] });
  const cursorText = fs.readFileSync(path.join(repoDir, '.cursor/mcp.json'), 'utf8');
  const cursor = JSON.parse(cursorText);
  assert.deepEqual(Object.keys(cursor), ['mcpServers', 'extra']);
  assert.deepEqual(Object.keys(cursor.mcpServers), ['other', 'repocanon']);
  assert.deepEqual(cursor.mcpServers.repocanon.args, ['-y', 'repocanon', 'mcp', '--root=${workspaceFolder}']);
  assert.equal(fs.readFileSync(path.join(repoDir, '.vscode/mcp.json'), 'utf8'), '{\n  // my servers\n  "servers": {}\n}\n');
  assert.match(plan[2].snippet, /"servers": \{\n\s+"repocanon": \{\n\s+"type": "stdio"/);
  assert.match(plan[4].snippet, new RegExp(`^\\[mcp_servers\\.repocanon\\]\\ncommand = "npx"\\nargs = \\["-y", "repocanon", "mcp", "--root=${repoDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\]$`));

  assert.ok(planSetup(repoDir, ['claude', 'cursor', 'gemini']).every(r => r.action === 'unchanged'));
  fs.writeFileSync(path.join(repoDir, '.mcp.json'), '{"mcpServers":{"repocanon":{"command":"node","args":["old.js"]}}}');
  assert.equal(planSetup(repoDir, ['claude'])[0].action, 'update');
});

test('Claude Code plugin: marketplace points at the plugin, versions match, hooks call agent-hook only inside .ai projects', () => {
  const rootDir = path.join(__dirname, '..');
  const marketplace = JSON.parse(fs.readFileSync(path.join(rootDir, '.claude-plugin/marketplace.json'), 'utf8'));
  const entry = marketplace.plugins.find(p => p.name === 'repocanon');
  const pluginDir = path.join(rootDir, entry.source);
  const plugin = JSON.parse(fs.readFileSync(path.join(pluginDir, '.claude-plugin/plugin.json'), 'utf8'));
  const hooks = JSON.parse(fs.readFileSync(path.join(pluginDir, 'hooks/hooks.json'), 'utf8')).hooks;
  const server = JSON.parse(fs.readFileSync(path.join(rootDir, 'server.json'), 'utf8'));

  assert.equal(plugin.name, 'repocanon');
  assert.equal(plugin.version, server.version);
  assert.ok(fs.existsSync(path.join(pluginDir, 'skills/repocanon/SKILL.md')));
  const pin = `repocanon@^${plugin.version}`;
  assert.ok(plugin.mcpServers.repocanon.args.includes(pin));
  for (const [event, arg] of [['SessionStart', 'session-start'], ['Stop', 'stop']]) {
    const command = hooks[event][0].hooks[0].command;
    assert.ok(command.startsWith('[ -d "$CLAUDE_PROJECT_DIR/.ai" ] && '), command);
    assert.ok(command.includes(`'${pin}' agent-hook ${arg}`), command);
    assert.ok(command.endsWith('|| true'), command);
  }
});

function rulesFixture(config = {}) {
  const repoDir = createTempRepo({
    'app/Services/Billing/S.php': 'x',
    'app/Models/Order.php': 'x',
    '.cursor/rules/other.mdc': '---\nalwaysApply: true\n---\nmine\n',
    '.cursor/rules/rc-handmade.mdc': 'my own rule, no generated header\n',
    '.repocanon.json': JSON.stringify({ preset: 'auto', moduleRoots: [], modules: {}, exclude: [], targets: ['cursor', 'copilot'], ...config }),
    '.ai/modules/billing.md': '---\nmodule: billing\nverified_at:\ncode_paths: [app/Services/Billing/, app/Models/Order.php]\n---\n# billing\n> ≤100 lines. Semantic index, not a code copy.\n\n## Purpose\nCharges customers and issues refunds.\n\n## Invariants\n- A refund never exceeds the captured amount.\n',
    '.ai/modules/auth.md': '---\nmodule: auth\nverified_at:\ncode_paths: [app/Services/Auth/]\n---\n# auth\n> ≤100 lines. Semantic index, not a code copy.\n\n## Purpose\n1–2 lines.\n\n## Invariants\n- rule that must never break\n'
  });
  return repoDir;
}

test('rules: filled modules become Cursor/Copilot scoped rules; unfilled stubs and user files are left alone', () => {
  const { planRules, applyRules, toGlobs } = require('../src/services/rules.service');
  const repoDir = rulesFixture();
  assert.deepEqual(toGlobs(repoDir, ['app/Services/Billing/', 'app/Services/Billing', 'app/Models/Order.php']),
    ['app/Services/Billing/**', 'app/Services/Billing/**', 'app/Models/Order.php']);

  const plan = planRules(repoDir);
  assert.deepEqual(plan.map(r => [r.file, r.action]), [
    ['.cursor/rules/rc-billing.mdc', 'create'],
    ['.github/instructions/rc-billing.instructions.md', 'create']
  ]);
  applyRules(repoDir, plan);

  const cursor = fs.readFileSync(path.join(repoDir, '.cursor/rules/rc-billing.mdc'), 'utf8');
  assert.match(cursor, /^---\ndescription: "Charges customers and issues refunds\."\nglobs: app\/Services\/Billing\/\*\*,app\/Models\/Order\.php\nalwaysApply: false\n---\n<!-- Generated by RepoCanon from \.ai\/modules\/billing\.md/);
  assert.match(cursor, /A refund never exceeds the captured amount/);
  assert.doesNotMatch(cursor, /≤100 lines/);
  const copilot = fs.readFileSync(path.join(repoDir, '.github/instructions/rc-billing.instructions.md'), 'utf8');
  assert.match(copilot, /^---\napplyTo: "app\/Services\/Billing\/\*\*,app\/Models\/Order\.php"\n---\n/);

  assert.ok(planRules(repoDir).every(r => r.action === 'unchanged'));
  fs.appendFileSync(path.join(repoDir, '.ai/modules/billing.md'), '- Refunds over $500 need approval.\n');
  assert.deepEqual([...new Set(planRules(repoDir).map(r => r.action))], ['update']);

  // deselect copilot, delete the billing doc → generated files go, user files stay
  const cfg = JSON.parse(fs.readFileSync(path.join(repoDir, '.repocanon.json'), 'utf8'));
  fs.writeFileSync(path.join(repoDir, '.repocanon.json'), JSON.stringify({ ...cfg, targets: ['cursor'] }));
  fs.unlinkSync(path.join(repoDir, '.ai/modules/billing.md'));
  const cleanup = planRules(repoDir);
  assert.deepEqual(cleanup.map(r => [r.file, r.action]).sort(), [
    ['.cursor/rules/rc-billing.mdc', 'remove'],
    ['.github/instructions/rc-billing.instructions.md', 'remove']
  ]);
  applyRules(repoDir, cleanup);
  assert.ok(fs.existsSync(path.join(repoDir, '.cursor/rules/other.mdc')));
  assert.ok(fs.existsSync(path.join(repoDir, '.cursor/rules/rc-handmade.mdc')));
  assert.equal(fs.existsSync(path.join(repoDir, '.cursor/rules/rc-billing.mdc')), false);
});

test('rules: nested AGENTS.md pointers are opt-in and removed cleanly when turned off', () => {
  const { planRules, applyRules } = require('../src/services/rules.service');
  const repoDir = rulesFixture({ targets: [], nestedAgents: true });
  fs.writeFileSync(path.join(repoDir, 'app/Services/Billing/AGENTS.md'), 'Team note: billing owners are @payments.\n');

  applyRules(repoDir, planRules(repoDir));
  const nested = fs.readFileSync(path.join(repoDir, 'app/Services/Billing/AGENTS.md'), 'utf8');
  assert.ok(nested.startsWith('Team note: billing owners are @payments.'));
  assert.match(nested, /RepoCanon module `billing`: .* `\.ai\/modules\/billing\.md`/);
  assert.equal(fs.existsSync(path.join(repoDir, 'app/Models/Order.php/AGENTS.md')), false);   // files get no pointer
  assert.ok(planRules(repoDir).every(r => r.action === 'unchanged'));

  const cfg = JSON.parse(fs.readFileSync(path.join(repoDir, '.repocanon.json'), 'utf8'));
  fs.writeFileSync(path.join(repoDir, '.repocanon.json'), JSON.stringify({ ...cfg, nestedAgents: false }));
  applyRules(repoDir, planRules(repoDir));
  assert.equal(fs.readFileSync(path.join(repoDir, 'app/Services/Billing/AGENTS.md'), 'utf8'), 'Team note: billing owners are @payments.\n');
});

test('rules: template placeholders and the sections they leave empty never reach rule files', () => {
  const { planRules } = require('../src/services/rules.service');
  const repoDir = rulesFixture({ targets: ['cursor'] });
  fs.writeFileSync(path.join(repoDir, '.ai/modules/billing.md'),
    '---\nmodule: billing\nverified_at:\ncode_paths: [app/Services/Billing/]\n---\n# billing\n> ≤100 lines. Semantic index, not a code copy.\n\n## Purpose\nCharges customers.\n\n## Invariants\n- rule that must never break\n\n## Flow\n- step → step (no code)\n\n## Gotchas\n- Refunds run in a queue.\n');
  const [row] = planRules(repoDir).filter(r => r.file.endsWith('rc-billing.mdc'));
  assert.match(row.content, /## Purpose\nCharges customers\.\n\n## Gotchas\n- Refunds run in a queue\./);
  assert.doesNotMatch(row.content, /rule that must never break|step → step|## Invariants|## Flow|≤100 lines/);
});

test('adopt: routing by memory-bank file name and by heading', () => {
  const { routeSection } = require('../src/services/adopt.service');
  assert.equal(routeSection('memory-bank/activeContext.md', 'Anything'), 'STATE');
  assert.equal(routeSection('memory-bank/projectbrief.md', ''), 'PROJECT');
  assert.equal(routeSection('memory-bank/systemPatterns.md', 'Glossary'), 'CONVENTIONS');
  assert.equal(routeSection('CLAUDE.md', 'Glossary'), 'DOMAIN');
  assert.equal(routeSection('CLAUDE.md', 'Why we use Postgres'), 'DECISIONS');
  assert.equal(routeSection('CLAUDE.md', 'Known issues'), 'STATE');
  assert.equal(routeSection('CLAUDE.md', 'Deployment'), 'PROJECT');
  assert.equal(routeSection('CLAUDE.md', 'Code style'), 'CONVENTIONS');
  assert.equal(routeSection('.cursorrules', ''), 'CONVENTIONS');
});

function adoptFixture() {
  const token = 'ghp_' + 'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xYz2Q4';
  return createTempRepo({
    'package.json': '{"name":"shop"}',
    'CLAUDE.md': '# Shop\n\n## Structure\n```\nsrc/\n├── api/\n│   └── orders.ts\n└── web/\n```\n\n## Code style\n- Named exports only.\n\n## Glossary\n- SKU: one per size and colour.\n',
    '.cursorrules': `- Prefer async/await.\n- deploy key: ${token}\n`,
    '.cursor/rules/api.mdc': '---\nglobs: src/api/**\nalwaysApply: false\n---\nValidate requests with zod.\n',
    '.cursor/rules/rc-billing.mdc': '---\nglobs: x/**\n---\n<!-- Generated by RepoCanon from .ai/modules/billing.md — edit that file -->\nx\n',
    'memory-bank/progress.md': '# Progress\n- Checkout v2 half done.\n'
  });
}

test('adopt: imports cleaned sections, skips scoped and generated rules, is idempotent', () => {
  const { adoptProject } = require('../src/services/adopt.service');
  const repoDir = adoptFixture();
  const result = adoptProject(repoDir);
  assert.equal(result.initialized, true);
  assert.deepEqual(result.rows.map(r => r.rel), ['CLAUDE.md', '.cursorrules', 'memory-bank/progress.md']);
  assert.deepEqual(result.skipped.map(s => s.rel), ['.cursor/rules/api.mdc']);
  assert.ok(result.rows[0].inferableTokens > 0);
  assert.equal(result.rows[1].secretLines, 1);

  const conventions = fs.readFileSync(path.join(repoDir, '.ai/CONVENTIONS.md'), 'utf8');
  assert.match(conventions, /## Imported from CLAUDE\.md\n\n<!-- repocanon:adopted CLAUDE\.md [0-9a-f]{8} .*-->\n\n### Code style\n- Named exports only\./);
  assert.match(conventions, /- Prefer async\/await\./);
  assert.doesNotMatch(conventions, /ghp_|├──/);
  assert.match(fs.readFileSync(path.join(repoDir, '.ai/DOMAIN.md'), 'utf8'), /### Glossary\n- SKU: one per size and colour\./);
  assert.match(fs.readFileSync(path.join(repoDir, '.ai/STATE.md'), 'utf8'), /Checkout v2 half done/);

  assert.ok(adoptProject(repoDir).rows.every(r => r.status === 'already'));
  fs.appendFileSync(path.join(repoDir, '.cursorrules'), '- No default exports.\n');
  assert.equal(adoptProject(repoDir, { dryRun: true }).rows.find(r => r.rel === '.cursorrules').status, 'changed');
});

test('adopt --move: originals become pointers or are removed, but never while uncommitted', () => {
  const { adoptProject } = require('../src/services/adopt.service');
  const repoDir = adoptFixture();
  adoptProject(repoDir);                                     // init appended a pointer to CLAUDE.md → it is dirty
  const first = adoptProject(repoDir, { move: true });
  assert.deepEqual(first.notMoved.map(n => n.rel), ['CLAUDE.md']);
  assert.ok(fs.existsSync(path.join(repoDir, 'CLAUDE.md')));
  assert.equal(fs.existsSync(path.join(repoDir, '.cursorrules')), false);
  assert.equal(fs.existsSync(path.join(repoDir, 'memory-bank/progress.md')), false);

  cp.execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: repoDir });
  cp.execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'adopt'], { cwd: repoDir });
  const second = adoptProject(repoDir, { move: true });
  assert.deepEqual(second.moved, [{ rel: 'CLAUDE.md', action: 'pointer' }]);
  assert.equal(fs.readFileSync(path.join(repoDir, 'CLAUDE.md'), 'utf8'), '<!-- repocanon:start -->\n@AGENTS.md\n<!-- repocanon:end -->\n');
  assert.ok(fs.existsSync(path.join(repoDir, '.cursor/rules/api.mdc')));
});

test('drift: tests, docs, lockfiles and driftIgnore patterns are classified; .ai never is', () => {
  const { classifyPath, toMatcher } = require('../src/core/drift');
  assert.equal(classifyPath('app/Services/Billing/BillingTest.php'), null);
  assert.equal(classifyPath('tests/Feature/BillingTest.php'), 'tests');
  assert.equal(classifyPath('src/billing/total.test.ts'), 'tests');
  assert.equal(classifyPath('pkg/billing/total_test.go'), 'tests');
  assert.equal(classifyPath('src/billing/README.md'), 'docs');
  assert.equal(classifyPath('package-lock.json'), 'lockfile');
  assert.equal(classifyPath('.ai/modules/billing.md'), null);
  assert.equal(classifyPath('src/billing/__snapshots__/a.snap', ['*.snap']), 'driftIgnore');
  assert.equal(classifyPath('src/generated/api.ts', ['src/generated/']), 'driftIgnore');
  assert.ok(toMatcher('src/**/*.gen.ts')('src/a/b/c.gen.ts'));
  assert.ok(!toMatcher('src/**/*.gen.ts')('lib/c.gen.ts'));
});

test('drift: only meaningful code changes make a module doc stale', () => {
  const { getDocStatus } = require('../src/services/status.service');
  const git = (dir, ...a) => cp.execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir, stdio: 'pipe' });
  const repoDir = createTempRepo({
    'src/billing/total.js': 'function total(a) {\n  return a;\n}\n',
    'src/billing/total.test.js': 'test(1)\n',
    'src/billing/NOTES.md': 'notes\n',
    'src/billing/old.js': 'x\n'
  });
  const head = git(repoDir, 'rev-parse', '--short', 'HEAD').toString().trim();
  fs.mkdirSync(path.join(repoDir, '.ai/modules'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, '.ai/modules/billing.md'), `---\nmodule: billing\nverified_at: ${head}\ncode_paths: [src/billing/]\n---\n# billing\n`);
  const billing = () => getDocStatus(repoDir).find(r => r.doc === '.ai/modules/billing.md');

  fs.writeFileSync(path.join(repoDir, 'src/billing/total.js'), 'function total(a)  {\n\n  return a;\n}\n');   // whitespace only
  fs.appendFileSync(path.join(repoDir, 'src/billing/total.test.js'), 'test(2)\n');
  fs.appendFileSync(path.join(repoDir, 'src/billing/NOTES.md'), 'more\n');
  git(repoDir, 'commit', '-qam', 'cosmetic');
  assert.equal(billing().state, 'fresh');
  assert.equal(billing().ignored, 3);
  assert.match(billing().detail, /3 test\/doc\/formatting change\(s\) ignored/);

  fs.writeFileSync(path.join(repoDir, '.repocanon.json'), JSON.stringify({ drift: 'all' }));
  assert.equal(billing().state, 'stale');                                   // old behaviour on request
  fs.unlinkSync(path.join(repoDir, '.repocanon.json'));

  git(repoDir, 'mv', 'src/billing/old.js', 'src/billing/legacy.js'); git(repoDir, 'commit', '-qm', 'rename');
  assert.equal(billing().state, 'stale');                                   // a moved file matters
  assert.match(billing().detail, /^2 code file\(s\) changed since verify \(3 /);
});

test('freshness score: weighted average of doc states, null without scored docs', () => {
  const { getFreshnessScore, formatScore } = require('../src/services/score.service');
  const rows = states => states.map((state, i) => ({ doc: `d${i}`, state }));
  const result = getFreshnessScore(null, rows(['fresh', 'fresh', 'stale', 'unverified', 'broken']));
  assert.equal(result.score, Math.round((100 + 100 + 25 + 50 + 0) / 5));
  assert.deepEqual(result.counts, { fresh: 2, stale: 1, broken: 1, unverified: 1, unknown: 0 });
  assert.equal(formatScore(result), 'Freshness 55/100 · 1 stale, 1 broken, 1 unverified');
  assert.equal(getFreshnessScore(null, rows(['n/a', 'n/a'])).score, null);
});

test('GitHub annotations: level mapping, file/line properties and escaping', () => {
  const { formatGithubAnnotation } = require('../src/cli/formatters');
  assert.equal(formatGithubAnnotation('warn', 'x', { file: '.ai/STATE.md', line: 3 }), '::warning file=.ai/STATE.md,line=3,title=RepoCanon::x');
  assert.equal(formatGithubAnnotation('error', '50% done\nnext', { file: 'a,b.md' }), '::error file=a%2Cb.md,title=RepoCanon::50%25 done%0Anext');
  assert.equal(formatGithubAnnotation('info', 'note'), '::notice title=RepoCanon::note');
});

test('memory: rc_propose_adr numbers, orders and guards decision records', () => {
  const { proposeAdr } = require('../src/services/memory.service');
  const now = new Date('2026-10-27T12:00:00Z');
  const repoDir = createTempRepo({ '.ai/DECISIONS.md': fs.readFileSync(path.join(__dirname, '../templates/DECISIONS.md'), 'utf8') });
  const doc = () => fs.readFileSync(path.join(repoDir, '.ai/DECISIONS.md'), 'utf8');

  assert.deepEqual(proposeAdr(repoDir, { title: 'Use Postgres', decision: 'One database', why: 'Transactions', now }).id, 'D-001');
  assert.doesNotMatch(doc(), /TODO title/);                                // template stub replaced
  fs.writeFileSync(path.join(repoDir, '.ai/DECISIONS.md'), doc().replace('## D-001', '## D-003'));
  const second = proposeAdr(repoDir, { title: 'Queue in Redis', decision: 'Redis', why: 'Simple', supersedes: 'd-003', now });
  assert.equal(second.id, 'D-004');
  assert.ok(doc().indexOf('## D-004 Queue in Redis (2026-10-27)') < doc().indexOf('## D-003'));  // newest on top
  assert.match(doc(), /- Supersedes: D-003/);

  const before = doc();
  assert.match(proposeAdr(repoDir, { title: 'use postgres', decision: 'x', why: 'y' }).problems[0], /already exists/);
  assert.match(proposeAdr(repoDir, { title: 'x', decision: 'two\nlines', why: '' }).problems.join(' '), /one line.*why is empty/);
  assert.match(proposeAdr(repoDir, { title: 'x', decision: 'y', why: 'z', supersedes: 'D-099' }).problems[0], /no decision D-099/);
  const fakeKey = ['ghp', '_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'].join('');
  assert.match(proposeAdr(repoDir, { title: 'Token', decision: `use ${fakeKey}`, why: 'y' }).problems[0], /possible GitHub token/);
  assert.equal(doc(), before);                                              // refused writes change nothing
});

test('memory: rc_checkpoint_state edits only the given sections and never stamps', () => {
  const { checkpointState } = require('../src/services/memory.service');
  const now = new Date('2026-10-27T12:00:00Z');
  const state = fs.readFileSync(path.join(__dirname, '../templates/STATE.md'), 'utf8').replace(/\{\{head\}\}/, 'abc1234').replace(/\{\{date\}\}/g, '2026-01-01');
  const repoDir = createTempRepo({ '.ai/STATE.md': state });
  const doc = () => fs.readFileSync(path.join(repoDir, '.ai/STATE.md'), 'utf8');

  const result = checkpointState(repoDir, { focus: 'Ship 0.6', in_progress: ['MCP write tools', 'Docs'], now });
  assert.deepEqual(result.sections, ['Current focus', 'In progress']);
  assert.match(doc(), /## Current focus\n- Ship 0\.6\n\n## In progress\n- MCP write tools\n- Docs\n\n## Known issues\n- TODO/);
  assert.match(doc(), /^Updated: 2026-10-27$/m);
  assert.match(doc(), /^verified_at: abc1234$/m);                           // no auto-stamp

  for (let i = 0; i < 12; i++) checkpointState(repoDir, { change: `change ${i}`, now });
  const recent = doc().split('## Recent significant changes')[1].split('\n').filter(l => l.startsWith('- '));
  assert.equal(recent.length, 10);
  assert.equal(recent[0], '- 2026-10-27: change 11');

  assert.match(checkpointState(repoDir, {}).problems[0], /nothing to record/);
  assert.match(checkpointState(repoDir, { in_progress: 'one' }).problems[0], /must be a list/);
});

test('stamp: verified_by records who checked; agents must name docs and cannot force', () => {
  const { stampDocs, getDocStatus } = require('../src/services/status.service');
  const { getFreshnessScore } = require('../src/services/score.service');
  const repoDir = createTempRepo({
    'src/billing/pay.js': 'pay()\n',
    '.ai/modules/billing.md': '---\nmodule: billing\ncode_paths: [src/billing]\nverified_at:\n---\n# Billing\n'
  });
  const doc = () => fs.readFileSync(path.join(repoDir, '.ai/modules/billing.md'), 'utf8');

  assert.equal(stampDocs(repoDir, { all: true, by: 'agent' }).needsTarget, true);   // no --all for agents
  fs.writeFileSync(path.join(repoDir, 'src/billing/pay.js'), 'pay(2)\n');
  assert.equal(stampDocs(repoDir, { names: ['billing'], force: true, by: 'agent' }).refused.length, 1); // force ignored
  cp.execFileSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=tester', 'commit', '-qam', 'pay'], { cwd: repoDir });

  assert.deepEqual(stampDocs(repoDir, { names: ['billing'], by: 'agent' }).stamped, ['.ai/modules/billing.md']);
  assert.match(doc(), /^verified_by: agent$/m);
  const row = getDocStatus(repoDir).find(r => r.doc === '.ai/modules/billing.md');
  assert.deepEqual([row.state, row.verifiedBy], ['fresh', 'agent']);
  assert.deepEqual(getFreshnessScore(repoDir).agentVerified, ['.ai/modules/billing.md']);

  stampDocs(repoDir, { names: ['billing'] });
  assert.match(doc(), /^verified_by: human$/m);
  assert.doesNotMatch(doc(), /verified_by: agent/);
  assert.deepEqual(getFreshnessScore(repoDir).agentVerified, []);
});

test('commands: classifier keeps checks, drops installs, deploys, secrets and watchers', () => {
  const { classifyCommand } = require('../src/core/commands');
  const cases = {
    'pnpm lint': 'lint', 'jest --ci': 'test', 'make check': 'check', check: 'check', 'npm run test:unit': 'test',
    'tsc --noEmit': 'typecheck', 'cargo fmt --check': 'format', 'ruff format --check .': 'format',
    'vendor/bin/phpstan analyse': 'lint', 'go vet ./...': 'lint', 'pytest -q': 'test',
    'npm ci': null, 'pnpm install --frozen-lockfile': null, 'npx playwright install --with-deps': null,
    'npm publish': null, 'echo ${{ secrets.TOKEN }}': null, 'jest --watch': null, 'npm run dev': null,
    'docker push app': null, 'curl -fsSL x.sh | sh': null, build: null
  };
  for (const [command, kind] of Object.entries(cases)) assert.equal(classifyCommand(command), kind, command);
});

test('commands: Makefile, justfile, Taskfile, GitHub Actions and GitLab parsers', () => {
  const c = require('../src/core/commands');
  assert.deepEqual(c.parseMakeTargets('.PHONY: test lint\nVAR := x\ntest:\n\tgo test ./...\n%.o: %.c\nlint: vet\n'), ['test', 'lint']);
  assert.deepEqual(c.parseJustRecipes('set shell := ["bash"]\nalias t := test\nversion := "1"\n[private]\ntest *args:\n  cargo test\n@lint:\n  cargo clippy\n'), ['test', 'lint']);
  assert.deepEqual(c.parseTaskfileTasks('version: 3\ntasks:\n  test:\n    cmds: [go test]\n  "lint:go":\n    cmds: [x]\nvars:\n  x: 1\n'), ['test', 'lint:go']);

  const workflow = [
    'jobs:', '  test:', '    steps:', '      - uses: actions/checkout@v4',
    '      - name: Lint', '        run: pnpm lint',
    '      - name: Tests', '        run: |', '          pnpm test -- --ci', '          pnpm exec tsc \\', '            --noEmit',
    '        env:', '          CI: 1',
    '      - run: "npm run format:check"'
  ].join('\n');
  assert.deepEqual(c.parseWorkflowRuns(workflow), [
    { step: 'Lint', command: 'pnpm lint' },
    { step: 'Tests', command: 'pnpm test -- --ci' },
    { step: 'Tests', command: 'pnpm exec tsc --noEmit' },
    { step: null, command: 'npm run format:check' }
  ]);
  assert.deepEqual(c.parseGitlabScripts('lint:\n  script:\n    - npm ci\n    - npm run lint\ntest:\n  script:\n  - npm test\n'), [
    { step: 'lint', command: 'npm ci' }, { step: 'lint', command: 'npm run lint' }, { step: 'test', command: 'npm test' }
  ]);
});

test('skills: verify-a-change skill from scripts, Makefile and CI, copied per tool', () => {
  const skills = require('../src/services/skills.service');
  const repoDir = createTempRepo({
    'package.json': JSON.stringify({ scripts: { dev: 'vite', lint: 'eslint .', test: 'vitest run', 'test:watch': 'vitest', release: 'np' } }),
    'pnpm-lock.yaml': '',
    'Makefile': '.PHONY: check\ncheck:\n\tpnpm lint && pnpm test\n',
    '.github/workflows/ci.yml': 'jobs:\n  ci:\n    steps:\n      - run: pnpm install\n      - name: Lint\n        run: pnpm lint\n      - name: Deploy\n        run: pnpm deploy\n',
    '.repocanon.json': JSON.stringify({ targets: ['claude', 'cursor'] })
  });
  const source = path.join(repoDir, '.ai/skills/rc-verify-change/SKILL.md');

  const entries = skills.collectVerifyCommands(repoDir);
  assert.deepEqual(entries.map(e => e.command), ['make check', 'pnpm lint', 'pnpm test']);
  assert.deepEqual(entries[1].sources, ['package.json', 'CI `ci.yml` › Lint']);   // one entry, both sources

  const plan = skills.applySkills(repoDir, skills.planSkills(repoDir));
  assert.deepEqual(plan.map(r => `${r.action} ${r.file}`), [
    'create .ai/skills/rc-verify-change/SKILL.md',
    'create .claude/skills/rc-verify-change/SKILL.md',
    'create .agents/skills/rc-verify-change/SKILL.md'
  ]);
  const text = fs.readFileSync(source, 'utf8');
  assert.deepEqual(skills.validateSkill(text, 'rc-verify-change'), []);
  assert.match(text, /Run `make check` \(Makefile\)[\s\S]*1\. \*\*Lint:\*\* `pnpm lint`[\s\S]*2\. \*\*Test:\*\* `pnpm test`/);
  assert.doesNotMatch(text, /deploy|vitest`|np`/);
  assert.equal(skills.getPendingSkills(skills.planSkills(repoDir)).length, 0);   // second run: up to date

  // Untouched source follows the evidence; an edited one becomes the user's
  fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint .', test: 'vitest run', typecheck: 'tsc' } }));
  assert.ok(skills.planSkills(repoDir).some(r => r.action === 'update' && r.kind === 'source'));
  fs.writeFileSync(source, text.replace('# Verify a change', '# Verify a change\n\nRun `pnpm db:up` first.'));
  const kept = skills.planSkills(repoDir);
  assert.equal(kept.find(r => r.kind === 'source').action, 'kept');
  assert.match(kept.find(r => r.file.startsWith('.claude/')).content, /pnpm db:up/);   // copies carry the edit

  // User-added skills are copied too; invalid ones and secrets are reported, not copied
  fs.mkdirSync(path.join(repoDir, '.ai/skills/deploy-notes'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, '.ai/skills/deploy-notes/SKILL.md'), '---\nname: deploy-notes\ndescription: How releases work here\n---\nAsk first.\n');
  fs.mkdirSync(path.join(repoDir, '.ai/skills/Bad_Name'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, '.ai/skills/Bad_Name/SKILL.md'), `---\nname: Bad_Name\ndescription: x\n---\ntoken ${['ghp', '_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'].join('')}\n`);
  const withUser = skills.planSkills(repoDir);
  assert.ok(withUser.some(r => r.file === '.agents/skills/deploy-notes/SKILL.md' && r.action === 'create'));
  const invalid = skills.getSkillProblems(withUser);
  assert.equal(invalid.length, 1);
  assert.match(invalid[0].reason, /lowercase.*possible GitHub token/);
  assert.ok(!withUser.some(r => r.file.includes('Bad_Name') && r.kind === 'copy'));
});

test('skills: nothing generated without evidence; RepoCanon never overwrites a skill it did not write', () => {
  const skills = require('../src/services/skills.service');
  assert.deepEqual(skills.planSkills(createTempRepo({ 'README.md': '# x\n' })), []);

  const repoDir = createTempRepo({
    'go.mod': 'module x\n',
    '.claude/skills/rc-verify-change/SKILL.md': '---\nname: rc-verify-change\ndescription: mine\n---\nmine\n',
    '.agents/skills/old/SKILL.md': '---\nname: old\ndescription: x\n---\n<!-- Generated by RepoCanon from .ai/skills/old/SKILL.md -->\n',
    '.repocanon.json': JSON.stringify({ targets: ['claude'] })
  });
  const plan = skills.applySkills(repoDir, skills.planSkills(repoDir));
  assert.match(fs.readFileSync(path.join(repoDir, '.ai/skills/rc-verify-change/SKILL.md'), 'utf8'), /`go test \.\/\.\.\.` \(project manifest\)/);
  assert.equal(plan.find(r => r.file.startsWith('.claude/')).action, 'conflict');
  assert.equal(fs.readFileSync(path.join(repoDir, '.claude/skills/rc-verify-change/SKILL.md'), 'utf8'), '---\nname: rc-verify-change\ndescription: mine\n---\nmine\n');
  assert.equal(fs.existsSync(path.join(repoDir, '.agents/skills/old')), false);   // our stale copy, tool not chosen
});

test('workspaces: pnpm, npm, nx, go.work and Cargo members become packages', () => {
  const { detectWorkspaces } = require('../src/core/workspaces');
  const files = obj => createTempRepo(obj);
  const list = dir => cp.execFileSync('git', ['ls-files'], { cwd: dir }).toString().trim().split('\n');
  const summary = ws => ws.packages.map(p => `${p.slug}:${p.dir}:${p.kind}`);

  let dir = files({
    'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - packages/*\n  - '!packages/legacy'\n",
    'turbo.json': '{}',
    'package.json': '{"name":"root"}',
    'apps/web/package.json': JSON.stringify({ name: '@acme/web', dependencies: { next: '15' } }),
    'apps/admin/package.json': JSON.stringify({ name: '@acme/web' }),
    'packages/ui/package.json': JSON.stringify({ name: '@acme/ui', dependencies: { react: '19' } }),
    'packages/legacy/package.json': '{"name":"legacy"}',
    'tools/x.js': ''
  });
  let ws = detectWorkspaces(dir, list(dir));
  assert.deepEqual(ws.tools, ['pnpm', 'turbo']);
  assert.deepEqual(summary(ws), ['apps-admin:apps/admin:app', 'apps-web:apps/web:app', 'ui:packages/ui:package']);  // twins named by path; react lib stays a package
  assert.ok(ws.packages.find(p => p.dir === 'apps/web').stacks.includes('Next.js'));

  dir = files({ 'package.json': JSON.stringify({ workspaces: { packages: ['services/**'] } }), 'services/api/package.json': JSON.stringify({ name: 'api', dependencies: { express: '4' } }), 'services/jobs/worker/package.json': '{"name":"worker"}' });
  assert.deepEqual(summary(detectWorkspaces(dir, list(dir))), ['api:services/api:app', 'worker:services/jobs/worker:package']);

  dir = files({ 'nx.json': '{}', 'libs/auth/project.json': '{"name":"auth"}', 'apps/shop/project.json': '{"name":"shop"}' });
  assert.deepEqual(summary(detectWorkspaces(dir, list(dir))), ['shop:apps/shop:app', 'auth:libs/auth:package']);

  dir = files({ 'go.work': 'go 1.22\n\nuse (\n\t./cmd/api\n\t./pkg/billing\n)\n', 'cmd/api/go.mod': 'module example.com/api\n', 'pkg/billing/go.mod': 'module example.com/billing\n' });
  assert.deepEqual(summary(detectWorkspaces(dir, list(dir))), ['api:cmd/api:package', 'billing:pkg/billing:package']);

  dir = files({ 'Cargo.toml': '[workspace]\nmembers = [\n  "crates/*",\n]\n', 'crates/core/Cargo.toml': '[package]\nname = "acme-core"\n', 'crates/cli/Cargo.toml': '[package]\nname = "acme-cli"\n' });
  assert.deepEqual(detectWorkspaces(dir, list(dir)).packages.map(p => p.slug), ['acme-cli', 'acme-core']);

  dir = files({ 'package.json': JSON.stringify({ workspaces: ['packages/*'] }), 'packages/only/package.json': '{}' });
  assert.equal(detectWorkspaces(dir, list(dir)), null);                     // one package is not a monorepo
});

test('monorepo modules: library packages whole, apps split by feature, root tooling ignored', () => {
  const { detectWorkspaces } = require('../src/core/workspaces');
  const repoDir = createTempRepo({
    'pnpm-workspace.yaml': 'packages:\n  - apps/*\n  - packages/*\n',
    'package.json': '{"name":"root"}', 'scripts/release.js': '',
    'apps/web/package.json': JSON.stringify({ name: '@acme/web', dependencies: { react: '19', express: '4' } }),
    'apps/web/src/modules/billing/a.ts': '', 'apps/web/src/modules/auth/a.ts': '',
    'apps/docs/package.json': JSON.stringify({ name: 'docs', dependencies: { express: '4' } }), 'apps/docs/index.js': '',
    'packages/ui/package.json': JSON.stringify({ name: '@acme/ui' }), 'packages/ui/src/button.tsx': ''
  });
  const files = cp.execFileSync('git', ['ls-files'], { cwd: repoDir }).toString().trim().split('\n');
  const ws = detectWorkspaces(repoDir, files);
  const mods = detectModules(files, { preset: 'auto' }, [], ws);
  assert.deepEqual(mods.map(m => `${m.slug}:${m.paths.join(',')}`), [
    'docs:apps/docs/', 'ui:packages/ui/', 'web-auth:apps/web/src/modules/auth/', 'web-billing:apps/web/src/modules/billing/'
  ]);
  assert.deepEqual(detectModules(files, { preset: 'auto', moduleRoots: ['packages'] }, [], ws).map(m => m.slug), ['ui']);  // explicit roots win
  assert.match(cfApi.overview(repoDir).d.stacks.join(','), /Express/);                    // package stacks reach the overview
});
