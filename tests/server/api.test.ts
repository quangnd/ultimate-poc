import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReleaseDocument } from '../../src/domain/types'
import { startServer } from '../../src/server/main'

// Integration tests: a real server on port 0 and a real data directory in tmp (ADR-001 §3-4, issue #18).

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8')) as ReleaseDocument
const good = fixture('release.json')
const cyclic = fixture('cycle-variant.json')
const serialized = (doc: unknown) => JSON.stringify(doc, null, 2) + '\n'
const MB = 1024 * 1024

const variant = (n: number): ReleaseDocument => {
  const doc = structuredClone(good)
  doc.tasks[0]!.title = `Variant ${n}`
  return doc
}

let dataDir: string
let file: string
let running: Awaited<ReturnType<typeof startServer>>
const send = (method: string, path: string, body?: unknown) =>
  fetch(running.url + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rrl-api-'))
  file = join(dataDir, 'release.json')
  running = await startServer({ port: 0, dataDir })
})
afterEach(async () => {
  await running.close()
  await rm(dataDir, { recursive: true, force: true })
})

describe('server', () => {
  it('binds 127.0.0.1 only', () => {
    const address = running.server.address() as AddressInfo
    expect(address.address).toBe('127.0.0.1')
    expect(address.family).toBe('IPv4')
    expect(running.url).toBe(`http://127.0.0.1:${address.port}`)
  })

  it('keeps the data across a restart on the same directory', async () => {
    expect((await send('PUT', '/api/release', good)).status).toBe(200)
    await running.close()
    running = await startServer({ port: 0, dataDir })
    const res = await send('GET', '/api/release')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(good)
  })
})

describe('GET /api/release', () => {
  it('answers 404 {error} while no release is stored', async () => {
    const res = await send('GET', '/api/release')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ error: 'no release' })
  })

  it('returns the stored document as JSON', async () => {
    await send('PUT', '/api/release', good)
    const res = await send('GET', '/api/release')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual(good)
  })

  it('answers 500 {errors} for a corrupt or invalid file and does not touch it', async () => {
    await writeFile(file, '{ not json')
    let res = await send('GET', '/api/release')
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ errors: [{ code: 'invalid-json' }] })

    await writeFile(file, serialized(cyclic))
    res = await send('GET', '/api/release')
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ errors: [{ code: 'cycle' }] })
    expect(await readFile(file, 'utf8')).toBe(serialized(cyclic))
  })
})

describe('PUT /api/release and POST /api/import', () => {
  it.each([
    ['PUT', '/api/release'],
    ['POST', '/api/import'],
  ])('%s %s stores a valid document: 200 {ok:true}', async (method, path) => {
    const res = await send(method, path, good)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ ok: true })
    expect(await readFile(file, 'utf8')).toBe(serialized(good))
  })

  it.each([
    ['PUT', '/api/release'],
    ['POST', '/api/import'],
  ])('%s %s refuses an invalid document with 400 and all errors, leaving the file byte-identical', async (method, path) => {
    await send('PUT', '/api/release', good)
    const before = await readFile(file)

    let res = await send(method, path, { ...structuredClone(good), schemaVersion: 2, workstreams: 'FW' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { errors: { code: string }[] }
    expect(body.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['invalid-schema-version', 'invalid-workstreams']))

    res = await send(method, path, cyclic)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ errors: [{ code: 'cycle' }] })

    expect((await readFile(file)).equals(before)).toBe(true)
    expect(await readdir(dataDir)).toEqual(['release.json'])
  })

  it.each([
    ['PUT', '/api/release'],
    ['POST', '/api/import'],
  ])('%s %s answers 400 invalid-json for an unparseable or empty body and stores nothing', async (method, path) => {
    for (const body of ['{ nope', '']) {
      const res = await send(method, path, body)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ errors: [{ code: 'invalid-json' }] })
    }
    expect(await readdir(dataDir)).toEqual([])
  })

  it('serializes 20 concurrent PUTs: the final file is one complete, valid document among those sent', async () => {
    const docs = Array.from({ length: 20 }, (_, i) => variant(i))
    const responses = await Promise.all(docs.map((d) => send('PUT', '/api/release', d)))
    expect(responses.map((r) => r.status)).toEqual(Array(20).fill(200))

    const stored = JSON.parse(await readFile(file, 'utf8')) as unknown
    expect(docs).toContainEqual(stored)
    expect(await readdir(dataDir)).toEqual(['release.json'])
    expect(await (await send('GET', '/api/release')).json()).toEqual(stored)
  })
})

