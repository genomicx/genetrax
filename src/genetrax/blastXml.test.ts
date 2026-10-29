import { describe, expect, it } from 'vitest'
import { parseBlastXml } from './blastXml'
import { DEFAULT_OPTIONS, type GeneMeta } from './types'
const metadata = new Map<string, GeneMeta>([['subject', { gene: 'generic_test', accession: 'QA001', product: 'Noncoding software test', resistance: '', length: 1000 }]])
function xml(identity = 800, length = 1000, gaps = 0, end = 1000, reverse = false) {
  return `<BlastOutput><Iteration><Iteration_query-def>query description</Iteration_query-def><Hit><Hit_id>lcl|subject</Hit_id><Hit_len>1000</Hit_len><Hit_hsps><Hsp>
  <Hsp_align-len>${length}</Hsp_align-len><Hsp_identity>${identity}</Hsp_identity><Hsp_gaps>${gaps}</Hsp_gaps>
  <Hsp_query-from>10</Hsp_query-from><Hsp_query-to>${end + 9}</Hsp_query-to><Hsp_hit-from>${reverse ? end : 1}</Hsp_hit-from><Hsp_hit-to>${reverse ? 1 : end}</Hsp_hit-to>
  </Hsp></Hit_hsps></Hit></Iteration></BlastOutput>`
}
const parse = (value: string, options = DEFAULT_OPTIONS) => parseBlastXml(value, 'query.fa', 'QA database', metadata, options)
describe('BLAST XML calls', () => {
  it('includes exact boundaries with inclusive 1-based coordinates', () => {
    expect(parse(xml())[0]).toMatchObject({ start: 10, end: 1009, sequence: 'query', pctIdentity: 80, pctCoverage: 100, accession: 'QA001' })
    expect(parse(xml(800, 800, 0, 800))).toHaveLength(1)
    expect(parse(xml(799, 799, 0, 799))).toHaveLength(0)
  })
  it('filters before rounding and reports reverse strand', () => {
    expect(parse(xml(7999, 10000), { ...DEFAULT_OPTIONS, mincov: 0 })).toHaveLength(0)
    expect(parse(xml(1000, 1000, 0, 1000, true))[0].strand).toBe('-')
  })
  it('uses gap residues rather than gap-opening count', () => {
    expect(parse(xml(990, 1000, 10))[0]).toMatchObject({ gaps: 10, pctCoverage: 99, pctIdentity: 99 })
  })
  it('rejects missing/mismatched metadata rather than dropping matches', () => {
    expect(() => parseBlastXml(xml(), 'q', 'db', new Map(), DEFAULT_OPTIONS)).toThrow('Missing metadata')
    expect(() => parseBlastXml(xml(), 'q', 'db', new Map([['subject', { ...metadata.get('subject')!, length: 999 }]]), DEFAULT_OPTIONS)).toThrow('length does not match')
  })
  it('rejects invalid output and accepts explicit no-hit output', () => {
    expect(() => parse('<html>error</html>')).toThrow('invalid or incomplete')
    expect(() => parse('<BlastOutput/>')).toThrow('no query iterations')
    expect(() => parse(xml(0, 0))).toThrow('Invalid BLAST alignment')
    expect(() => parse(xml(1001))).toThrow('Invalid BLAST alignment')
    expect(parse('<BlastOutput><Iteration><Iteration_query-def>query</Iteration_query-def><Iteration_message>No hits found</Iteration_message></Iteration></BlastOutput>')).toEqual([])
  })
  it('accepts legacy statistics-only trailers but rejects unnamed hit iterations', () => {
    expect(parse(xml().replace('</BlastOutput>', '<Iteration><Iteration_stat/></Iteration></BlastOutput>'))).toHaveLength(1)
    expect(() => parse(xml().replace('<Iteration_query-def>query description</Iteration_query-def>', ''))).toThrow('no query iterations')
    expect(parse(xml(1000).replace('<Hsp_gaps>0</Hsp_gaps>', ''))[0].gaps).toBe(0)
  })
  it('preserves duplicate HSPs as separate rows', () => {
    const value = xml(1000), hsp = value.match(/<Hsp>[\s\S]*?<\/Hsp>/)![0]
    expect(parse(value.replace('</Hit_hsps>', hsp + '</Hit_hsps>'))).toHaveLength(2)
  })
})
