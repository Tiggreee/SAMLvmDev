import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const agentsDir = path.join(root, '.github', 'copilot', 'agents');
const forbiddenCapabilities = ['file_editing', 'code_generation', 'pull_request_creation'];
const requiredRootKeys = ['name', 'description'];

function collectYamlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

const yamlFiles = collectYamlFiles(agentsDir);
if (yamlFiles.length === 0) {
  console.log('COPILOT AGENTS CHECK: no agent YAML files present, nothing to validate.');
  process.exit(0);
}

let hasError = false;
for (const file of yamlFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file).replaceAll('\\\\', '/');

  for (const key of requiredRootKeys) {
    const keyRegex = new RegExp(`^${key}:`, 'm');
    if (!keyRegex.test(content)) {
      console.error(`CHECK FAIL (${rel}): missing required root key '${key}'.`);
      hasError = true;
    }
  }

  for (const cap of forbiddenCapabilities) {
    const capRegex = new RegExp(`(^|[^a-zA-Z0-9_-])${cap}([^a-zA-Z0-9_-]|$)`, 'm');
    if (capRegex.test(content)) {
      console.error(`CHECK FAIL (${rel}): forbidden capability '${cap}' found.`);
      hasError = true;
    }
  }
}

if (hasError) {
  process.exit(1);
}

console.log('COPILOT AGENTS CHECK PASS: watch-only constraints validated.');
