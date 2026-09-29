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
  cf(d, 'init'); assert.equal(fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8'), a);
  assert.equal((a.match(/repocanon:start/g) || []).length, 1);
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
  const d = laravel(); cf(d, 'init'); cf(d, 'analyze', '--scaffold'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'docs'); cf(d, 'stamp'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 's');
  assert.match(cf(d, 'status').stdout, /billing\.md\s+fresh/);
  fs.appendFileSync(path.join(d, 'app/Services/Billing/S.php'), 'y'); g(d, 'commit', '-qam', 'c');
  assert.match(cf(d, 'status').stdout, /billing\.md\s+stale/);
  assert.match(cf(d, 'sync').stdout, /billing\*\* — 1 file/);
  assert.equal(cf(d, 'status', '--ci').status, 1);
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
  send(2, 'tools/list', {}); send(3, 'tools/call', { name: 'cf_find_owner', arguments: { path: 'app/Actions/Billing/A.php' } });
  send(4, 'tools/call', { name: 'cf_module', arguments: { name: '../../etc/passwd' } });
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
});
