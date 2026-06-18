import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.join(root, 'ops', 'runtime', 'production-go-no-go-report.md');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  const ok = result.status === 0;
  return { ok, code: result.status ?? 1 };
}

const checks = [
  { name: 'test:smoke', run: () => run('npm', ['run', 'test:smoke']) },
  { name: 'build:server', run: () => run('npm', ['run', 'build:server']) },
  { name: 'check:copilot:agents', run: () => run('npm', ['run', 'check:copilot:agents']) }
];

const timestamp = new Date().toISOString();
const results = [];

for (const check of checks) {
  const out = check.run();
  results.push({ name: check.name, ok: out.ok, code: out.code });
}

const allPass = results.every((r) => r.ok);
const decision = allPass ? 'GO' : 'NO-GO';

const lines = [];
lines.push('# Production Go/No-Go Report');
lines.push('');
lines.push(`- Timestamp: ${timestamp}`);
lines.push(`- Decision: ${decision}`);
lines.push('');
lines.push('## Checks');
lines.push('');
for (const r of results) {
  lines.push(`- ${r.name}: ${r.ok ? 'PASS' : `FAIL (exit ${r.code})`}`);
}
lines.push('');
lines.push('## Policy');
lines.push('');
lines.push('- Release recommendation is blocked if any required check fails.');

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`Report written: ${path.relative(root, reportPath).replaceAll('\\\\', '/')}`);

if (!allPass) {
  process.exit(1);
}
