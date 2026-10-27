const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const CLI = path.join(__dirname, '..', 'bin', 'repocanon.js');
const g = (d, ...a) => cp.execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d, stdio: 'pipe' });
// Plain output whatever the caller's terminal: `npm publish` runs tests with FORCE_COLOR set
const PLAIN_ENV = (({ FORCE_COLOR, ...env }) => ({ ...env, NO_COLOR: '1' }))(process.env);
const cf = (d, ...a) => cp.spawnSync('node', [CLI, ...a], { cwd: d, encoding: 'utf8', env: PLAIN_ENV });
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
  assert.match(r.stdout, /Tools  Claude Code, Cursor/);
});

test('init re-run with saved targets is a no-op and says so', () => {
  const d = repo({ 'package.json': '{}' }); cf(d, 'init', '--targets=claude,codex');
  const snap = () => ['AGENTS.md', 'CLAUDE.md', '.repocanon.json', '.ai/STATE.md'].map(f => fs.readFileSync(path.join(d, f), 'utf8'));
  const before = snap();
  const r = cf(d, 'init');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Tools  Claude Code, OpenAI Codex \/ ChatGPT\n[\s\S]*✓ Up to date: nothing changed/);
  assert.deepEqual(snap(), before);
});

test('init: deselected tools are kept unless --prune; prune keeps user text', () => {
  const d = repo({ 'package.json': '{}', 'CLAUDE.md': 'MY OWN RULES\n' }); cf(d, 'init', '--targets=claude,cursor');
  const kept = cf(d, 'init', '--targets=cursor');
  assert.match(kept.stdout, /=\s+CLAUDE\.md\s+kept · tool not selected · --prune removes it/);
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
  assert.match(cf(d, 'sync').stdout, /!\s+billing\s+1 file\(s\) changed since/);
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
  assert.equal(r.status, 1); assert.match(r.stdout, /✗\s+\.ai\/modules\/billing\.md\s+not stamped[\s\S]*→ uncommitted changes \(app\/Services\/Billing\/S\.php\)/);
  assert.match(cf(d, 'stamp', 'auth').stdout, /✓\s+\.ai\/modules\/auth\.md/);   // other modules unaffected
  const f = cf(d, 'stamp', 'billing', '--force'); assert.equal(f.status, 0); assert.match(f.stdout, /✓\s+\.ai\/modules\/billing\.md/);
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
  assert.equal(msgs[1].result.tools.length, 10);
  assert.ok(msgs[1].result.tools.every(t => typeof t.annotations.readOnlyHint === 'boolean'));
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
  assert.match(cf(d, 'context', 'billing').stderr, /1 stale \(labelled in the pack\)/);
});

test('setup: uses the tools init saved, second run is a no-op, unknown tools fail', () => {
  const d = repo({ 'package.json': '{}' });
  assert.equal(cf(d, 'setup').status, 1);
  cf(d, 'init', '--targets=claude,cursor');
  const first = cf(d, 'setup');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /\+\s+\.mcp\.json\s+created/); assert.match(first.stdout, /\+\s+\.cursor\/mcp\.json\s+created/);
  const second = cf(d, 'setup');
  assert.match(second.stdout, /=\s+\.mcp\.json\s+unchanged · already set up/); assert.doesNotMatch(second.stdout, /restart or reload/);
  assert.match(cf(d, 'setup', 'codex').stdout, /global config: paste this into ~\/\.codex\/config\.toml/);
  const bad = cf(d, 'setup', 'zed'); assert.equal(bad.status, 1); assert.match(bad.stderr, /unknown tool zed/);
});

