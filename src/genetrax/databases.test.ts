import { describe, it, expect } from 'vitest'
import { PRESET_DATABASES } from './databases'

describe('PRESET_DATABASES', () => {
  it('has at least one database entry', () => {
    expect(PRESET_DATABASES.length).toBeGreaterThan(0)
  })

  it('each entry has required fields', () => {
    for (const db of PRESET_DATABASES) {
      expect(db.id).toBeTruthy()
      expect(db.name).toBeTruthy()
      expect(db.version).toBeTruthy()
      expect(db.dbUrl).toMatch(/^https?:\/\//)
      expect(db.metaUrl).toMatch(/^https?:\/\//)
      expect(db.sizeMb).toBeGreaterThan(0)
      expect(['amr', 'virulence', 'plasmid']).toContain(db.category)
    }
  })

  it('has unique IDs', () => {
    const ids = PRESET_DATABASES.map((db) => db.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
