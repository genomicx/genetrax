#!/usr/bin/env node
// Run the exact browser BLAST binary in Node for independent native/WASM QA.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const [engine, prefix, query, output, format = '7'] = process.argv.slice(2)
if (!output) throw new Error('Usage: run-blast-wasm.mjs ENGINE_DIR DB_PREFIX QUERY OUTPUT [7|8]')
const require = createRequire(import.meta.url)
const text = fs.readFileSync(path.join(engine, 'blastall.js'), 'utf8')
const factory = new Function('require', '__dirname', 'module', 'exports', text + ';return Module;')(require, engine, { exports: {} }, {})
const stdout = [], stderr = []
const module = await factory({ wasmBinary: fs.readFileSync(path.join(engine, 'blastall.wasm')),
  print: line => stdout.push(line), printErr: line => stderr.push(line), noInitialRun: true })
module.FS.mkdir('/db')
const base = path.basename(prefix)
for (const suffix of ['nhr', 'nin', 'nsq', 'nsi', 'nsd']) {
  if (fs.existsSync(prefix + '.' + suffix)) module.FS.writeFile('/db/' + base + '.' + suffix, fs.readFileSync(prefix + '.' + suffix))
}
module.FS.writeFile('/query.fa', fs.readFileSync(query))
const args = ['-p', 'blastn', '-d', '/db/' + base, '-i', '/query.fa', '-e', '1e-20', '-m', format,
  '-F', 'F', '-W', '32', '-X', '150', '-o', '/result']
const status = module.callMain(args)
if (status !== 0 && status !== undefined) throw new Error(`BLAST exit ${status}: ${stderr.join('\n')}`)
fs.writeFileSync(output, module.FS.readFile('/result'))
fs.writeFileSync(output + '.execution.json', JSON.stringify({ args, status, stdout, stderr }, null, 2))
