import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testsDir = path.resolve(__dirname, '../src/__tests__');

if (!fs.existsSync(testsDir)) {
  console.log('No tests found in', testsDir);
  process.exit(0);
}

const files = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.ts') || f.endsWith('.test.js'))
  .map((f) => path.join(testsDir, f));

if (files.length === 0) {
  console.log('No test files found in', testsDir);
  process.exit(0);
}

let hasFailed = false;

const stream = run({ files });
stream.on('test:fail', () => {
  hasFailed = true;
});

stream.compose(spec).pipe(process.stdout);

stream.on('end', () => {
  if (hasFailed) {
    process.exit(1);
  }
});
