import type { GeneMeta } from './types'

const dbCache = new Map<string, ArrayBuffer>()
const metaCache = new Map<string, ArrayBuffer>()

async function verify(buffer: ArrayBuffer, expected: string | undefined, label: string) {
  if (!expected) return
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
  if (actual !== expected) throw new Error(`${label} checksum mismatch; the download is corrupt or does not match this snapshot`)
}

export async function fetchDatabase(url: string, onProgress?: (fraction: number) => void, sha256?: string): Promise<ArrayBuffer> {
  const cached = dbCache.get(url)
  if (cached) { await verify(cached, sha256, 'Database'); return cached }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Database download failed (HTTP ${response.status}): ${url}`)
  const total = Number(response.headers.get('content-length') ?? 0)
  if (!response.body) throw new Error('Database download returned no response body')
  const chunks: Uint8Array[] = []
  let received = 0
  const reader = response.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    if (total > 0) onProgress?.(Math.min(1, received / total))
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('Database download is not a gzip archive')
  await verify(bytes.buffer, sha256, 'Database')
  dbCache.set(url, bytes.buffer)
  return bytes.buffer
}

export async function fetchMeta(url: string, sha256?: string): Promise<Map<string, GeneMeta>> {
  let buffer = metaCache.get(url)
  if (!buffer) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Database metadata download failed (HTTP ${response.status}): ${url}`)
    buffer = await response.arrayBuffer()
  }
  await verify(buffer, sha256, 'Database metadata')
  const metadata = decodeMetadata(buffer)
  metaCache.set(url, buffer)
  return metadata
}

export function decodeMetadata(buffer: ArrayBuffer): Map<string, GeneMeta> {
  const value: unknown = JSON.parse(new TextDecoder().decode(buffer))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid database metadata object')
  for (const [id, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.length) || entry.length <= 0 ||
        !['gene', 'accession', 'product', 'resistance'].every(key => typeof entry[key] === 'string')) {
      throw new Error(`Invalid database metadata for ${id}`)
    }
  }
  return new Map(Object.entries(value) as [string, GeneMeta][])
}

export function evictDatabase(url: string) {
  dbCache.delete(url)
  metaCache.clear()
}

export function getCachedDbs(): string[] { return [...dbCache.keys()] }
