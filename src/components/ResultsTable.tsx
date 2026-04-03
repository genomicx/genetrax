import { useState, useMemo } from 'react'
import { StatusBadge } from '@genomicx/ui'
import { saveAs } from 'file-saver'
import type { GenetraxResult, GenetraxHit } from '../genetrax/types'

interface ResultsTableProps {
  result: GenetraxResult
}

const COLUMNS = [
  { key: 'file',        label: 'FILE',         sortable: true  },
  { key: 'sequence',    label: 'SEQUENCE',      sortable: true  },
  { key: 'start',       label: 'START',         sortable: true  },
  { key: 'end',         label: 'END',           sortable: true  },
  { key: 'strand',      label: 'STRAND',        sortable: false },
  { key: 'gene',        label: 'GENE',          sortable: true  },
  { key: 'coverage',    label: 'COVERAGE_MAP',  sortable: false },
  { key: 'gaps',        label: 'GAPS',          sortable: true  },
  { key: 'pctCoverage', label: '%COVERAGE',     sortable: true  },
  { key: 'pctIdentity', label: '%IDENTITY',     sortable: true  },
  { key: 'database',    label: 'DATABASE',      sortable: false },
  { key: 'accession',   label: 'ACCESSION',     sortable: false },
  { key: 'product',     label: 'PRODUCT',       sortable: true  },
  { key: 'resistance',  label: 'RESISTANCE',    sortable: true  },
] as const

type SortKey = typeof COLUMNS[number]['key']

export function ResultsTable({ result }: ResultsTableProps) {
  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('pctIdentity')
  const [sortAsc, setSortAsc] = useState(false)

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return result.hits.filter(
      (h) =>
        !q ||
        h.gene.toLowerCase().includes(q) ||
        h.sequence.toLowerCase().includes(q) ||
        h.product.toLowerCase().includes(q) ||
        h.resistance.toLowerCase().includes(q) ||
        h.file.toLowerCase().includes(q),
    )
  }, [result.hits, filter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey as keyof GenetraxHit]
      const bv = b[sortKey as keyof GenetraxHit]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortAsc ? av - bv : bv - av
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [filtered, sortKey, sortAsc])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  function exportTsv() {
    const header = COLUMNS.map((c) => c.label).join('\t')
    const rows = result.hits.map((h) =>
      [
        h.file, h.sequence, h.start, h.end, h.strand,
        h.gene, h.coverage, h.gaps, h.pctCoverage, h.pctIdentity,
        h.database, h.accession, h.product, h.resistance,
      ].join('\t'),
    )
    const tsv = `#${header}\n${rows.join('\n')}\n`
    saveAs(new Blob([tsv], { type: 'text/tab-separated-values' }), 'genetrax_results.tsv')
  }

  function exportCsv() {
    const header = COLUMNS.map((c) => c.label).join(',')
    const rows = result.hits.map((h) =>
      [
        h.file, h.sequence, h.start, h.end, h.strand,
        h.gene, h.coverage, h.gaps, h.pctCoverage, h.pctIdentity,
        h.database, h.accession, `"${h.product}"`, `"${h.resistance}"`,
      ].join(','),
    )
    const csv = `${header}\n${rows.join('\n')}\n`
    saveAs(new Blob([csv], { type: 'text/csv' }), 'genetrax_results.csv')
  }

  function exportJson() {
    const json = JSON.stringify(result, null, 2)
    saveAs(new Blob([json], { type: 'application/json' }), 'genetrax_results.json')
  }

  const pctVariant = (v: number): 'success' | 'warning' | 'error' =>
    v >= 99 ? 'success' : v >= 90 ? 'warning' : 'error'

  return (
    <section className="results">
      <div className="results-header">
        <div>
          <h2>Results</h2>
          <div className="results-meta">
            {result.queryFiles.join(', ')} &middot; {result.databaseName} &middot;
            minid={result.minid}% mincov={result.mincov}%
          </div>
        </div>
        <div className="results-actions">
          <input
            className="results-filter"
            type="text"
            placeholder="Filter by gene, product, resistance..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="export-button" onClick={exportTsv}>TSV</button>
          <button className="export-button" onClick={exportCsv}>CSV</button>
          <button className="export-button" onClick={exportJson}>JSON</button>
        </div>
      </div>

      <p className="results-count">
        Showing {sorted.length} of {result.hits.length} hit{result.hits.length !== 1 ? 's' : ''}
      </p>

      <div className="results-table-container">
        <table className="results-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={col.sortable ? 'sortable' : ''}
                  onClick={() => col.sortable && handleSort(col.key as SortKey)}
                >
                  {col.label}
                  {col.sortable && (
                    <span className={`sort-arrow${sortKey === col.key ? '' : ' inactive'}`}>
                      {sortKey === col.key ? (sortAsc ? ' ▲' : ' ▼') : ' ▼'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((hit, i) => (
              <tr key={i}>
                <td className="mono">{hit.file}</td>
                <td className="mono">{hit.sequence}</td>
                <td className="mono">{hit.start}</td>
                <td className="mono">{hit.end}</td>
                <td className="mono">{hit.strand}</td>
                <td style={{ fontWeight: 600 }}>{hit.gene}</td>
                <td className="mono" style={{ letterSpacing: '0.05em' }}>{hit.coverage}</td>
                <td className="mono">{hit.gaps}</td>
                <td>
                  <StatusBadge variant={pctVariant(hit.pctCoverage)}>
                    {hit.pctCoverage}%
                  </StatusBadge>
                </td>
                <td>
                  <StatusBadge variant={pctVariant(hit.pctIdentity)}>
                    {hit.pctIdentity}%
                  </StatusBadge>
                </td>
                <td className="mono">{hit.database}</td>
                <td className="mono">{hit.accession}</td>
                <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hit.product}>
                  {hit.product}
                </td>
                <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hit.resistance}>
                  {hit.resistance || '—'}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={14} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gx-text-muted)' }}>
                  No hits match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
