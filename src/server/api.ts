/** Loopback HTTP API over the store (ADR-001 §4): JSON in, JSON out, `node:http` only. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Store } from './store'

/** ADR-001 review trigger: a document above ~1 MB means the JSON file store is outgrown. */
const BODY_LIMIT = 1024 * 1024

const ROUTES: Record<string, string[]> = {
  '/api/release': ['GET', 'PUT'],
  '/api/import': ['POST'],
  '/api/export': ['GET'],
}

/** Every response is JSON, pretty-printed like the stored file. */
function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body, null, 2) + '\n')
}

/**
 * The body text, or `undefined` when it passes the limit. An oversized body is still read to its end (and discarded)
 * before the reply, so the client receives the 413 instead of a reset while it is still uploading (QA #3972).
 */
function readBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = Number(req.headers['content-length']) > BODY_LIMIT
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return
      size += chunk.length
      if (size > BODY_LIMIT) {
        tooLarge = true
        chunks.length = 0
      } else chunks.push(chunk)
    })
    req.on('end', () => resolve(tooLarge ? undefined : Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Loopback names only: a page on another origin that rebinds its DNS to 127.0.0.1 still sends its own Host. */
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/

async function handle(store: Store, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '').split('?', 1)[0]!
  const method = req.method ?? ''
  if (!LOOPBACK_HOST.test(req.headers.host ?? '')) return send(res, 403, { error: 'forbidden host' })
  const allowed = ROUTES[path]
  if (!allowed) return send(res, 404, { error: 'not found' })
  if (!allowed.includes(method)) return send(res, 405, { error: 'method not allowed' }, { allow: allowed.join(', ') })
  // A JSON content type forces a CORS preflight, which this server never answers, so no other site can write here.
  if (method !== 'GET' && !/^application\/json(;|$)/i.test(req.headers['content-type'] ?? '')) {
    return send(res, 415, { error: 'content-type must be application/json' })
  }

  if (method === 'GET') {
    const exporting = path === '/api/export'
    const result = exporting ? await store.exportText() : await store.load()
    if (result.ok) {
      if (!('text' in result)) return send(res, 200, result.document)
      // Export is the stored file itself, byte for byte (QA #3972).
      res.writeHead(200, { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="release.json"' })
      return void res.end(result.text)
    }
    return 'missing' in result && result.missing ? send(res, 404, { error: 'no release' }) : send(res, 500, { errors: result.errors })
  }

  const text = await readBody(req)
  if (text === undefined) return send(res, 413, { error: 'payload too large' })
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch (error) {
    return send(res, 400, { errors: [{ code: 'invalid-json', message: (error as Error).message }] })
  }
  const saved = await store.save(doc)
  return saved.ok ? send(res, 200, { ok: true }) : send(res, 400, { errors: saved.errors })
}

export function createHandler(store: Store): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    handle(store, req, res).catch(() => {
      if (res.headersSent) res.destroy()
      else send(res, 500, { error: 'internal error' })
    })
  }
}
