#!/usr/bin/env node
/**
 * build-databases.mjs
 *
 * Downloads each abricate-compatible database, formats FASTA headers,
 * builds BLAST databases using formatdb.wasm (from static.genomicx.org),
 * generates meta.json, tars the database files, and uploads everything
 * to static.genomicx.org/db/genetrax/ via the Cloudflare R2 Worker.
 *
 * Usage:
 *   node scripts/build-databases.mjs [db1 db2 ...]
 *   node scripts/build-databases.mjs          # builds all databases
 *   node scripts/build-databases.mjs vfdb ncbi
 *
 * Requires:
 *   CLOUDFLARE_API_TOKEN or CF_PAGES_TOKEN env var with R2 write access
 *   (or set UPLOAD_TOKEN)
 */

import { createWriteStream, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TMP = join(ROOT, '.db-build')
const DIST = join(ROOT, '.db-dist')

const WASM_BASE = 'https://static.genomicx.org/wasm'
const UPLOAD_BASE = 'https://static.genomicx.org'
const ACCOUNT_ID = '3bd272de7abb5a9f328fbfa9afafd2a3'

const CF_TOKEN = process.env.UPLOAD_TOKEN || process.env.CLOUDFLARE_API_TOKEN
if (!CF_TOKEN) {
  console.error('Set UPLOAD_TOKEN or CLOUDFLARE_API_TOKEN')
  process.exit(1)
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function fetchBuf(url) {
  console.log(`  fetch ${url}`)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`)
  return Buffer.from(await r.arrayBuffer())
}

async function fetchText(url) {
  const buf = await fetchBuf(url)
  return buf.toString('utf8')
}

async function fetchGz(url) {
  const buf = await fetchBuf(url)
  // Decompress gzip
  const { gunzipSync } = await import('zlib')
  return gunzipSync(buf).toString('utf8')
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true })
}

/** Parse multi-FASTA text into [{id, desc, seq}] */
function parseFasta(text) {
  const seqs = []
  let cur = null
  for (const line of text.split('\n')) {
    if (line.startsWith('>')) {
      if (cur) seqs.push(cur)
      const [id, ...rest] = line.slice(1).split(' ')
      cur = { id, desc: rest.join(' '), seq: '' }
    } else if (cur) {
      cur.seq += line.trim()
    }
  }
  if (cur) seqs.push(cur)
  return seqs
}

/** Write formatted FASTA and return path */
function writeFasta(seqs, outPath) {
  const lines = seqs.map(s => `>${s.id} ${s.desc}\n${s.seq}`).join('\n')
  writeFileSync(outPath, lines + '\n')
}

/** Build meta.json from formatted sequences */
function buildMeta(seqs, dbId) {
  const meta = {}
  for (const s of seqs) {
    // Header format: dbid~~~gene~~~accession~~~resistance product_desc
    const [, gene, accession, resistance] = s.id.split('~~~')
    meta[s.id] = {
      gene: gene || s.id,
      product: s.desc.trim(),
      resistance: resistance ? resistance.replace(/;/g, ', ') : '',
      accession: accession || '',
      length: s.seq.length,
      database: dbId,
    }
  }
  return meta
}

// ── formatdb.wasm runner ──────────────────────────────────────────────────────

let _formatdbFactory = null
let _formatdbWasm = null

async function loadFormatdb() {
  if (_formatdbFactory) return
  console.log('  Loading formatdb.wasm...')
  const [jsText, wasmBuf] = await Promise.all([
    fetchText(`${WASM_BASE}/formatdb.js`),
    fetchBuf(`${WASM_BASE}/formatdb.wasm`),
  ])
  // Use Function constructor same as browser Emscripten pattern
  const fn = new Function('Module', jsText + '; return Module;')
  _formatdbFactory = fn({})
  _formatdbWasm = wasmBuf
  console.log('  formatdb.wasm ready.')
}

/**
 * Run formatdb on a FASTA file and return {nhr, nin, nsq} as Buffers.
 */
async function runFormatdb(fastaText, dbName) {
  await loadFormatdb()
  const stdout = []
  const stderr = []
  const mod = await _formatdbFactory({
    wasmBinary: _formatdbWasm.buffer.slice(
      _formatdbWasm.byteOffset,
      _formatdbWasm.byteOffset + _formatdbWasm.byteLength,
    ),
    print: (t) => stdout.push(t),
    printErr: (t) => stderr.push(t),
    noInitialRun: true,
  })

  mod.FS.writeFile('/input.fa', fastaText)
  const args = ['-i', '/input.fa', '-n', `/db/${dbName}`, '-p', 'F', '-o', 'T']
  console.log(`  $ formatdb ${args.join(' ')}`)
  try { mod.callMain(args) } catch {}

  const errs = stderr.join('')
  if (errs.includes('ERROR') || errs.includes('FATAL')) {
    throw new Error(`formatdb failed: ${errs}`)
  }

  return {
    nhr: Buffer.from(mod.FS.readFile(`/db/${dbName}.nhr`)),
    nin: Buffer.from(mod.FS.readFile(`/db/${dbName}.nin`)),
    nsq: Buffer.from(mod.FS.readFile(`/db/${dbName}.nsq`)),
  }
}

// ── tar.gz builder ────────────────────────────────────────────────────────────

/** Build a simple tar.gz from a {filename: Buffer} map */
async function buildTarGz(files) {
  // Build tar manually (POSIX ustar)
  const blocks = []

  function addFile(name, data) {
    const nameBytes = Buffer.alloc(100)
    nameBytes.write(name)
    const sizeOctal = data.length.toString(8).padStart(11, '0')
    const header = Buffer.alloc(512)
    nameBytes.copy(header, 0)
    header.write('0000755\0', 100)  // mode
    header.write('0000000\0', 108)  // uid
    header.write('0000000\0', 116)  // gid
    header.write(sizeOctal + '\0', 124)  // size
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136)  // mtime
    header.write('0', 156)         // type: regular file
    header.write('ustar  \0', 257) // magic

    // Compute checksum
    header.write('        ', 148)
    let cksum = 0
    for (let i = 0; i < 512; i++) cksum += header[i]
    header.write(cksum.toString(8).padStart(6, '0') + '\0\0', 148)

    blocks.push(header)
    blocks.push(data)
    // Pad to 512-byte boundary
    const pad = (512 - (data.length % 512)) % 512
    if (pad) blocks.push(Buffer.alloc(pad))
  }

  for (const [name, data] of Object.entries(files)) {
    addFile(name, data)
  }
  blocks.push(Buffer.alloc(1024)) // end-of-archive

  const tar = Buffer.concat(blocks)
  const { gzipSync } = await import('zlib')
  return gzipSync(tar)
}

// ── Upload to R2 via Cloudflare Worker ────────────────────────────────────────

async function uploadToR2(path, data, contentType) {
  const url = `${UPLOAD_BASE}/${path}`
  console.log(`  Uploading → ${url} (${(data.length / 1024).toFixed(0)} KB)`)

  // Use R2 via Cloudflare API directly
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/static-genomicx/objects/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        'Content-Type': contentType,
      },
      body: data,
    },
  )

  if (!r.ok) {
    const text = await r.text()
    throw new Error(`Upload failed (${r.status}): ${text}`)
  }
  console.log(`  ✓ uploaded ${path}`)
}

// ── Database builders ─────────────────────────────────────────────────────────

async function buildVfdb() {
  console.log('\n[VFDB] Downloading...')
  const raw = await fetchGz('http://www.mgc.ac.cn/VFs/Down/VFDB_setA_nt.fas.gz')
  const parsed = parseFasta(raw)
  console.log(`[VFDB] ${parsed.length} raw sequences`)

  const formatted = []
  for (const s of parsed) {
    // Header: >VFG000676(gb|AAD32411) (aac) VFG000...
    const m = s.id.match(/^(VFG\d+)\((?:gb|emb|dbj|ref)\|(\w+)(?:\.\d+)?\)$/)
    const vfgId = m ? m[1] : s.id
    const accession = m ? m[2] : ''
    // Extract gene name from description in parens: (gene_name)
    const geneM = s.desc.match(/\(([^)]+)\)/)
    const gene = geneM ? geneM[1] : vfgId
    const product = s.desc.replace(/\([^)]+\)\s*/, '').trim()
    const id = `vfdb~~~${gene}~~~${accession}~~~`
    formatted.push({ id, desc: product, seq: s.seq })
  }

  return { id: 'vfdb', seqs: formatted }
}

async function buildNcbi() {
  console.log('\n[NCBI AMR] Downloading...')
  const [fastaText, catalogText] = await Promise.all([
    fetchText('https://ftp.ncbi.nlm.nih.gov/pathogen/Antimicrobial_resistance/AMRFinderPlus/database/latest/AMR_CDS.fa'),
    fetchText('https://ftp.ncbi.nlm.nih.gov/pathogen/Antimicrobial_resistance/AMRFinderPlus/database/latest/ReferenceGeneCatalog.txt'),
  ])

  // Parse catalog: columns include gene_symbol, subclass, element_type etc.
  const catalogLines = catalogText.split('\n').filter(l => l && !l.startsWith('#'))
  const header = catalogLines[0].split('\t')
  const geneSymIdx = header.indexOf('gene_symbol')
  const subclassIdx = header.indexOf('subclass')
  const scopeIdx = header.indexOf('scope')
  const typeIdx = header.indexOf('element_type')
  const subtypeIdx = header.indexOf('element_subtype')
  const nucAccIdx = header.indexOf('refseq_nucleotide_accession')

  const catalog = new Map()
  for (const line of catalogLines.slice(1)) {
    const cols = line.split('\t')
    if (!cols[nucAccIdx]) continue
    if (scopeIdx >= 0 && cols[scopeIdx] !== 'core') continue
    if (typeIdx >= 0 && cols[typeIdx] !== 'AMR') continue
    catalog.set(cols[nucAccIdx], {
      gene: cols[geneSymIdx] || '',
      resistance: cols[subclassIdx] || '',
    })
  }

  const parsed = parseFasta(fastaText)
  console.log(`[NCBI] ${parsed.length} sequences, ${catalog.size} catalog entries`)

  const formatted = []
  for (const s of parsed) {
    // Header: >NG_ACCESSION|WP_PROTEIN|FP|FN|GENE|FAMILY|PRODUCT
    const parts = s.id.split('|')
    const nucAcc = parts[0] || s.id
    const cat = catalog.get(nucAcc)
    if (!cat) continue
    const gene = cat.gene || parts[4] || s.id
    const resistance = cat.resistance.replace(/,/g, ';')
    const id = `ncbi~~~${gene}~~~${nucAcc}~~~${resistance}`
    const product = parts.slice(6).join(' ').trim() || s.desc
    formatted.push({ id, desc: product, seq: s.seq })
  }

  return { id: 'ncbi', seqs: formatted }
}

async function buildCard() {
  console.log('\n[CARD] Downloading...')
  const buf = await fetchBuf('https://card.mcmaster.ca/latest/data')
  const { gunzipSync } = await import('zlib')

  // CARD gives a tar.bz2 — we need card.json inside
  // Use bzip2 decompress via execSync since Node has no built-in bzip2
  const tmpTar = join(TMP, 'card.tar.bz2')
  ensureDir(TMP)
  writeFileSync(tmpTar, buf)

  let cardJson
  try {
    const out = execSync(`cd ${TMP} && tar xjf card.tar.bz2 card.json 2>/dev/null && cat card.json`)
    cardJson = JSON.parse(out.toString())
  } catch {
    throw new Error('Failed to extract card.json from CARD tarball. Is bzip2 installed?')
  }

  const formatted = []
  for (const [, model] of Object.entries(cardJson)) {
    if (typeof model !== 'object' || !model.model_type) continue
    if (model.model_type !== 'protein homolog model') continue
    if (model.model_param?.snp) continue

    const seqs = model.model_sequences?.sequence
    if (!seqs) continue

    const drug_classes = Object.values(model.ARO_category || {})
      .filter(c => c.category_aro_class_name === 'Drug Class')
      .map(c => c.category_aro_name.replace(/ antibiotic$/, '').replace(/ /g, '_'))
      .join(';')

    for (const seq of Object.values(seqs)) {
      const dna = seq.dna_sequence
      if (!dna?.sequence) continue
      const acc = `${dna.accession}:${dna.fmin}-${dna.fmax}`
      const gene = model.model_name || model.ARO_name
      const product = model.ARO_description || model.model_description || ''
      const id = `card~~~${gene}~~~${acc}~~~${drug_classes}`
      formatted.push({ id, desc: product, seq: dna.sequence })
    }
  }

  console.log(`[CARD] ${formatted.length} sequences`)
  return { id: 'card', seqs: formatted }
}

async function buildResfinder() {
  console.log('\n[ResFinder] Downloading...')
  // Clone the git repo
  const repoDir = join(TMP, 'resfinder_db')
  if (!existsSync(repoDir)) {
    execSync(`git clone --depth 1 https://bitbucket.org/genomicepidemiology/resfinder_db.git ${repoDir}`, { stdio: 'pipe' })
  }

  // Load phenotypes
  const phenoPath = join(repoDir, 'phenotypes.txt')
  const phenoText = readFileSync(phenoPath, 'utf8')
  const phenoMap = new Map()
  for (const line of phenoText.split('\n').slice(1)) {
    const cols = line.split('\t')
    if (cols.length < 3) continue
    const acc = cols[0].trim()
    const cls = cols[1].trim()
    phenoMap.set(acc, cls)
  }

  const formatted = []
  const fsaFiles = execSync(`ls ${repoDir}/*.fsa`).toString().trim().split('\n')
  for (const fsaPath of fsaFiles) {
    const text = readFileSync(fsaPath, 'utf8')
    for (const s of parseFasta(text)) {
      // ID format: aac(6')-Ib_1_M23634
      const m = s.id.match(/^(.*?)_(\d+)_(\S+)$/)
      if (!m) continue
      const gene = m[1]
      const accession = m[3]
      const fullKey = s.id
      const resistance = phenoMap.get(fullKey) || phenoMap.get(gene) || ''
      const id = `resfinder~~~${gene}~~~${accession}~~~${resistance}`
      formatted.push({ id, desc: s.desc || gene, seq: s.seq })
    }
  }

  console.log(`[ResFinder] ${formatted.length} sequences`)
  return { id: 'resfinder', seqs: formatted }
}

async function buildPlasmidfinder() {
  console.log('\n[PlasmidFinder] Downloading...')
  const buf = await fetchBuf('https://bitbucket.org/genomicepidemiology/plasmidfinder_db/get/HEAD.zip')
  const tmpZip = join(TMP, 'plasmidfinder.zip')
  const tmpDir = join(TMP, 'plasmidfinder')
  ensureDir(tmpDir)
  writeFileSync(tmpZip, buf)
  execSync(`unzip -o -j ${tmpZip} '*.fsa' -d ${tmpDir}`, { stdio: 'pipe' })

  const formatted = []
  const fsaFiles = execSync(`ls ${tmpDir}/*.fsa 2>/dev/null || true`).toString().trim().split('\n').filter(Boolean)
  for (const fsaPath of fsaFiles) {
    const text = readFileSync(fsaPath, 'utf8')
    for (const s of parseFasta(text)) {
      const m = s.id.match(/^(.+)_((NC_\d+|[A-Z]+\d+)(\.\d+)?)$/)
      const plasmid = m ? m[1].replace(/_+$/, '') : s.id
      const accession = m ? m[2] : ''
      const id = `plasmidfinder~~~${plasmid}~~~${accession}~~~`
      formatted.push({ id, desc: s.desc || plasmid, seq: s.seq })
    }
  }

  console.log(`[PlasmidFinder] ${formatted.length} sequences`)
  return { id: 'plasmidfinder', seqs: formatted }
}

async function buildMegares() {
  console.log('\n[MEGARes] Downloading...')
  const buf = await fetchBuf('https://www.meglab.org/downloads/megares_v3.00.zip')
  const tmpZip = join(TMP, 'megares.zip')
  const tmpDir = join(TMP, 'megares')
  ensureDir(tmpDir)
  writeFileSync(tmpZip, buf)
  execSync(`unzip -o -j ${tmpZip} '*.fasta' -d ${tmpDir}`, { stdio: 'pipe' })

  const fastaFiles = execSync(`ls ${tmpDir}/*.fasta 2>/dev/null || true`).toString().trim().split('\n').filter(Boolean)
  const formatted = []
  for (const fastaPath of fastaFiles) {
    const text = readFileSync(fastaPath, 'utf8')
    for (const s of parseFasta(text)) {
      // MEGARes header: MEG_ID|TYPE|CLASS|MECHANISM|GROUP|NOTE
      const parts = s.id.split('|')
      if (parts.length < 5) continue
      if (parts[5] && parts[5].includes('RequiresSNPConfirmation')) continue
      const [megId, type, cls, mechanism, group] = parts
      const resistance = [type, cls].filter(Boolean).join(';')
      const product = [mechanism, group].filter(Boolean).join(' ')
      const id = `megares~~~${group || megId}~~~${megId}~~~${resistance}`
      formatted.push({ id, desc: product, seq: s.seq })
    }
  }

  console.log(`[MEGARes] ${formatted.length} sequences`)
  return { id: 'megares', seqs: formatted }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const BUILDERS = { vfdb: buildVfdb, ncbi: buildNcbi, card: buildCard, resfinder: buildResfinder, plasmidfinder: buildPlasmidfinder, megares: buildMegares }

const targets = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : Object.keys(BUILDERS)

ensureDir(TMP)
ensureDir(DIST)

for (const dbId of targets) {
  const builder = BUILDERS[dbId]
  if (!builder) { console.warn(`Unknown database: ${dbId}`); continue }

  try {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Building: ${dbId}`)
    console.log('='.repeat(60))

    const { seqs } = await builder()
    if (seqs.length === 0) throw new Error('No sequences built')

    // Deduplicate by id
    const unique = []
    const seen = new Set()
    for (const s of seqs) {
      if (!seen.has(s.id)) { seen.add(s.id); unique.push(s) }
    }
    console.log(`[${dbId}] ${unique.length} unique sequences after dedup`)

    // Build FASTA string
    const fastaText = unique.map(s => `>${s.id} ${s.desc}\n${s.seq}`).join('\n') + '\n'

    // Run formatdb.wasm
    console.log(`[${dbId}] Running formatdb.wasm...`)
    const dbFiles = await runFormatdb(fastaText, dbId)
    console.log(`[${dbId}] Database built: nhr=${dbFiles.nhr.length} nin=${dbFiles.nin.length} nsq=${dbFiles.nsq.length} bytes`)

    // Build meta.json
    const meta = buildMeta(unique, dbId)

    // Build tar.gz
    console.log(`[${dbId}] Building tar.gz...`)
    const tarGz = await buildTarGz({
      [`${dbId}.nhr`]: dbFiles.nhr,
      [`${dbId}.nin`]: dbFiles.nin,
      [`${dbId}.nsq`]: dbFiles.nsq,
    })
    console.log(`[${dbId}] tar.gz size: ${(tarGz.length / 1024 / 1024).toFixed(1)} MB`)

    // Write to disk for inspection
    writeFileSync(join(DIST, `${dbId}.tar.gz`), tarGz)
    writeFileSync(join(DIST, `${dbId}.meta.json`), JSON.stringify(meta, null, 2))

    // Upload to R2
    console.log(`[${dbId}] Uploading to static.genomicx.org...`)
    await uploadToR2(`db/genetrax/${dbId}.tar.gz`, tarGz, 'application/gzip')
    await uploadToR2(`db/genetrax/${dbId}.meta.json`, Buffer.from(JSON.stringify(meta)), 'application/json')

    console.log(`[${dbId}] ✓ DONE`)
  } catch (err) {
    console.error(`[${dbId}] FAILED: ${err.message}`)
    process.exit(1)
  }
}

console.log('\n✓ All databases built and uploaded.')
