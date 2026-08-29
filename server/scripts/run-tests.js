#!/usr/bin/env node
/**
 * Runs every server/tests/*.test.js file in its own process and exits non-zero
 * if any file fails.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testDir = path.join(__dirname, '..', 'tests');
const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

const failed = [];

files.forEach((file) => {
  console.log(`\n=== ${file} ===`);
  const result = spawnSync(process.execPath, [path.join(testDir, file)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) failed.push(file);
});

console.log(`\n${files.length - failed.length}/${files.length} test files passed.`);

if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
