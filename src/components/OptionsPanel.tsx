import type { GenetraxOptions } from '../genetrax/types'

interface OptionsPanelProps {
  options: GenetraxOptions
  onChange: (opts: GenetraxOptions) => void
  disabled: boolean
}

export function OptionsPanel({ options, onChange, disabled }: OptionsPanelProps) {
  function update(patch: Partial<GenetraxOptions>) {
    onChange({ ...options, ...patch })
  }

  return (
    <div className="options-panel">
      <h3 className="options-title">Options</h3>
      <div className="options-grid">
        <label className="option-field">
          <span className="option-label">Min %identity</span>
          <input
            type="number"
            min={50}
            max={100}
            value={options.minid}
            onChange={(e) => update({ minid: parseFloat(e.target.value) || 80 })}
            disabled={disabled}
            className="option-input"
            title="Minimum DNA percent identity (abricate --minid)"
          />
        </label>
        <label className="option-field">
          <span className="option-label">Min %coverage</span>
          <input
            type="number"
            min={10}
            max={100}
            value={options.mincov}
            onChange={(e) => update({ mincov: parseFloat(e.target.value) || 80 })}
            disabled={disabled}
            className="option-input"
            title="Minimum gene percent coverage (abricate --mincov)"
          />
        </label>
        <label className="option-field">
          <span className="option-label">E-value</span>
          <input
            type="text"
            value={options.evalue.toExponential()}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) update({ evalue: v })
            }}
            disabled={disabled}
            className="option-input"
            title="BLAST e-value cutoff"
          />
        </label>
      </div>
    </div>
  )
}
