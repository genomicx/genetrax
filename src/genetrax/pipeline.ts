/**
 * Genetrax pipeline — abricate-compatible AMR/virulence screening
 *
 * Uses blastall (legacy BLAST) via WebAssembly. Database files are
 * pre-built with formatdb and hosted on static.genomicx.org.
 *
 * Output format mirrors abricate:
 *   #FILE  SEQUENCE  START  END  STRAND  GENE  COVERAGE  COVERAGE_MAP
 *   GAPS  %COVERAGE  %IDENTITY  DATABASE  ACCESSION  PRODUCT  RESISTANCE
 */

import type { GenetraxHit, GenetraxOptions, GenetraxResult, GeneMeta, DatabaseSource } from './types'
import { fetchDatabase, fetchMeta } from './dbCache'

const WASM_BASE = 'https://static.genomicx.org/wasm'

// Module factory cache
let blastFactory: ((opts: object) => Promise<BlastModule>) | null = null
let blastWasmBinary: ArrayBuffer | null = null

interface BlastModule {
  FS: {
    writeFile: (path: string, data: Uint8Array) => void
    readFile: (path: string) => Uint8Array
    mkdir: (path: string) => void
  }
  callMain: (args: string[]) => void
  _stdout: string[]
  _stderr: string[]
}

async function loadBlastFactory(): Promise<void> {
  if (blastFactory && blastWasmBinary) return

  const [jsRes, wasmRes] = await Promise.all([
    fetch(`${WASM_BASE}/blastall.js`),
    fetch(`${WASM_BASE}/blastall.wasm`),
  ])
  if (!jsRes.ok) throw new Error(`Failed to fetch blastall.js: ${jsRes.status}`)
  if (!wasmRes.ok) throw new Error(`Failed to fetch blastall.wasm: ${wasmRes.status}`)

  const [moduleText, wasmBinary] = await Promise.all([
    jsRes.text(),
    wasmRes.arrayBuffer(),
  ])

  const wrapper = new Function('Module', moduleText + '; return Module;')
  blastFactory = wrapper({})
  blastWasmBinary = wasmBinary
}

async function createBlastInstance(): Promise<BlastModule> {
  const stdout: string[] = []
  const stderr: string[] = []
  const mod = await blastFactory!({
    wasmBinary: blastWasmBinary!.slice(0),
    print: (text: string) => { stdout.push(text) },
    printErr: (text: string) => { stderr.push(text) },
    noInitialRun: true,
  }) as BlastModule
  mod._stdout = stdout
  mod._stderr = stderr
  return mod
}

type ProgressCallback = (msg: string, pct: number) => void
type LogCallback = (msg: string) => void

/**
 * Unpack a tar.gz archive into a flat map of filename → Uint8Array.
 * Supports only POSIX ustar format (files, no symlinks, max 100-char names).
 */
async function unpackTarGz(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(new Uint8Array(buffer))
  writer.close()
  const chunks: Uint8Array[] = []
  const reader = ds.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const totalLen = chunks.reduce((s, c) => s + c.byteLength, 0)
  const tar = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) { tar.set(c, offset); offset += c.byteLength }

  const files = new Map<string, Uint8Array>()
  let pos = 0
  while (pos + 512 <= tar.byteLength) {
    const header = tar.slice(pos, pos + 512)
    const name = new TextDecoder().decode(header.slice(0, 100)).replace(/\0/g, '').trim()
    if (!name) break
    const sizeStr = new TextDecoder().decode(header.slice(124, 136)).replace(/\0/g, '').trim()
    const size = parseInt(sizeStr, 8)
    const typeFlag = String.fromCharCode(header[156])
    pos += 512
    if (typeFlag === '0' || typeFlag === '' || typeFlag === '\0') {
      const basename = name.split('/').pop() ?? name
      files.set(basename, tar.slice(pos, pos + size))
    }
    pos += Math.ceil(size / 512) * 512
  }
  return files
}

/**
 * Build a coverage map string like abricate: 15 chars, '=' for covered, '.' for gap.
 */