test('agent-hook: session context names stale docs; stop nudges once for undocumented module changes', () => {
  const d = laravel(); cf(d, 'init', '--targets=claude'); cf(d, 'analyze', '--scaffold');
  g(d, 'add', '-A'); g(d, 'commit', '-qm', 'docs'); cf(d, 'stamp', '--all'); g(d, 'commit', '-qam', 'stamp');
  const hook = (event, input) => cp.spawnSync('node', [CLI, 'agent-hook', event], { cwd: d, encoding: 'utf8', input });

  const plain = repo({ 'x.txt': 'x' });
  assert.equal(cp.spawnSync('node', [CLI, 'agent-hook', 'session-start'], { cwd: plain, encoding: 'utf8' }).stdout, '');

  assert.match(hook('session-start').stdout, /call the rc_context MCP tool/);
  assert.equal(hook('stop', '{"stop_hook_active":false}').stdout, '');

  fs.appendFileSync(path.join(d, 'app/Services/Billing/S.php'), 'changed');
  const nudge = JSON.parse(hook('stop', '{"stop_hook_active":false}').stdout);
  assert.equal(nudge.decision, 'block');
  assert.match(nudge.reason, /app\/Services\/Billing\/S\.php \(module billing\) without updating \.ai\/modules\/billing\.md/);
  assert.equal(hook('stop', '{"stop_hook_active":true}').stdout, '');      // never loops
  assert.equal(hook('stop', 'not json').status, 0);

  fs.appendFileSync(path.join(d, '.ai/modules/billing.md'), '\n- refunds now need approval\n');
  assert.equal(hook('stop', '{}').stdout, '');                            // doc updated → let it stop

  g(d, 'commit', '-qam', 'billing + doc');
  assert.match(hook('session-start').stdout, /Stale docs \(code changed since they were verified\): modules\/billing\.md/);
});

test('rules: init writes scoped rules for filled modules; --check and doctor catch drift', () => {
  const d = laravel(); cf(d, 'init', '--targets=cursor'); cf(d, 'analyze', '--scaffold');
  assert.match(cf(d, 'rules').stdout, /✓ Up to date · 0 scoped rule file\(s\)/);     // stubs only

  const doc = path.join(d, '.ai/modules/billing.md');
  fs.writeFileSync(doc, fs.readFileSync(doc, 'utf8').replace('1–2 lines.', 'Charges customers and issues refunds.'));
  const init = cf(d, 'init');
  assert.match(init.stdout, /Scoped rules\s+1 file\(s\) updated: \.cursor\/rules\/rc-billing\.mdc/);
  assert.equal(cf(d, 'rules', '--check').status, 0);

  fs.appendFileSync(doc, '\n## Gotchas\n- Refunds run in a queue; never refund inline.\n');
  const check = cf(d, 'rules', '--check');
  assert.equal(check.status, 1); assert.match(check.stdout, /~\s+\.cursor\/rules\/rc-billing\.mdc\s+updated · pending/);
  assert.ok(JSON.parse(cf(d, 'doctor', '--json').stdout).findings.some(f => /scoped rule files are out of date/.test(f.msg)));
  cf(d, 'rules');
  assert.match(fs.readFileSync(path.join(d, '.cursor/rules/rc-billing.mdc'), 'utf8'), /never refund inline/);
  assert.equal(cf(d, 'rules', '--check').status, 0);
});

test('adopt: one command from CLAUDE.md + memory bank to a clean, doctor-passing layer; --dry-run writes nothing', () => {
  const d = repo({ 'package.json': '{}', 'CLAUDE.md': '# App\n\n## Conventions\n- Money is stored in cents.\n', 'memory-bank/activeContext.md': '# Now\n- Migrating auth to OIDC.\n' });
  const dry = cf(d, 'adopt', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /dry run: nothing written/);
  assert.equal(fs.existsSync(path.join(d, '.ai')), false);

  const r = cf(d, 'adopt');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Created the knowledge layer/);
  assert.match(r.stdout, /Imported \d+ tokens from 2 file\(s\)/);
  assert.match(fs.readFileSync(path.join(d, '.ai/STATE.md'), 'utf8'), /Migrating auth to OIDC/);
  const doc = JSON.parse(cf(d, 'doctor', '--json').stdout);
  assert.ok(!doc.findings.some(f => f.level === 'error'), JSON.stringify(doc.findings));
  assert.ok(!doc.findings.some(f => /tokens in \.ai\/ describe what agents can read/.test(f.msg)));
});

test('CI output: GitHub annotations in Actions, --strict fails on warnings, status shows the score', () => {
  const d = laravel(); cf(d, 'init', '--targets=claude');
  fs.appendFileSync(path.join(d, '.ai/PROJECT.md'), '\n```\napp/\n├── a\n├── b\n└── c\n```\n');
  const env = { ...PLAIN_ENV, GITHUB_ACTIONS: 'true' };
  const gh = cp.spawnSync('node', [CLI, 'doctor', '--ci'], { cwd: d, encoding: 'utf8', env });
  assert.equal(gh.status, 0);
  assert.match(gh.stdout, /^::warning file=\.ai\/PROJECT\.md,line=\d+,title=RepoCanon::\.ai\/PROJECT\.md:\d+ directory tree/m);
  assert.match(gh.stdout, /^Freshness \d+\/100/m);
  assert.equal(cp.spawnSync('node', [CLI, 'doctor', '--ci', '--strict'], { cwd: d, encoding: 'utf8', env }).status, 1);
  assert.doesNotMatch(cf(d, 'doctor').stdout, /^::/m);                         // plain output outside Actions
  assert.match(cf(d, 'status').stdout, /Freshness \S+ \d+\/100/);
  assert.equal(typeof JSON.parse(cf(d, 'status', '--json').stdout).score.score, 'number');
});

