import { useCallback } from 'react'

interface FileUploadProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  disabled: boolean
}

export function FileUpload({ files, onFilesChange, disabled }: FileUploadProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) onFilesChange(Array.from(e.target.files))
    },
    [onFilesChange],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer.files) {
        const accepted = Array.from(e.dataTransfer.files).filter((f) => {
          const name = f.name.replace(/\.gz$/, '')
          return (
            name.endsWith('.fasta') ||
            name.endsWith('.fa') ||
            name.endsWith('.fna') ||
            name.endsWith('.fsa')
          )
        })
        if (accepted.length > 0) onFilesChange(accepted)
      }
    },
    [onFilesChange],
  )

  return (
    <div className="file-upload" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      <label className="file-upload-area">
        <input
          type="file"
          multiple
          accept=".fasta,.fa,.fna,.fsa,.fasta.gz,.fa.gz,.fna.gz"
          onChange={handleChange}
          disabled={disabled}
          aria-label="Upload genome assembly FASTA files"
        />
        <svg className="file-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {files.length === 0 ? (
          <>
            <div className="file-upload-label">Drop genome assemblies or click to browse</div>
            <div className="file-upload-hint">.fasta, .fa, .fna, .fsa (optionally .gz)</div>
          </>
        ) : (
          <>
            <div className="file-upload-label">{files.length} file(s) selected</div>
            <ul className="file-list">
              {files.map((f) => <li key={f.name}>{f.name}</li>)}
            </ul>
          </>
        )}
      </label>
    </div>
  )
}
