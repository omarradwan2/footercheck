#!/usr/bin/env node
// Batch scan: node cli.js urls.txt > results.csv   (one URL per line)
const fs = require('fs');
const { scan } = require('./scanner');

const file = process.argv[2];
if (!file) { console.error('Usage: node cli.js urls.txt > results.csv'); process.exit(1); }
const urls = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const CHECKS = ['https', 'privacy', 'terms', 'cookies', 'contact', 'optout', 'kids'];

(async () => {
  console.log(['url', 'title', 'grade', 'score', 'issues', 'platform', 'email', 'trackers', ...CHECKS, 'missing'].map(q).join(','));
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      try {
        const r = await scan(u);
        if (!r.reachable) { console.log([u, '', 'ERR', '', '', '', '', '', ...CHECKS.map(() => ''), r.error].map(q).join(',')); continue; }
        const by = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
        const missing = r.checks.filter((c) => c.status !== 'pass').map((c) => c.label).join('; ');
        console.log([r.url, r.title, r.grade, r.score, r.failed, r.platform, r.email, r.trackers.join(' '), ...CHECKS.map((c) => by[c] || ''), missing].map(q).join(','));
      } catch (e) {
        console.log([u, '', 'ERR', '', '', '', '', '', ...CHECKS.map(() => ''), e.message].map(q).join(','));
      }
      process.stderr.write('.');
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  process.stderr.write('\ndone\n');
})();
