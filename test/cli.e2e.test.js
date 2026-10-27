const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const CLI = path.join(__dirname, '..', 'bin', 'repocanon.js');
const g = (d, ...a) => cp.execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d, stdio: 'pipe' });
const cf = (d, ...a) => cp.spawnSync('node', [CLI, ...a], { cwd: d, encoding: 'utf8' });
function repo(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-'));
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); }
  g(d, 'init', '-q'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'i'); return d;
}
const laravel = () => repo({ 'composer.json': '{"require":{"laravel/framework":"^11"}}', 'app/Services/Billing/S.php': 'x', 'app/Actions/Billing/A.php': 'x',
  'resources/js/Pages/Billing/P.vue': 'x', 'app/Services/Auth/S.php': 'x', 'database/migrations/1.php': 'x' });

test('safeRef rejects option injection, accepts real refs', () => {
  const { isSafeRef: safeRef } = require('../src/core/git');
  for (const bad of ['--output=/tmp/x', '-p', 'a b', 'x;rm', '$(id)', '']) assert.equal(safeRef(bad), false, bad);
  for (const ok of ['abc1234', 'HEAD~1', 'main', 'v1.0.0', 'HEAD@{1}']) assert.equal(safeRef(ok), true, ok);
});

test('laravel preset merges one domain across layers', () => {
  const d = laravel(); const r = JSON.parse(cf(d, 'analyze', '--scaffold').stdout.length ? '{}' : '{}');
  const doc = fs.readFileSync(path.join(d, '.ai/modules/billing.md'), 'utf8');
  for (const p of ['app/Services/Billing/', 'app/Actions/Billing/', 'resources/js/Pages/Billing/']) assert.ok(doc.includes(p), p);
});

test('init preserves existing CLAUDE.md and is idempotent', () => {
  const d = repo({ 'CLAUDE.md': 'MY OWN RULES\n', 'package.json': '{}' });
  cf(d, 'init'); const a = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  assert.ok(a.includes('MY OWN RULES') && a.includes('AGENTS.md'));
  assert.match(a, /repocanon:start -->\n@AGENTS\.md\n<!-- repocanon:end/);   // import, not a read-me pointer
  cf(d, 'init'); assert.equal(fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8'), a);
  assert.equal((a.match(/repocanon:start/g) || []).length, 1);
});

test('init --targets writes only the chosen tools and saves the choice', () => {
  const d = repo({ 'package.json': '{}' });
  const r = cf(d, 'init', '--targets=claude,cursor');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(d, 'CLAUDE.md')) && fs.existsSync(path.join(d, '.cursor/rules/project.mdc')));
  for (const f of ['GEMINI.md', '.windsurfrules', '.clinerules', '.github/copilot-instructions.md']) assert.equal(fs.existsSync(path.join(d, f)), false, f);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, '.repocanon.json'), 'utf8')).targets, ['claude', 'cursor']);
  assert.match(r.stdout, /Tools: Claude Code, Cursor/);
});

test('init re-run with saved targets is a no-op and says so', () => {
  const d = repo({ 'package.json': '{}' }); cf(d, 'init', '--targets=claude,codex');
  const snap = () => ['AGENTS.md', 'CLAUDE.md', '.repocanon.json', '.ai/STATE.md'].map(f => fs.readFileSync(path.join(d, f), 'utf8'));
  const before = snap();
  const r = cf(d, 'init');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Up to date — 2 tool\(s\): Claude Code, OpenAI Codex \/ ChatGPT\. Nothing changed\./);
  assert.deepEqual(snap(), before);
});