function makeCoverageMap(sstart: number, send: number, slen: number): string {
  const WIDTH = 15
  const map = Array(WIDTH).fill('.')
  const lo = Math.min(sstart, send) - 1
  const hi = Math.max(sstart, send)
  for (let i = 0; i < WIDTH; i++) {
    const pos = Math.floor((i / WIDTH) * slen)
    if (pos >= lo && pos < hi) map[i] = '='
  }
  return map.join('')
}

/**
 * Run the full Genetrax pipeline.
 */
export async function runGenetrax(
  queryFiles: File[],
  dbSource: DatabaseSource,
  options: GenetraxOptions,
  onProgress: ProgressCallback,
  onLog: LogCallback,
): Promise<GenetraxResult> {
  if (queryFiles.length === 0) throw new Error('At least one query file is required')

  // ── Step 1: Load BLAST WASM ────────────────────────────────────────────
  onProgress('Loading BLAST (WebAssembly)...', 2)
  onLog('[Genetrax] Fetching blastall WASM from static.genomicx.org...')
  await loadBlastFactory()
  onLog('[Genetrax] blastall ready.')

  // ── Step 2: Fetch database ─────────────────────────────────────────────
  let dbFiles: Map<string, Uint8Array>
  let metaMap: Map<string, GeneMeta>
  let dbName: string
  let dbId: string

  if (dbSource.type === 'preset') {
    const cfg = dbSource.config
    dbName = `${cfg.name} ${cfg.version}`
    dbId = cfg.id

    onProgress(`Fetching database: ${cfg.name}...`, 5)
    onLog(`[Genetrax] Fetching ${cfg.name} (${cfg.version})...`)
    const tarBuf = await fetchDatabase(cfg.dbUrl, (fraction) => {
      onProgress(`Downloading database... ${Math.round(fraction * 100)}%`, 5 + fraction * 25)
    })
    onLog(`[Genetrax] Unpacking database...`)
    dbFiles = await unpackTarGz(tarBuf)
    onLog(`[Genetrax] Database unpacked (${dbFiles.size} files).`)

    onProgress('Fetching gene metadata...', 32)
    onLog('[Genetrax] Fetching gene metadata...')
    metaMap = await fetchMeta(cfg.metaUrl)
    onLog(`[Genetrax] Loaded metadata for ${metaMap.size} genes.`)
  } else {
    dbName = dbSource.file.name.replace(/\.tar\.gz$/, '')
    dbId = dbName
    onProgress('Reading uploaded database...', 10)
    onLog(`[Genetrax] Reading user database: ${dbSource.file.name}`)
    dbFiles = await unpackTarGz(await dbSource.file.arrayBuffer())
    onLog(`[Genetrax] Fetching metadata: ${dbSource.metaFile.name}`)
    const metaText = new TextDecoder().decode(await dbSource.metaFile.arrayBuffer())
    const metaObj = JSON.parse(metaText) as Record<string, GeneMeta>
    metaMap = new Map(Object.entries(metaObj))
  }

  // ── Step 3: Run BLAST for each query file ──────────────────────────────
  const allHits: GenetraxHit[] = []
  const pctPerFile = 55 / queryFiles.length

  for (let fi = 0; fi < queryFiles.length; fi++) {
    const queryFile = queryFiles[fi]
    const baseProgress = 35 + fi * pctPerFile

    onProgress(`BLASTing ${queryFile.name}...`, baseProgress)
    onLog(`[Genetrax] Processing ${queryFile.name}...`)

    const mod = await createBlastInstance()

    // Write database files into WASM FS
    mod.FS.mkdir('/db')
    for (const [fname, data] of dbFiles) {
      mod.FS.writeFile(`/db/${fname}`, data)
    }

    // Write query FASTA
    const queryBuf = await queryFile.arrayBuffer()
    mod.FS.writeFile('/query.fa', new Uint8Array(queryBuf))

    // Run blastall
    const args = [
      '-p', 'blastn',
      '-d', `/db/${dbId}`,
      '-i', '/query.fa',
      '-e', options.evalue.toExponential(),
      '-m', '8',
      '-F', 'F',   // no dust/seg filtering (equivalent to -dust no)
      '-W', '32',  // word size 32
      '-X', '150', // X dropoff
    ]
    onLog(`[Genetrax] $ blastall ${args.join(' ')}`)

    try {
      mod.callMain(args)
    } catch {
      // blastall calls exit() which throws in Emscripten
    }

    const stderrOut = mod._stderr.join('')
    if (stderrOut.includes('ERROR') || stderrOut.includes('FATAL')) {
      throw new Error(`blastall failed: ${stderrOut}`)
    }

    const rawOut = mod._stdout.join('\n')
    onLog(`[Genetrax] ${mod._stdout.length} BLAST hits for ${queryFile.name}.`)

    // ── Parse and filter hits ──────────────────────────────────────────
    const hits = parseBlastM8(rawOut, queryFile.name, dbName, dbId, metaMap, options)
    onLog(`[Genetrax] ${hits.length} hits pass minid=${options.minid}% mincov=${options.mincov}%`)
    allHits.push(...hits)

    onProgress(`Done: ${queryFile.name}`, baseProgress + pctPerFile)
  }

  onProgress('Done!', 100)
  onLog(`[Genetrax] Complete. ${allHits.length} total hits across ${queryFiles.length} file(s).`)

  return {
    hits: allHits,
    queryFiles: queryFiles.map((f) => f.name),
    databaseName: dbName,
    minid: options.minid,
    mincov: options.mincov,
    ranAt: new Date().toISOString(),
  }
}

