import { DATABASE_SNAPSHOTS } from './databaseSnapshots'

export interface DatabaseConfig {
  id: string
  name: string
  version: string
  description: string
  /** Versioned archive containing all five formatdb -o T database files. */
  dbUrl: string
  /** URL to JSON file mapping gene_id → GeneMeta */
  metaUrl: string
  /** Approximate download size in MB */
  sizeMb: number
  dbSha256: string
  metaSha256: string
  manifestUrl: string
  /** AMR, virulence, or plasmid */
  category: 'amr' | 'virulence' | 'plasmid'
}

export const PRESET_DATABASES: DatabaseConfig[] = [
  {
    id: 'vfdb',
    name: 'VFDB',
    description: 'Virulence Factor Database — core set of experimentally verified virulence genes',
    ...DATABASE_SNAPSHOTS.vfdb,
    category: 'virulence',
  },
  {
    id: 'ncbi',
    name: 'NCBI AMR',
    description: 'NCBI AMRFinderPlus — comprehensive antimicrobial resistance gene database',
    ...DATABASE_SNAPSHOTS.ncbi,
    category: 'amr',
  },
  {
    id: 'card',
    name: 'CARD',
    description: 'Comprehensive Antibiotic Resistance Database — curated AMR gene ontology',
    ...DATABASE_SNAPSHOTS.card,
    category: 'amr',
  },
  {
    id: 'resfinder',
    name: 'ResFinder',
    description: 'ResFinder — acquired antimicrobial resistance genes from the DTU database',
    ...DATABASE_SNAPSHOTS.resfinder,
    category: 'amr',
  },
  {
    id: 'plasmidfinder',
    name: 'PlasmidFinder',
    description: 'PlasmidFinder — plasmid replicon sequences for incompatibility typing',
    ...DATABASE_SNAPSHOTS.plasmidfinder,
    category: 'plasmid',
  },
  {
    id: 'megares',
    name: 'MEGARes',
    description: 'MEGARes — comprehensive database for AMR genes in metagenomic data',
    ...DATABASE_SNAPSHOTS.megares,
    category: 'amr',
  },
]
