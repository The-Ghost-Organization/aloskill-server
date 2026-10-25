// Run from the backend directory: node scripts/enable-video-worker.cjs
// Preserve every unrelated package field, dependency and script.
const fs = require('node:fs');
const path = require('node:path');
const packagePath = path.resolve(__dirname, '../package.json');
if (!fs.existsSync(packagePath)) {
  throw new Error('Backend package.json was not found. Restore your real backend package.json before running this helper.');
}
const previous = fs.readFileSync(packagePath, 'utf8');
const packageData = JSON.parse(previous.replace(/^\uFEFF/, ''));
const backupPath = packagePath + '.before-video-worker';
if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, previous, { flag: 'wx' });
packageData.scripts = {
  ...packageData.scripts,
  'worker:video': 'tsx src/modules/course/video.worker.ts',
  'worker:video:prod': 'node dist/modules/course/video.worker.js',
  'dev:worker': 'run-p dev worker worker:video',
  start: 'run-p server:prod worker:prod worker:video:prod',
};
fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2) + '\n');
console.log('Video worker scripts installed. Development: npm run dev:worker. Production: npm run build, then npm start.');