test('init: deselected tools are kept unless --prune; prune keeps user text', () => {
  const d = repo({ 'package.json': '{}', 'CLAUDE.md': 'MY OWN RULES\n' }); cf(d, 'init', '--targets=claude,cursor');
  const kept = cf(d, 'init', '--targets=cursor');
  assert.match(kept.stdout, /! CLAUDE\.md \(not selected — kept; use --prune to remove\)/);
  assert.match(fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8'), /@AGENTS\.md/);
  const pruned = cf(d, 'init', '--targets=none', '--prune');
  assert.equal(pruned.status, 0, pruned.stderr);
  assert.equal(fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8'), 'MY OWN RULES\n');
  assert.equal(fs.existsSync(path.join(d, '.cursor/rules/project.mdc')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, '.repocanon.json'), 'utf8')).targets, []);
});

test('init: unknown or empty --targets fails with the valid list; no tools detected → AGENTS.md only', () => {
  const d = repo({ 'package.json': '{}' });
  const bad = cf(d, 'init', '--targets=claude,zed');
  assert.equal(bad.status, 1); assert.match(bad.stderr, /unknown target zed — choose from: claude, cursor/);
  assert.equal(fs.existsSync(path.join(d, '.ai')), false);
  assert.equal(cf(d, 'init', '--targets').status, 1);
  const r = cf(d, 'init');
  assert.match(r.stdout, /No AI tool detected, so only AGENTS\.md was written/);
  assert.ok(fs.existsSync(path.join(d, 'AGENTS.md')));
  for (const f of ['CLAUDE.md', 'GEMINI.md', '.cursor/rules/project.mdc']) assert.equal(fs.existsSync(path.join(d, f)), false, f);
});

test('malicious code_paths / verified_at never reach a shell', () => {
  const d = laravel(); cf(d, 'init'); cf(d, 'analyze', '--scaffold');
  const pwn = path.join(os.tmpdir(), 'cf-pwned-' + process.pid);
  const f = path.join(d, '.ai/modules/billing.md'); let t = fs.readFileSync(f, 'utf8');
  t = t.replace(/code_paths:.*/, `code_paths: ["; touch ${pwn}; ", $(touch ${pwn})]`).replace(/verified_at:.*/, `verified_at: HEAD; touch ${pwn}`);
  fs.writeFileSync(f, t);
  cf(d, 'status'); cf(d, 'sync');
  assert.equal(fs.existsSync(pwn), false);
});

test('status/sync flag changed module; stamp clears it', () => {
  const d = laravel(); cf(d, 'init'); cf(d, 'analyze', '--scaffold'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'docs'); cf(d, 'stamp', '--all'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 's');
  assert.match(cf(d, 'status').stdout, /billing\.md\s+fresh/);
  fs.appendFileSync(path.join(d, 'app/Services/Billing/S.php'), 'y'); g(d, 'commit', '-qam', 'c');
  assert.match(cf(d, 'status').stdout, /billing\.md\s+stale/);
  assert.match(cf(d, 'sync').stdout, /billing\*\* — 1 file/);
  assert.equal(cf(d, 'status', '--ci').status, 1);
});

test('stamp: bare stamp refuses and changes nothing', () => {
  const d = laravel(); cf(d, 'init'); cf(d, 'analyze', '--scaffold'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'docs');
  const r = cf(d, 'stamp');
  assert.equal(r.status, 1); assert.match(r.stderr, /needs a doc name \(or --all\)/);
  assert.equal(g(d, 'status', '--porcelain').toString(), '');
});

test('stamp: names match exactly, never by substring', () => {
  const d = laravel(); cf(d, 'init');
  const mod = n => `---\nmodule: ${n}\nverified_at:\ncode_paths: [app/Services/Auth/]\n---\n# ${n}\n`;
  fs.writeFileSync(path.join(d, '.ai/modules/user.md'), mod('user'));
  fs.writeFileSync(path.join(d, '.ai/modules/users.md'), mod('users'));
  g(d, 'add', '-A'); g(d, 'commit', '-qm', 'docs');
  const r = cf(d, 'stamp', 'user');
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /modules\/user\.md/); assert.doesNotMatch(r.stdout, /users\.md|STATE/);
  assert.match(fs.readFileSync(path.join(d, '.ai/modules/user.md'), 'utf8'), /verified_at: [0-9a-f]{7}/);
  assert.match(fs.readFileSync(path.join(d, '.ai/modules/users.md'), 'utf8'), /verified_at:\s*\n/);
  const u = cf(d, 'stamp', 'nope'); assert.equal(u.status, 1); assert.match(u.stderr, /no doc named nope/);
});

