/** Legacy formatdb -o T requires its sequence-ID indices for BLAST formatting. */
export function databasePrefix(files: Map<string, Uint8Array>): string {
  const indices = [...files.keys()].filter(name => name.endsWith('.nin'))
  if (indices.length !== 1) throw new Error('Expected one nucleotide BLAST database (.nin) in the archive')
  const prefix = indices[0].slice(0, -4)
  for (const suffix of ['nhr', 'nsq']) {
    if (!files.get(`${prefix}.${suffix}`)?.length) throw new Error(`Database archive is missing ${prefix}.${suffix}`)
  }
  const header = files.get(`${prefix}.nhr`)!
  const ordinalIds = new TextDecoder('latin1').decode(header).includes('\x1a\x09BL_ORD_ID')
  if (!ordinalIds && (!files.get(`${prefix}.nsi`)?.length || !files.get(`${prefix}.nsd`)?.length)) {
    throw new Error('Indexed BLAST database is incomplete: include both .nsi and .nsd files produced by formatdb -o T')
  }
  return prefix
}

export async function readQueryFasta(file: File): Promise<ArrayBuffer> {
  let bytes = new Uint8Array(await file.arrayBuffer())
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  if (file.name.endsWith('.gz') && !gzip) throw new Error(`${file.name}: expected gzip-compressed FASTA`)
  if (gzip) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
      bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    } catch { throw new Error(`${file.name}: could not decompress gzip data`) }
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  let seenHeader = false
  let bases = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';')) continue
    if (line.startsWith('>')) {
      if (seenHeader && !bases) throw new Error(`${file.name}: empty FASTA record`)
      if (!line.slice(1).trim()) throw new Error(`${file.name}: missing FASTA sequence identifier`)
      seenHeader = true
      bases = 0
    } else {
      if (!seenHeader || !/^[ACGTRYSWKMBDHVNUacgtryswkmbdhvnu]+$/.test(line.replace(/\s+/g, ''))) {
        throw new Error(`${file.name}: expected nucleotide FASTA sequence data`)
      }
      bases += line.replace(/\s+/g, '').length
    }
  }
  if (!seenHeader || !bases) throw new Error(`${file.name}: no nucleotide FASTA sequence found`)
  return new TextEncoder().encode(text).buffer
}
