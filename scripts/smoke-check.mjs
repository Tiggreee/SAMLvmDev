import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/main.ts',
  'src/bootstrap.ts',
  'src/interfaces/http/routes/authRoutes.ts',
  'src/interfaces/http/controllers/AuthController.ts'
];

const requiredPrefixes = ["'/saml'", "'/auth/saml'"];
const requiredSegments = ["'/login'", "'/acs'", "'/metadata'", "'/slo'"];

const missing = requiredFiles.filter((p) => !fs.existsSync(path.join(root, p)));
if (missing.length > 0) {
  console.error('SMOKE FAIL: missing required files:');
  for (const f of missing) console.error(`- ${f}`);
  process.exit(1);
}

const routesFile = path.join(root, 'src/interfaces/http/routes/authRoutes.ts');
const routesCode = fs.readFileSync(routesFile, 'utf8');

const missingPrefixes = requiredPrefixes.filter((r) => !routesCode.includes(r));
const missingSegments = requiredSegments.filter((r) => !routesCode.includes(r));
if (missingPrefixes.length > 0 || missingSegments.length > 0) {
  console.error('SMOKE FAIL: missing required SAML route definitions:');
  for (const r of [...missingPrefixes, ...missingSegments]) console.error(`- ${r}`);
  process.exit(1);
}

console.log('SMOKE PASS: required files and SAML routes are present.');