test('stamp: uncommitted code_paths are refused unless --force', () => {
  const d = laravel(); cf(d, 'init'); cf(d, 'analyze', '--scaffold'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'docs');
  fs.appendFileSync(path.join(d, 'app/Services/Billing/S.php'), 'dirty');
  const r = cf(d, 'stamp', 'billing');
  assert.equal(r.status, 1); assert.match(r.stdout, /✗ .ai\/modules\/billing\.md: uncommitted changes \(app\/Services\/Billing\/S\.php\)/);
  assert.match(cf(d, 'stamp', 'auth').stdout, /✓ .ai\/modules\/auth\.md/);   // other modules unaffected
  const f = cf(d, 'stamp', 'billing', '--force'); assert.equal(f.status, 0); assert.match(f.stdout, /✓ .ai\/modules\/billing\.md/);
});

test('doctor: errors without AGENTS reference, --ci exit code', () => {
  const d = laravel(); cf(d, 'init'); assert.equal(cf(d, 'doctor', '--ci').status, 0);
  fs.writeFileSync(path.join(d, 'AGENTS.md'), 'nothing here\n');
  const r = cf(d, 'doctor', '--ci'); assert.equal(r.status, 1); assert.match(r.stdout, /AGENTS\.md does not reference/);
});

test('context pack respects token budget and picks the right module', () => {
  const d = laravel(); cf(d, 'init'); cf(d, 'analyze', '--scaffold');
  fs.writeFileSync(path.join(d, '.ai/DOMAIN.md'), '# D\n' + 'rule\n'.repeat(5000));
  const { packContext: pack } = require('../src/services/pack.service'); const r = pack(d, { query: 'billing refund', maxTokens: 800 });
  assert.ok(r.tokens <= 800, `tokens ${r.tokens}`); assert.ok(r.modules.includes('billing')); assert.ok(!r.modules.includes('auth'));
});

test('mcp: initialize, list, call over stdio', async () => {
  const d = laravel(); cf(d, 'init'); cf(d, 'analyze', '--scaffold');
  const p = cp.spawn('node', [CLI, 'mcp'], { cwd: d }); let buf = '';
  p.stdout.on('data', c => buf += c);
  const send = (id, method, params) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  send(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } });
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  send(2, 'tools/list', {}); send(3, 'tools/call', { name: 'rc_find_owner', arguments: { path: 'app/Actions/Billing/A.php' } });
  send(4, 'tools/call', { name: 'rc_module', arguments: { name: '../../etc/passwd' } });
  await new Promise(r => setTimeout(r, 1200)); p.kill();
  const msgs = buf.trim().split('\n').map(JSON.parse);
  assert.equal(msgs.length, 4);
  assert.equal(msgs[0].result.serverInfo.name, 'repocanon');
  assert.equal(msgs[1].result.tools.length, 6);
  assert.match(msgs[2].result.content[0].text, /billing/);
  assert.equal(msgs[3].result.isError, true);      // traversal attempt is neutralised (slugged), no file read
});

