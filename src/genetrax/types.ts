import type { DatabaseConfig } from './databases'

/** One BLAST hit after abricate-style processing */
export interface GenetraxHit {
  file: string         // input filename
  sequence: string     // contig/query sequence name
  start: number        // alignment start on query (1-based)
  end: number          // alignment end on query (1-based)
  strand: string       // + or -
  gene: string         // gene name
  coverage: string     // visual coverage map (=====..)
  gaps: number         // number of gaps in alignment
  pctCoverage: number  // %COVERAGE: (length-gaps)/slen*100
  pctIdentity: number  // %IDENTITY: pident from BLAST
  database: string     // database name
  accession: string    // subject accession
  product: string      // gene product description
  resistance: string   // resistance/class annotation
}

/** Gene metadata stored in companion JSON files */
export interface GeneMeta {
  gene: string
  product: string
  resistance: string
  accession: string
  length: number       // subject sequence length in bp
}

/** The active database source */
export type DatabaseSource =
  | { type: 'preset'; config: DatabaseConfig }
  | { type: 'upload'; file: File; metaFile: File }

/** Filtering/threshold options */
export interface GenetraxOptions {
  minid: number    // minimum %identity (default 80)
  mincov: number   // minimum %coverage (default 80)
  evalue: number   // e-value cutoff (default 1e-20)
}

export const DEFAULT_OPTIONS: GenetraxOptions = {
  minid: 80,
  mincov: 80,
  evalue: 1e-20,
}

/** Overall pipeline result */
export interface GenetraxResult {
  hits: GenetraxHit[]
  queryFiles: string[]
  databaseName: string
  minid: number
  mincov: number
  ranAt: string
}
