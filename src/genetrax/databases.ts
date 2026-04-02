const DB_BASE = 'https://static.genomicx.org/db/genetrax'

export interface DatabaseConfig {
  id: string
  name: string
  version: string
  description: string
  /** URL to tar.gz containing .nhr .nin .nsq BLAST database files */
  dbUrl: string
  /** URL to JSON file mapping gene_id → GeneMeta */
  metaUrl: string
  /** Approximate download size in MB */
  sizeMb: number
  /** AMR, virulence, or plasmid */
  category: 'amr' | 'virulence' | 'plasmid'
}

export const PRESET_DATABASES: DatabaseConfig[] = [
  {
    id: 'vfdb',
    name: 'VFDB',
    version: '2024',
    description: 'Virulence Factor Database — core set of experimentally verified virulence genes',
    dbUrl: `${DB_BASE}/vfdb.tar.gz`,
    metaUrl: `${DB_BASE}/vfdb.meta.json`,
    sizeMb: 12,
    category: 'virulence',
  },
  {
    id: 'ncbi',
    name: 'NCBI AMR',
    version: '2024-01-31.1',
    description: 'NCBI AMRFinderPlus — comprehensive antimicrobial resistance gene database',
    dbUrl: `${DB_BASE}/ncbi.tar.gz`,
    metaUrl: `${DB_BASE}/ncbi.meta.json`,
    sizeMb: 8,
    category: 'amr',
  },
  {
    id: 'card',
    name: 'CARD',
    version: '3.2.9',
    description: 'Comprehensive Antibiotic Resistance Database — curated AMR gene ontology',
    dbUrl: `${DB_BASE}/card.tar.gz`,
    metaUrl: `${DB_BASE}/card.meta.json`,
    sizeMb: 6,
    category: 'amr',
  },
  {
    id: 'resfinder',
    name: 'ResFinder',
    version: '4.6.0',
    description: 'ResFinder — acquired antimicrobial resistance genes from the DTU database',
    dbUrl: `${DB_BASE}/resfinder.tar.gz`,
    metaUrl: `${DB_BASE}/resfinder.meta.json`,
    sizeMb: 4,
    category: 'amr',
  },
  {
    id: 'plasmidfinder',
    name: 'PlasmidFinder',
    version: '2024-01',
    description: 'PlasmidFinder — plasmid replicon sequences for incompatibility typing',
    dbUrl: `${DB_BASE}/plasmidfinder.tar.gz`,
    metaUrl: `${DB_BASE}/plasmidfinder.meta.json`,
    sizeMb: 1,
    category: 'plasmid',
  },
  {
    id: 'megares',
    name: 'MEGARes',
    version: '3.0',
    description: 'MEGARes — comprehensive database for AMR genes in metagenomic data',
    dbUrl: `${DB_BASE}/megares.tar.gz`,
    metaUrl: `${DB_BASE}/megares.meta.json`,
    sizeMb: 3,
    category: 'amr',
  },
]
