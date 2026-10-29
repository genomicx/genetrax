import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDatabase, fetchMeta, getCachedDbs } from './dbCache'
afterEach(() => vi.unstubAllGlobals())
describe('reference downloads', () => {
  it('reports real HTTP404s and does not cache failed downloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(fetchDatabase('https://example.invalid/vfdb')).rejects.toThrow('HTTP 404')
    await expect(fetchMeta('https://example.invalid/meta')).rejects.toThrow('HTTP 404')
    expect(getCachedDbs()).not.toContain('https://example.invalid/vfdb')
  })
  it('rejects mismatched checksums without caching the object', async () => {
    const data = new Uint8Array([31, 139, 0]); let read = false
    vi.stubGlobal('crypto', { subtle: { digest: async () => new Uint8Array([1]).buffer } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), body: { getReader: () => ({ read: async () => read ? { done: true } : (read = true, { done: false, value: data }) }) } }))
    await expect(fetchDatabase('https://example.invalid/corrupt', undefined, '00')).rejects.toThrow('checksum mismatch')
    expect(getCachedDbs()).not.toContain('https://example.invalid/corrupt')
  })
  it('rejects an HTML error page served as HTTP200', async () => {
    const data = new TextEncoder().encode('<html>missing</html>'); let read = false
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), body: { getReader: () => ({ read: async () => read ? { done: true } : (read = true, { done: false, value: data }) }) } }))
    await expect(fetchDatabase('https://example.invalid/html')).rejects.toThrow('not a gzip')
    expect(getCachedDbs()).not.toContain('https://example.invalid/html')
  })
})
