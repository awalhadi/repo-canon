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
