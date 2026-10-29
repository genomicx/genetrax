import type { GeneMeta, GenetraxHit, GenetraxOptions } from './types'

function coverageMap(start: number, end: number, length: number): string {
  const lo = Math.min(start, end) - 1
  const hi = Math.max(start, end)
  return Array.from({ length: 15 }, (_, i) => {
    const position = Math.floor(i * length / 15)
    return position >= lo && position < hi ? '=' : '.'
  }).join('')
}

/** One row per BLAST HSP; no locus merging, ranking or best-hit suppression. */
export function parseBlastXml(
  xml: string, file: string, database: string, metadata: Map<string, GeneMeta>, options: GenetraxOptions,
): GenetraxHit[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror') || !document.querySelector('BlastOutput')) {
    throw new Error('BLAST returned invalid or incomplete XML output')
  }
  const text = (parent: Element, name: string) => parent.querySelector(name)?.textContent?.trim() ?? ''
  const number = (parent: Element, name: string) => {
    const value = Number(text(parent, name))
    if (!text(parent, name) || !Number.isFinite(value)) throw new Error(`BLAST output is missing ${name}`)
    return value
  }
  const iterations = document.querySelectorAll('Iteration')
  if (!iterations.length || ![...iterations].some(iteration => text(iteration, 'Iteration_query-def'))) throw new Error('BLAST output contains no query iterations')
  const hits: GenetraxHit[] = []
  for (const iteration of iterations) {
    const message = text(iteration, 'Iteration_message')
    if (message && !/^No hits found$/i.test(message)) throw new Error(`BLAST: ${message}`)
    const sequence = text(iteration, 'Iteration_query-def').split(/\s+/)[0]
    if (!sequence && iteration.querySelector('Hit')) throw new Error('BLAST hit is missing its query identifier')
    for (const hit of iteration.querySelectorAll('Hit')) {
      const ids = ['Hit_id', 'Hit_def', 'Hit_accession'].flatMap(name => {
        const value = text(hit, name).split(/\s+/)[0]
        return [value, value.replace(/^lcl\|/, '')]
      })
      const meta = ids.map(id => metadata.get(id)).find(Boolean)
      if (!meta) throw new Error(`Missing metadata for BLAST subject ${ids[0]}; use the matching database metadata file`)
      const subjectLength = number(hit, 'Hit_len')
      if (!Number.isInteger(subjectLength) || subjectLength <= 0) throw new Error('Invalid BLAST subject length')
      if (meta.length !== subjectLength) throw new Error(`Metadata length does not match BLAST subject ${ids[0]}`)
      for (const hsp of hit.querySelectorAll('Hsp')) {
        const length = number(hsp, 'Hsp_align-len')
        const identities = number(hsp, 'Hsp_identity')
        // Legacy XML omits this optional element for ungapped HSPs.
        const gaps = text(hsp, 'Hsp_gaps') ? number(hsp, 'Hsp_gaps') : 0
        const qstart = number(hsp, 'Hsp_query-from')
        const qend = number(hsp, 'Hsp_query-to')
        const sstart = number(hsp, 'Hsp_hit-from')
        const send = number(hsp, 'Hsp_hit-to')
        if (![length, identities, gaps, qstart, qend, sstart, send].every(Number.isInteger) ||
            length <= 0 || identities < 0 || gaps < 0 || identities + gaps > length ||
            Math.min(qstart, qend, sstart, send) < 1 || Math.max(sstart, send) > subjectLength) {
          throw new Error('Invalid BLAST alignment counts or coordinates')
        }
        // XML supplies gap residues, unlike m8's gap-opening count.
        const identity = 100 * identities / length
        const coverage = 100 * (length - gaps) / subjectLength
        if (identity < options.minid || coverage < options.mincov) continue
        hits.push({ file, sequence, start: Math.min(qstart, qend), end: Math.max(qstart, qend),
          strand: (qend - qstart) * (send - sstart) >= 0 ? '+' : '-', gene: meta.gene,
          coverage: coverageMap(sstart, send, subjectLength), gaps,
          pctCoverage: Math.round(coverage * 10) / 10, pctIdentity: Math.round(identity * 10) / 10,
          database, accession: meta.accession, product: meta.product, resistance: meta.resistance })
      }
    }
  }
  return hits
}