test('report: PR summary flags modules changed without docs, then clears when the doc moves too', () => {
  const d = laravel(); cf(d, 'init', '--targets=claude'); cf(d, 'analyze', '--scaffold');
  g(d, 'add', '-A'); g(d, 'commit', '-qm', 'docs'); g(d, 'branch', '-M', 'main'); g(d, 'checkout', '-qb', 'feature');
  fs.appendFileSync(path.join(d, 'app/Services/Billing/S.php'), 'new rule');
  fs.appendFileSync(path.join(d, 'app/Services/Auth/S.php'), '   ');                 // whitespace only
  g(d, 'commit', '-qam', 'billing change');

  let r = cf(d, 'report', '--base=main');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^<!-- repocanon-report -->\n### RepoCanon: ⚠️ 1 module\(s\) changed without their docs/);
  assert.match(r.stdout, /\| `billing` \| 1 file\(s\) \| ⚠️ not updated — `\.ai\/modules\/billing\.md` \|/);
  assert.doesNotMatch(r.stdout, /`auth`/);
  assert.match(r.stdout, /\*\*Freshness \d+\/100/);

  fs.appendFileSync(path.join(d, '.ai/modules/billing.md'), '\n- New rule documented.\n'); g(d, 'commit', '-qam', 'doc');
  r = cf(d, 'report', '--base=main');
  assert.match(r.stdout, /### RepoCanon: ✅ Docs keep up with this PR/);
  assert.match(r.stdout, /\| `billing` \| 1 file\(s\) \| ✅ updated \|/);
  assert.equal(JSON.parse(cf(d, 'report', '--base=main', '--json').stdout).modules[0].docState, 'updated');
  assert.equal(cf(d, 'report', '--base=nope').status, 1);
});

test('GitHub Action: inputs and steps are wired; the comment script updates instead of duplicating', () => {
  const root = path.join(__dirname, '..');
  const action = fs.readFileSync(path.join(root, 'action.yml'), 'utf8');
  for (const needle of ['fail-on:', 'comment:', 'version:', 'using: composite', 'doctor --ci --format=github', 'report --base=', 'action/pr-comment.sh', 'GITHUB_STEP_SUMMARY']) {
    assert.ok(action.includes(needle), needle);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-gh-'));
  const log = path.join(tmp, 'calls.log');
  fs.writeFileSync(path.join(tmp, 'gh'), `#!/bin/sh\necho "$@" >> "${log}"\n[ "$1 $2" = "api repos/o/r/issues/7/comments" ] && [ -n "$EXISTING" ] && echo "$EXISTING"\nexit 0\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(tmp, 'report.md'), '<!-- repocanon-report -->\nhi\n');
  const run = existing => cp.spawnSync('bash', [path.join(root, 'action/pr-comment.sh')], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${tmp}:${process.env.PATH}`, GITHUB_REPOSITORY: 'o/r', PR_NUMBER: '7', REPORT_FILE: path.join(tmp, 'report.md'), EXISTING: existing }
  });

  assert.match(run('').stdout, /posted PR comment/);
  assert.match(fs.readFileSync(log, 'utf8'), /api -X POST repos\/o\/r\/issues\/7\/comments -F body=@/);
  fs.writeFileSync(log, '');
  assert.match(run('42').stdout, /updated PR comment 42/);
  assert.match(fs.readFileSync(log, 'utf8'), /api -X PATCH repos\/o\/r\/issues\/comments\/42 -F body=@/);
});

