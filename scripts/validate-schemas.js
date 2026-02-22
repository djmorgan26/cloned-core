#!/usr/bin/env node
/**
 * Validate all JSON schemas in schemas/ are valid JSON.
 * In CI, this script exits non-zero on any parse error.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(__dirname, '..', 'schemas');

let errors = 0;

const files = readdirSync(schemasDir).filter((f) => f.endsWith('.json'));

if (files.length === 0) {
  console.error('No JSON schema files found in schemas/');
  process.exit(1);
}

for (const file of files) {
  const filePath = join(schemasDir, file);
  try {
    const raw = readFileSync(filePath, 'utf8');
    JSON.parse(raw);
    console.log(`  OK  ${file}`);
  } catch (err) {
    console.error(`  ERR ${file}: ${err.message}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n${errors} schema(s) failed validation`);
  process.exit(1);
} else {
  console.log(`\nAll ${files.length} schemas valid`);
}
