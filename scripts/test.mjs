import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('tests').filter(file => file.endsWith('.test.js')).sort().map(file => 'tests/' + file);
const result = spawnSync(process.execPath, ['--test', ...(process.argv.includes('--coverage') ? ['--experimental-test-coverage', '--test-coverage-include=dist/**'] : []), ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
