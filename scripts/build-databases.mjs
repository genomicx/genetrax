#!/usr/bin/env node
// Retain the familiar entry point while replacing the old incomplete-archive
// builder. Snapshots are pinned, hash checked and written locally for review.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const builder = fileURLToPath(new URL('./build-database-snapshots.py', import.meta.url))
const result = spawnSync('python3', [builder, ...process.argv.slice(2)], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