test('prompt fill: rich brief never leaks env values, filters vendor/idea noise, has phases', () => {
  const d = repo({
    'composer.json': '{"require":{"laravel/framework":"^11"}}',
    'app/Http/Controllers/Admin/D.php': 'x', 'app/Http/Controllers/vendor/P.php': 'x',
    '.env.example': 'DB_PASSWORD=hunter2\nAPP_KEY=base64:SECRET\n', '.idea/x.xml': 'x',
  });
  cf(d, 'init');
  const out = cf(d, 'prompt', 'fill').stdout;
  assert.doesNotMatch(out, /hunter2|SECRET/);
  assert.match(out, /names only — values never read/);
  assert.doesNotMatch(out, /\bvendor\b.*Code paths|\| vendor \|/);
  assert.match(out, /\.idea\/.*skip/);
  assert.match(out, /Phase 1/); assert.match(out, /Phase 6/);
  assert.match(out, /Self-review/);
});

test('prompt fill --compact stays short and still lists detected modules', () => {
  const d = laravel(); cf(d, 'init');
  const out = cf(d, 'prompt', 'fill', '--compact').stdout;
  assert.ok(out.length < 2000, `compact brief too long: ${out.length}`);
  assert.match(out, /billing/);
});

test('doctor token budget reflects repo size', () => {
  const d = laravel(); cf(d, 'init');
  const r = JSON.parse(cf(d, 'doctor', '--json').stdout);
  assert.ok(r.budget.entryTokens > 0 && r.budget.repoTokens >= 0);
  assert.ok(!r.findings.some(f => /entry context/.test(f.msg)), 'fresh init must fit the entry budget');
  fs.appendFileSync(path.join(d, '.ai/PROJECT.md'), 'Overview of every folder in the repo. '.repeat(400));
  const big = JSON.parse(cf(d, 'doctor', '--json').stdout);
  assert.ok(big.findings.some(f => f.level === 'warn' && /entry context/.test(f.msg)));
});

test('doctor checks pointer files only for the chosen tools', () => {
  const d = repo({ 'package.json': '{}' }); cf(d, 'init', '--targets=claude');
  let r = JSON.parse(cf(d, 'doctor', '--json').stdout);
  assert.ok(!r.findings.some(f => /GEMINI|windsurf|clinerules|copilot|cursor/i.test(f.msg)), JSON.stringify(r.findings));
  fs.writeFileSync(path.join(d, 'CLAUDE.md'), 'just my notes\n');
  r = JSON.parse(cf(d, 'doctor', '--json').stdout);
  assert.ok(r.findings.some(f => f.level === 'warn' && /CLAUDE\.md: RepoCanon block missing \(Claude Code/.test(f.msg)));
});

test('doctor flags inferable content with file:line but --ci still passes; fill brief says what not to write', () => {
  const d = laravel(); cf(d, 'init', '--targets=claude');
  fs.appendFileSync(path.join(d, '.ai/PROJECT.md'), '\n```\napp/\n├── Services/\n│   └── Billing/\n└── Models/\n```\n\n```js\nfunction total(items) {\n  return items.length;\n}\n```\n');
  const r = JSON.parse(cf(d, 'doctor', '--json').stdout);
  const msgs = r.findings.filter(f => f.level === 'warn').map(f => f.msg);
  assert.ok(msgs.some(m => /^\.ai\/PROJECT\.md:\d+ directory tree \(~\d+ tokens\)/.test(m)), msgs.join('\n'));
  assert.ok(msgs.some(m => /^\.ai\/PROJECT\.md:\d+ pasted source code/.test(m)), msgs.join('\n'));
  assert.ok(r.findings.some(f => f.level === 'info' && /tokens in \.ai\/ describe what agents can read from the code/.test(f.msg)));
  assert.equal(cf(d, 'doctor', '--ci').status, 0);
  assert.match(cf(d, 'prompt', 'fill').stdout, /\*\*Do not write\*\*/);
});

test('secrets: doctor --ci fails, `secrets` reports masked, and the hook blocks the commit', () => {
  const d = laravel(); cf(d, 'init', '--targets=claude'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'docs');
  const token = 'ghp_' + 'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xYz2Q4';   // built here, never a real token
  fs.appendFileSync(path.join(d, '.ai/STATE.md'), `\n- deploy token: ${token}\n`);

  const doc = cf(d, 'doctor', '--ci');
  assert.equal(doc.status, 1);
  assert.match(doc.stdout, /\.ai\/STATE\.md:\d+ possible GitHub token \(ghp_…\)/);
  assert.doesNotMatch(doc.stdout, new RegExp(token));
  assert.equal(cf(d, 'secrets').status, 1);

  // hook resolves RepoCanon from node_modules/.bin, as an installed devDependency would
  fs.mkdirSync(path.join(d, 'node_modules/.bin'), { recursive: true });
  fs.writeFileSync(path.join(d, 'node_modules/.bin/repocanon'), `#!/bin/sh\nexec node "${CLI}" "$@"\n`, { mode: 0o755 });
  assert.match(cf(d, 'hook').stdout, /installed/);
  g(d, 'add', '.ai/STATE.md');
  const blocked = cp.spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'leak'], { cwd: d, encoding: 'utf8' });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stdout + blocked.stderr, /commit blocked — secret in staged docs/);

  fs.writeFileSync(path.join(d, '.ai/STATE.md'), fs.readFileSync(path.join(d, '.ai/STATE.md'), 'utf8').replace(token, 'stored in the CI secret store'));
  g(d, 'add', '.ai/STATE.md');
  const ok = cp.spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'clean'], { cwd: d, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(cf(d, 'secrets', '--quiet').stdout, '');
});

