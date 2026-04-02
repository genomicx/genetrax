/** Simple in-memory cache for database tarballs and metadata */

const dbCache = new Map<string, ArrayBuffer>()
const metaCache = new Map<string, ArrayBuffer>()

export async function fetchDatabase(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<ArrayBuffer> {
  if (dbCache.has(url)) return dbCache.get(url)!

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Failed to fetch database: ${resp.status} ${resp.statusText}`)

  const total = parseInt(resp.headers.get('content-length') ?? '0', 10)
  if (!resp.body) throw new Error('No response body')

  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    if (total > 0 && onProgress) onProgress(received / total)
  }

  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }

  const result = buffer.buffer
  dbCache.set(url, result)
  return result
}

export async function fetchMeta(url: string): Promise<Map<string, import('./types').GeneMeta>> {
  let buf: ArrayBuffer
  if (metaCache.has(url)) {
    buf = metaCache.get(url)!
  } else {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Failed to fetch metadata: ${resp.status}`)
    buf = await resp.arrayBuffer()
    metaCache.set(url, buf)
  }
  const text = new TextDecoder().decode(buf)
  const obj = JSON.parse(text) as Record<string, import('./types').GeneMeta>
  return new Map(Object.entries(obj))
}

export function evictDatabase(url: string) {
  dbCache.delete(url)
}

export function getCachedDbs(): string[] {
  return Array.from(dbCache.keys())
}