/**
 * Parse blastall -m 8 tabular output into GenetraxHit[].
 *
 * Columns (standard 12-col tabular):
 *   qseqid sseqid pident length mismatch gapopen qstart qend sstart send evalue bitscore
 */
function parseBlastM8(
  stdout: string,
  fileName: string,
  dbName: string,
  _dbId: string,
  metaMap: Map<string, GeneMeta>,
  options: GenetraxOptions,
): GenetraxHit[] {
  const hits: GenetraxHit[] = []

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const cols = trimmed.split('\t')
    if (cols.length < 12) continue

    const [qseqid, sseqid, pidentStr, lengthStr, , gapopenStr,
           qstartStr, qendStr, sstartStr, sendStr] = cols

    const pident = parseFloat(pidentStr)
    const alnLen = parseInt(lengthStr, 10)
    const gaps = parseInt(gapopenStr, 10)
    const qstart = parseInt(qstartStr, 10)
    const qend = parseInt(qendStr, 10)
    const sstart = parseInt(sstartStr, 10)
    const send = parseInt(sendStr, 10)

    if (isNaN(pident) || isNaN(alnLen)) continue
    if (pident < options.minid) continue

    // Look up gene metadata
    const meta = lookupMeta(sseqid, metaMap)
    if (!meta) continue

    // %COVERAGE = (alignment_length - gaps) / subject_length * 100
    const pctCoverage = (100 * (alnLen - gaps)) / meta.length

    if (pctCoverage < options.mincov) continue

    const strand = sstart <= send ? '+' : '-'
    const coverageMap = makeCoverageMap(sstart, send, meta.length)

    hits.push({
      file: fileName,
      sequence: qseqid,
      start: Math.min(qstart, qend),
      end: Math.max(qstart, qend),
      strand,
      gene: meta.gene,
      coverage: coverageMap,
      gaps,
      pctCoverage: Math.round(pctCoverage * 10) / 10,
      pctIdentity: Math.round(pident * 10) / 10,
      database: dbName,
      accession: meta.accession,
      product: meta.product,
      resistance: meta.resistance,
    })
  }

  return hits
}

function lookupMeta(sseqid: string, metaMap: Map<string, GeneMeta>): GeneMeta | undefined {
  // Try direct lookup first, then strip version suffix (e.g. "~~~gene~~~acc.1" → parts)
  return metaMap.get(sseqid) ?? metaMap.get(sseqid.split('~~~')[1] ?? '') ?? metaMap.get(sseqid.split('|')[1] ?? '')
}