test('context packs label stale and unverified docs; fresh docs carry no label', () => {
  const d = laravel(); cf(d, 'init', '--targets=claude'); cf(d, 'analyze', '--scaffold');
  g(d, 'add', '-A'); g(d, 'commit', '-qm', 'docs');
  cf(d, 'stamp', 'billing', 'project'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'stamp');
  const { packContext } = require('../src/services/pack.service');

  let r = packContext(d, { query: 'billing auth', maxTokens: 4000 });
  assert.equal(r.freshness['.ai/modules/billing.md'], 'fresh');
  assert.equal(r.freshness['.ai/modules/auth.md'], 'unverified');
  assert.doesNotMatch(r.text, /## \.ai\/modules\/billing\.md\n>/);
  assert.match(r.text, /## \.ai\/modules\/auth\.md\n> ○ unverified: never checked against the code/);

  fs.appendFileSync(path.join(d, 'app/Services/Billing/S.php'), 'changed'); g(d, 'commit', '-qam', 'billing change');
  r = packContext(d, { query: 'billing', maxTokens: 4000 });
  assert.equal(r.freshness['.ai/modules/billing.md'], 'stale');
  assert.match(r.text, /## \.ai\/modules\/billing\.md\n> ⚠ stale: 1 code file\(s\) changed since verify — where it disagrees with the code, trust the code\./);
  assert.ok(r.tokens <= 4000);

  const { executeTool } = require('../src/mcp/tools');
  assert.match(executeTool(d, 'rc_context', { query: 'billing' }), /\| stale: modules\/billing\.md$/);
  assert.match(cf(d, 'context', 'billing').stderr, /\| 1 stale\]/);
});

test('setup: uses the tools init saved, second run is a no-op, unknown tools fail', () => {
  const d = repo({ 'package.json': '{}' });
  assert.equal(cf(d, 'setup').status, 1);
  cf(d, 'init', '--targets=claude,cursor');
  const first = cf(d, 'setup');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /\+ \.mcp\.json \(created/); assert.match(first.stdout, /\+ \.cursor\/mcp\.json \(created/);
  const second = cf(d, 'setup');
  assert.match(second.stdout, /= \.mcp\.json \(already set up\)/); assert.doesNotMatch(second.stdout, /Restart/);
  assert.match(cf(d, 'setup', 'codex').stdout, /global config, paste this into ~\/\.codex\/config\.toml/);
  const bad = cf(d, 'setup', 'zed'); assert.equal(bad.status, 1); assert.match(bad.stderr, /unknown tool zed/);
});