test('mcp write tools: ADR, checkpoint, then stale → rc_stamp → rc_verify PASS', async () => {
  const d = laravel(); cf(d, 'init', '--targets=claude'); cf(d, 'analyze', '--scaffold');
  g(d, 'add', '-A'); g(d, 'commit', '-qm', 'docs'); cf(d, 'stamp', '--all'); g(d, 'commit', '-qam', 'stamp');
  const p = cp.spawn('node', [CLI, 'mcp'], { cwd: d }); let buf = '';
  p.stdout.on('data', c => buf += c);
  let id = 0; const pending = new Map();
  p.stdout.on('data', () => {
    for (const line of buf.split('\n').filter(Boolean)) { const m = JSON.parse(line); if (pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } }
  });
  const call = (name, args) => new Promise(res => { id += 1; pending.set(id, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n'); });
  const text = r => r.content[0].text;

  const adr = await call('rc_propose_adr', { title: 'Bill in cents', decision: 'Store money as integer cents', why: 'No float rounding' });
  assert.match(text(adr), /^Added D-001 to \.ai\/DECISIONS\.md/);
  assert.match(fs.readFileSync(path.join(d, '.ai/DECISIONS.md'), 'utf8'), /## D-001 Bill in cents/);
  const fakeKey = ['sk', '_live_', 'a1B2c3D4e5F6g7H8i9J0k1L2'].join('');
  const leak = await call('rc_propose_adr', { title: 'Stripe', decision: `key ${fakeKey}`, why: 'x' });
  assert.equal(leak.isError, true); assert.doesNotMatch(text(leak), new RegExp(fakeKey));

  const stateBefore = fs.readFileSync(path.join(d, '.ai/STATE.md'), 'utf8').match(/^verified_at:.*$/m)[0];
  assert.match(text(await call('rc_checkpoint_state', { focus: 'Refunds', change: 'billing in cents' })), /no doc was marked verified/);
  assert.equal(fs.readFileSync(path.join(d, '.ai/STATE.md'), 'utf8').match(/^verified_at:.*$/m)[0], stateBefore);

  fs.appendFileSync(path.join(d, 'app/Services/Billing/S.php'), 'refund()');
  const dirty = await call('rc_stamp', { docs: ['billing'] });
  assert.equal(dirty.isError, true); assert.match(text(dirty), /uncommitted changes/); assert.doesNotMatch(text(dirty), /--force/);
  g(d, 'commit', '-qam', 'refunds');
  assert.match(text(await call('rc_verify', { docs: ['billing'] })), /billing\.md is stale[\s\S]*FAIL: 0 error\(s\), 1 stale/);
  assert.match(text(await call('rc_stamp', { docs: ['billing'] })), /✓ \.ai\/modules\/billing\.md verified at \w+ \(verified_by: agent\)/);
  assert.match(text(await call('rc_verify', { docs: ['billing'] })), /PASS$/);
  assert.equal((await call('rc_stamp', { docs: ['nope'] })).isError, true);
  p.kill();

  assert.match(cf(d, 'status').stdout, /billing\.md\s+fresh \(agent\)/);
  assert.match(cf(d, 'doctor').stdout, /1 doc\(s\) verified by an agent/);
});

test('skills: init writes the verify skill per tool; conflicts, drift and deselection are handled', () => {
  const d = repo({ 'package.json': JSON.stringify({ scripts: { lint: 'eslint .', test: 'node --test' } }) });
  const first = cf(d, 'init', '--targets=claude,cursor', '--yes');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Skills\s+3 file\(s\) updated/);
  for (const f of ['.ai/skills/rc-verify-change/SKILL.md', '.claude/skills/rc-verify-change/SKILL.md', '.agents/skills/rc-verify-change/SKILL.md']) {
    assert.ok(fs.existsSync(path.join(d, f)), f);
  }
  assert.match(fs.readFileSync(path.join(d, '.claude/skills/rc-verify-change/SKILL.md'), 'utf8'), /Generated by RepoCanon from \.ai\/skills\/rc-verify-change\/SKILL\.md[\s\S]*`npm run lint`[\s\S]*`npm test`/);
  assert.doesNotMatch(cf(d, 'init', '--targets=claude,cursor', '--yes').stdout, /Skills:/);
  assert.match(cf(d, 'skills').stdout, /Up to date · 3 skill file\(s\)/);

  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint .', test: 'node --test', typecheck: 'tsc' } }));
  const check = cf(d, 'skills', '--check');
  assert.equal(check.status, 1); assert.match(check.stdout, /~\s+\.ai\/skills\/rc-verify-change\/SKILL\.md\s+updated · pending/);
  assert.match(cf(d, 'doctor').stdout, /skill files are out of date/);
  cf(d, 'skills'); assert.equal(cf(d, 'skills', '--check').status, 0);

  fs.writeFileSync(path.join(d, '.claude/skills/rc-verify-change/SKILL.md'), '---\nname: rc-verify-change\ndescription: mine\n---\n');
  assert.match(cf(d, 'skills').stdout, /!\s+\.claude\/skills\/rc-verify-change\/SKILL\.md\s+a skill of the same name already exists/);
  assert.equal(fs.readFileSync(path.join(d, '.claude/skills/rc-verify-change/SKILL.md'), 'utf8'), '---\nname: rc-verify-change\ndescription: mine\n---\n');

  cf(d, 'init', '--targets=claude', '--yes', '--prune');
  assert.equal(fs.existsSync(path.join(d, '.agents/skills/rc-verify-change')), false);
});

test('monorepo: init + analyze map a pnpm/turbo workspace into package and app-feature modules', () => {
  const d = repo({
    'pnpm-workspace.yaml': 'packages:\n  - apps/*\n  - packages/*\n', 'turbo.json': '{}', 'package.json': '{"name":"acme"}',
    'apps/web/package.json': '{"name":"@acme/web","dependencies":{"next":"15"}}', 'apps/web/app/layout.tsx': 'x',
    'apps/web/app/(app)/billing/page.tsx': 'x', 'apps/web/app/(marketing)/pricing/page.tsx': 'x', 'apps/web/app/api/billing/route.ts': 'x',
    'packages/ui/package.json': '{"name":"@acme/ui"}', 'packages/ui/src/button.tsx': 'x'
  });
  assert.equal(cf(d, 'init', '--targets=claude', '--yes').status, 0);
  cf(d, 'analyze', '--scaffold');
  const index = fs.readFileSync(path.join(d, '.ai/INDEX.md'), 'utf8');
  assert.match(index, /## Workspace \(auto\): pnpm \+ turbo[\s\S]*\| web \| apps\/web\/ \| app \| Next\.js[\s\S]*\| ui \| packages\/ui\/ \| package \|/);
  assert.match(index, /\| web-billing \| apps\/web\/app\/\(app\)\/billing\/, apps\/web\/app\/api\/billing\/ \|/);
  assert.match(fs.readFileSync(path.join(d, '.ai/modules/web-billing.md'), 'utf8'), /code_paths: \[apps\/web\/app\/\(app\)\/billing\/, apps\/web\/app\/api\/billing\/\]/);
  assert.deepEqual(fs.readdirSync(path.join(d, '.ai/modules')).filter(f => !f.startsWith('_')).sort(), ['ui.md', 'web-billing.md', 'web-pricing.md']);
});

test('entry digest: AGENTS.md carries the rules and decisions, follows them, and can be turned off', () => {
  const d = repo({ 'package.json': JSON.stringify({ scripts: { test: 'node --test' } }) });
  cf(d, 'init', '--targets=claude', '--yes');
  const agents = () => fs.readFileSync(path.join(d, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(agents(), /Project rules|TODO`/);                        // template stubs: no digest, no TODO commands
  assert.match(agents(), /^Test: `npm test`$/m);

  fs.writeFileSync(path.join(d, '.ai/CONVENTIONS.md'), '---\nverified_at:\n---\n# Conventions\n- Money is integer cents.\n- TODO\n');
  const check = cf(d, 'rules', '--check');
  assert.equal(check.status, 1); assert.match(check.stdout, /~\s+AGENTS\.md\s+updated · pending/);
  cf(d, 'rules');
  assert.match(agents(), /## Project rules[^\n]*\n- Money is integer cents\.\n/);

  const { executeTool } = require('../src/mcp/tools');
  executeTool(d, 'rc_propose_adr', { title: 'One error for bad codes', decision: 'Unknown codes fail with E_CODE_INVALID', why: 'No probing' });
  assert.match(agents(), /- D-001 One error for bad codes: Unknown codes fail with E_CODE_INVALID/);   // ADR lands in the digest at once
  assert.equal(cf(d, 'rules', '--check').status, 0);

  fs.writeFileSync(path.join(d, '.repocanon.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(d, '.repocanon.json'), 'utf8')), entryDigest: false }));
  cf(d, 'rules');
  assert.doesNotMatch(agents(), /Project rules/);

  const { buildRulesDigest } = require('../src/services/digest.service');
  fs.writeFileSync(path.join(d, '.ai/CONVENTIONS.md'), Array.from({ length: 200 }, (_, i) => `- Rule number ${i} says something specific about the code.`).join('\n'));
  const big = buildRulesDigest(d, { maxTokens: 300 });
  assert.match(big, /… more in/);
  assert.ok(require('../src/core/tokens').estimateTokens(big) <= 300);
});
