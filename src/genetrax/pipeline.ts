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
import { fetchDatabase, fetchMeta, decodeMetadata } from './dbCache'
import { parseBlastXml } from './blastXml'
import { databasePrefix, readQueryFasta } from './validation'

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
  callMain: (args: string[]) => number | undefined
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
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  const tar = new Uint8Array(await new Response(stream).arrayBuffer())

  const files = new Map<string, Uint8Array>()
  let pos = 0
  while (pos + 512 <= tar.byteLength) {
    const header = tar.slice(pos, pos + 512)
    const name = new TextDecoder().decode(header.slice(0, 100)).replace(/\0/g, '').trim()
    if (!name) break
    const sizeStr = new TextDecoder().decode(header.slice(124, 136)).replace(/\0/g, '').trim()
    const size = parseInt(sizeStr, 8)
    if (!Number.isSafeInteger(size) || size < 0 || pos + 512 + size > tar.byteLength) {
      throw new Error('Database tar archive is truncated or invalid')
    }
    const typeFlag = String.fromCharCode(header[156])
    pos += 512
    if (typeFlag === '0' || typeFlag === '' || typeFlag === '\0') {
      const basename = name.split('/').pop() ?? name
      if (files.has(basename)) throw new Error(`Database archive contains duplicate file ${basename}`)
      files.set(basename, tar.slice(pos, pos + size))
    }
    pos += Math.ceil(size / 512) * 512
  }
  return files
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

  const queryData = await Promise.all(queryFiles.map(readQueryFasta))

  // ── Step 1: Load BLAST WASM ────────────────────────────────────────────
  onProgress('Loading BLAST (WebAssembly)...', 2)
  onLog('[Genetrax] Fetching blastall WASM from static.genomicx.org...')
  await loadBlastFactory()
  onLog('[Genetrax] blastall ready.')

  // ── Step 2: Fetch database ─────────────────────────────────────────────
  let dbFiles: Map<string, Uint8Array>
  let metaMap: Map<string, GeneMeta>
  let dbName: string

  if (dbSource.type === 'preset') {
    const cfg = dbSource.config
    dbName = `${cfg.name} ${cfg.version}`

    onProgress(`Fetching database: ${cfg.name}...`, 5)
    onLog(`[Genetrax] Fetching ${cfg.name} (${cfg.version})...`)
    const tarBuf = await fetchDatabase(cfg.dbUrl, (fraction) => {
      onProgress(`Downloading database... ${Math.round(fraction * 100)}%`, 5 + fraction * 25)
    }, cfg.dbSha256)
    onLog(`[Genetrax] Unpacking database...`)
    dbFiles = await unpackTarGz(tarBuf)
    onLog(`[Genetrax] Database unpacked (${dbFiles.size} files).`)

    onProgress('Fetching gene metadata...', 32)
    onLog('[Genetrax] Fetching gene metadata...')
    metaMap = await fetchMeta(cfg.metaUrl, cfg.metaSha256)
    onLog(`[Genetrax] Loaded metadata for ${metaMap.size} genes.`)
  } else {
    dbName = dbSource.file.name.replace(/\.tar\.gz$/, '')
    onProgress('Reading uploaded database...', 10)
    onLog(`[Genetrax] Reading user database: ${dbSource.file.name}`)
    dbFiles = await unpackTarGz(await dbSource.file.arrayBuffer())
    onLog(`[Genetrax] Fetching metadata: ${dbSource.metaFile.name}`)
    metaMap = decodeMetadata(await dbSource.metaFile.arrayBuffer())
  }

  databasePrefix(dbFiles)

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
    const queryBuf = queryData[fi]
    mod.FS.writeFile('/query.fa', new Uint8Array(queryBuf))

    // Run blastall
    const args = [
      '-p', 'blastn',
      '-d', `/db/${databasePrefix(dbFiles)}`, 
      '-i', '/query.fa',
      '-e', options.evalue.toExponential(),
      '-m', '7',
      '-o', '/result.xml',
      '-F', 'F',   // no dust/seg filtering (equivalent to -dust no)
      '-W', '32',  // word size 32
      '-X', '150', // X dropoff
    ]
    onLog(`[Genetrax] $ blastall ${args.join(' ')}`)

    let status: number | undefined
    try {
      status = mod.callMain(args)
    } catch (error) {
      throw new Error(`BLAST execution failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    const stderrOut = mod._stderr.join('\n')
    if ((status !== undefined && status !== 0) || /\b(error|fatal)\b/i.test(stderrOut)) {
      throw new Error(`BLAST failed (exit ${status ?? 'unknown'}): ${stderrOut}`)
    }
    const rawOut = new TextDecoder().decode(mod.FS.readFile('/result.xml'))
    const hits = parseBlastXml(rawOut, queryFile.name, dbName, metaMap, options)
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

