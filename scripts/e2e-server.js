import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('.e2e-data');
fs.rmSync(dir, { recursive: true, force: true });
process.env.DATA_DIR = dir;
process.env.PORT = '3400';
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
await import('../server/index.js');
