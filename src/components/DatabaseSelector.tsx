import { useState } from 'react'
import { PRESET_DATABASES } from '../genetrax/databases'
import { evictDatabase, getCachedDbs } from '../genetrax/dbCache'
import type { DatabaseSource } from '../genetrax/types'

interface DatabaseSelectorProps {
  value: DatabaseSource | null
  onChange: (src: DatabaseSource | null) => void
  disabled: boolean
}

type TabMode = 'amr' | 'virulence' | 'plasmid' | 'custom'

export function DatabaseSelector({ value, onChange, disabled }: DatabaseSelectorProps) {
  const [tab, setTab] = useState<TabMode>('amr')
  const [cachedUrls, setCachedUrls] = useState<string[]>(() => getCachedDbs())

  const filtered = PRESET_DATABASES.filter((db) => db.category === tab)

  function handleEvict(url: string) {
    evictDatabase(url)
    setCachedUrls(getCachedDbs())
  }

  return (
    <div className="db-selector">
      <h3 className="options-title">Database</h3>

      <div className="db-mode-tabs">
        {(['amr', 'virulence', 'plasmid', 'custom'] as TabMode[]).map((t) => (
          <button
            key={t}
            className={`db-mode-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
            disabled={disabled}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab !== 'custom' ? (
        <div className="db-list">
          {filtered.length === 0 && (
            <p className="db-empty">No databases in this category yet.</p>
          )}
          {filtered.map((db) => {
            const selected = value?.type === 'preset' && value.config.id === db.id
            const cached = cachedUrls.includes(db.dbUrl)
            return (
              <div
                key={db.id}
                className={`db-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                onClick={() => !disabled && onChange({ type: 'preset', config: db })}
                role="radio"
                aria-checked={selected}
                tabIndex={0}
                onKeyDown={(e) => e.key === ' ' && !disabled && onChange({ type: 'preset', config: db })}
              >
                <input
                  type="radio"
                  readOnly
                  checked={selected}
                  tabIndex={-1}
                  aria-hidden
                />
                <div className="db-card-body">
                  <div className="db-card-header">
                    <span className="db-name">{db.name}</span>
                    <span className="db-version">{db.version}</span>
                    {cached && (
                      <span className="db-cached-badge">
                        ✓ cached
                        <button
                          className="db-evict-btn"
                          title="Clear from cache"
                          onClick={(e) => { e.stopPropagation(); handleEvict(db.dbUrl) }}
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </div>
                  <p className="db-description">{db.description}</p>
                  <span className="db-size">~{db.sizeMb} MB download</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <CustomUpload value={value} onChange={onChange} disabled={disabled} />
      )}
    </div>
  )
}

interface CustomUploadProps {
  value: DatabaseSource | null
  onChange: (src: DatabaseSource | null) => void
  disabled: boolean
}

function CustomUpload({ value, onChange, disabled }: CustomUploadProps) {
  const [dbFile, setDbFile] = useState<File | null>(null)
  const [metaFile, setMetaFile] = useState<File | null>(null)

  function apply() {
    if (dbFile && metaFile) {
      onChange({ type: 'upload', file: dbFile, metaFile })
    }
  }

  const isActive = value?.type === 'upload'

  return (
    <div className="db-custom-upload">
      <p className="db-description" style={{ marginBottom: '0.75rem' }}>
        Upload a custom BLAST database (tar.gz of .nhr/.nin/.nsq) and a gene metadata JSON file.
        The JSON should map sequence IDs to <code>{`{gene, product, resistance, accession, length}`}</code>.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <label className="option-field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem' }}>
          <span className="option-label">Database (.tar.gz)</span>
          <input
            type="file"
            accept=".tar.gz,.gz"
            disabled={disabled}
            onChange={(e) => setDbFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: '0.85rem' }}
          />
        </label>
        <label className="option-field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem' }}>
          <span className="option-label">Metadata (.json)</span>
          <input
            type="file"
            accept=".json"
            disabled={disabled}
            onChange={(e) => setMetaFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: '0.85rem' }}
          />
        </label>
        <button
          className={`db-mode-tab${isActive ? ' active' : ''}`}
          style={{ width: 'fit-content' }}
          onClick={apply}
          disabled={disabled || !dbFile || !metaFile}
        >
          Use Custom Database
        </button>
      </div>
    </div>
  )
}