describe('GET /api/export', () => {
  it('answers 404 while no release is stored', async () => {
    const res = await send('GET', '/api/export')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'no release' })
  })

  it('exports what import stored, byte-identical to JSON.stringify(fixture, null, 2) plus a newline, as an attachment', async () => {
    expect((await send('POST', '/api/import', good)).status).toBe(200)
    const res = await send('GET', '/api/export')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="release.json"')
    const text = await res.text()
    expect(text).toBe(serialized(good))
    expect(await readFile(file, 'utf8')).toBe(text)
  })

  it('answers 500 {errors} for a corrupt file', async () => {
    await writeFile(file, '{ not json')
    const res = await send('GET', '/api/export')
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ errors: [{ code: 'invalid-json' }] })
  })
})

describe('limits and routing', () => {
  it('accepts a body of exactly 1 MB and answers 413 above it, with or without a content-length', async () => {
    const atLimit = await send('PUT', '/api/release', ' '.repeat(MB))
    expect(atLimit.status).toBe(400)

    const declared = await send('PUT', '/api/release', ' '.repeat(MB + 1))
    expect(declared.status).toBe(413)
    expect(await declared.json()).toEqual({ error: 'payload too large' })

    // chunked: no content-length, the limit is enforced while reading
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${running.url}/api/import`, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.write(' '.repeat(MB / 2))
      req.write(' '.repeat(MB / 2))
      req.end(' ')
    })
    expect(status).toBe(413)
    expect(await readdir(dataDir)).toEqual([])
  })

  it('answers 405 with an allow header for a wrong method on a known path', async () => {
    for (const [method, path, allow] of [
      ['DELETE', '/api/release', 'GET, PUT'],
      ['POST', '/api/release', 'GET, PUT'],
      ['GET', '/api/import', 'POST'],
      ['PUT', '/api/import', 'POST'],
      ['PUT', '/api/export', 'GET'],
      ['POST', '/api/export', 'GET'],
    ] as const) {
      const res = await send(method, path, method === 'GET' ? undefined : good)
      expect(res.status, `${method} ${path}`).toBe(405)
      expect(res.headers.get('allow')).toBe(allow)
      expect(await res.json()).toEqual({ error: 'method not allowed' })
    }
    expect(await readdir(dataDir)).toEqual([])
  })

  // Hardening (coordinator, from worker #3786's risk note): another site must not be able to write the local store.
  it('refuses writes without a JSON content type (415) and requests with a non-loopback Host (403)', async () => {
    // A cross-site "simple" request: text/plain needs no CORS preflight, so the server itself must refuse it.
    const plain = await fetch(running.url + '/api/release', { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(good) })
    expect(plain.status).toBe(415)
    // DNS rebinding: the browser sends the attacker's host name.
    const port = new URL(running.url).port
    const status = await new Promise<number>((resolve, reject) => {
      request({ host: '127.0.0.1', port, path: '/api/release', headers: { host: `evil.example:${port}` } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      }).on('error', reject).end()
    })
    expect(status).toBe(403)
    expect(await readdir(dataDir)).toEqual([])
  })

  it('answers 404 for any other route, ignoring the query string on known ones', async () => {
    for (const path of ['/', '/nope', '/api', '/api/releases', '/api/release/', '/index.html']) {
      const res = await send('GET', path)
      expect(res.status, path).toBe(404)
      expect(res.headers.get('content-type')).toBe('application/json')
      expect(await res.json()).toEqual({ error: 'not found' })
    }
    await send('PUT', '/api/release', good)
    expect((await send('GET', '/api/release?x=1')).status).toBe(200)
  })
})
