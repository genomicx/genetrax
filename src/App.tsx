import { useState, useEffect, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import { NavBar, AppFooter, LogConsole } from '@genomicx/ui'
import { FileUpload } from './components/FileUpload'
import { DatabaseSelector } from './components/DatabaseSelector'
import { ResultsTable } from './components/ResultsTable'
import { OptionsPanel } from './components/OptionsPanel'
import { About } from './pages/About'
import { runGenetrax } from './genetrax/pipeline'
import { DEFAULT_OPTIONS } from './genetrax/types'
import { APP_VERSION } from './lib/version'
import type { GenetraxResult, GenetraxOptions, DatabaseSource } from './genetrax/types'
import './App.css'

function AnalysisPage() {
  const [queryFiles, setQueryFiles] = useState<File[]>([])
  const [dbSource, setDbSource] = useState<DatabaseSource | null>(null)
  const [options, setOptions] = useState<GenetraxOptions>(DEFAULT_OPTIONS)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState('')
  const [logLines, setLogLines] = useState<string[]>([])
  const [result, setResult] = useState<GenetraxResult | null>(null)

  const handleRun = useCallback(async () => {
    if (queryFiles.length === 0 || !dbSource) return

    setRunning(true)
    setError('')
    setResult(null)
    setLogLines([])
    setProgress('Starting...')
    setProgressPct(0)

    try {
      const res = await runGenetrax(
        queryFiles,
        dbSource,
        options,
        (msg, pct) => {
          setProgress(msg)
          setProgressPct(pct)
        },
        (msg) => setLogLines((prev) => [...prev, msg]),
      )
      setResult(res)
      setProgress('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }, [queryFiles, dbSource, options])

  const canRun = queryFiles.length > 0 && dbSource !== null && !running

  return (
    <>
      <div className="controls-row">
        <FileUpload
          files={queryFiles}
          onFilesChange={setQueryFiles}
          disabled={running}
        />
        <OptionsPanel
          options={options}
          onChange={setOptions}
          disabled={running}
        />
      </div>

      <DatabaseSelector
        value={dbSource}
        onChange={setDbSource}
        disabled={running}
      />

      <button
        className="run-button"
        onClick={handleRun}
        disabled={!canRun}
      >
        {running ? 'Screening…' : 'Screen for AMR & Virulence Genes'}
      </button>

      {running && (
        <section className="progress" aria-live="polite">
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuenow={Math.round(progressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="progress-text">{progress}</p>
        </section>
      )}

      {error && (
        <section className="error" role="alert">
          <p>{error}</p>
        </section>
      )}

      {result && <ResultsTable result={result} />}

      {logLines.length > 0 && <LogConsole logs={logLines} />}
    </>
  )
}

function App() {
  useEffect(() => {
    const saved = (localStorage.getItem('gx-theme') as 'light' | 'dark') || 'dark'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  return (
    <div className="app">
      <NavBar
        appName="GENETRAX"
        appSubtitle="AMR & Virulence Gene Screening"
        version={APP_VERSION}
        icon={
          <svg className="gx-nav-logo-icon" viewBox="0 0 24 24" fill="none" stroke="var(--gx-accent)" strokeWidth="2">
            {/* Shield with DNA strands - AMR resistance theme */}
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="9" y1="10" x2="15" y2="10" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        }
      />

      <main className="app-main">
        <Routes>
          <Route path="/" element={<AnalysisPage />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>

      <AppFooter appName="GENETRAX" bugReportUrl="https://github.com/genomicx/genetrax/issues" />
    </div>
  )
}

export default App
