import { describe, expect, it } from 'vitest'
import { databasePrefix, readQueryFasta } from './validation'
const bytes = (text: string) => new TextEncoder().encode(text)
const files = (header: string) => new Map(['nin', 'nhr', 'nsq'].map(suffix => [`actual-name.${suffix}`, bytes(suffix === 'nhr' ? header : 'database')]))
describe('database packaging', () => {
  it('rejects incomplete indexed archives and accepts all five files', () => {
    const database = files('indexed local sequence ID')
    expect(() => databasePrefix(database)).toThrow('include both .nsi and .nsd')
    database.set('actual-name.nsi', bytes('index')); database.set('actual-name.nsd', bytes('index'))
    expect(databasePrefix(database)).toBe('actual-name')
  })
  it('accepts legitimate unindexed ordinal three-file databases', () => expect(databasePrefix(files('\x1a\x09BL_ORD_ID'))).toBe('actual-name'))
  it('rejects missing sequence data and ambiguous prefixes', () => {
    const database = files('\x1a\x09BL_ORD_ID'); database.delete('actual-name.nsq')
    expect(() => databasePrefix(database)).toThrow('missing actual-name.nsq')
    database.set('second.nin', bytes('index'))
    expect(() => databasePrefix(database)).toThrow('Expected one')
  })
})
describe('FASTA validation', () => {
  // jsdom File lacks the arrayBuffer API provided by real browsers.
  const file = (text: string, name = 'query.fa') => ({ name, arrayBuffer: async () => bytes(text).buffer }) as File
  it('accepts multi-contig nucleotide FASTA', async () => expect(new TextDecoder().decode(await readQueryFasta(file('>a\nACGTNN\n>b\nTGCA\n')))).toContain('>b'))
  it('rejects invalid, empty, protein and mislabeled gzip data', async () => {
    for (const value of ['not fasta', '>a\n', '>a\nACGT\n>b\n', '>protein\nMPEPTIDE\n']) await expect(readQueryFasta(file(value))).rejects.toThrow()
    await expect(readQueryFasta(file('>a\nACGT\n', 'q.fa.gz'))).rejects.toThrow('expected gzip')
  })
})
