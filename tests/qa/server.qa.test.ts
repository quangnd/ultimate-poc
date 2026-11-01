/**
 * Independent QA acceptance tests for issue #18 "P2-1: JSON store with atomic writes and loopback API".
 *
 * Black-box, written from ADR-001 §3-4, the issue's acceptance criteria and the contract in the QA brief
 * (`createStore`, `startServer`, the four routes and the security rules). They use only the public surface:
 * the store's functions, real HTTP requests to a server on an ephemeral port, and the files in a temp directory.
 * They never assert an error message, the order of an error list, or a response body the contract does not fix.
 *
 * Two things are simulated rather than mocked:
 * - a crash between the tmp write and the rename: a child process runs the real store with `rename` replaced by a
 *   hard `SIGKILL` of the process, so the on-disk state is exactly what a power cut would leave;
 * - a non-loopback client: a TCP connect to the machine's own LAN address must be refused.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import http, { type IncomingHttpHeaders, type Server } from 'node:http'
import net, { type AddressInfo } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { validateDocument, type ValidationError } from '../../src/domain/validate'
import { startServer } from '../../src/server/main'
import { createStore } from '../../src/server/store'

// ---------------------------------------------------------------- fixtures and helpers

type Json = any

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const FIXTURE_BYTES = readFileSync(join(ROOT, 'fixtures/release.json'))
const FIXTURE: Json = JSON.parse(FIXTURE_BYTES.toString('utf8'))
const CYCLE_FIXTURE: Json = JSON.parse(readFileSync(join(ROOT, 'fixtures/cycle-variant.json'), 'utf8'))
const MIB = 1024 * 1024

/** The exact on-disk form the contract fixes for a saved document. */
const pretty = (doc: unknown) => JSON.stringify(doc, null, 2) + '\n'

/** The fixture with its first task's title replaced, so each variant is a distinct valid document. */
function variant(label: string, padding = 0): Json {
  const doc = structuredClone(FIXTURE)
  doc.tasks[0].title = label + 'x'.repeat(padding)
  return doc
}

/** A document with several independent faults, to prove that all errors are reported and not just the first. */
function multiInvalid(): Json {
  const doc = structuredClone(FIXTURE)
  doc.release.startDate = '2027-02-30'
  doc.tasks[0].status = 'bogus'
  doc.tasks[1].predecessors = ['NO-SUCH-TASK']
  doc.tasks[2].estimateDays = -3
  return doc
}

function validatorErrors(doc: unknown): ValidationError[] {
  const result = validateDocument(doc)
  if (result.ok) throw new Error('test setup: expected the document to be invalid')
  return result.errors
}

/** Errors in a canonical order, so tests compare the set and never rely on the order of the list. */
const canonical = (errors: ValidationError[]) =>
  [...errors].sort((a, b) => `${a.code}|${a.taskId ?? ''}|${a.message}`.localeCompare(`${b.code}|${b.taskId ?? ''}|${b.message}`))

function expectValidatorErrors(actual: unknown, doc: unknown) {
  expect(Array.isArray(actual)).toBe(true)
  expect(canonical(actual as ValidationError[])).toEqual(canonical(validatorErrors(doc)))
}

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!().catch(() => undefined)
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rrl-qa18-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** Bytes, mtime and inode of every file in `dir`: equal snapshots mean nothing was written, replaced or touched. */
async function snapshot(dir: string) {
  const out: Record<string, { content: string; mtimeMs: number; ino: number }> = {}
  for (const name of (await readdir(dir)).sort()) {
    const info = await stat(join(dir, name))
    out[name] = { content: (await readFile(join(dir, name))).toString('base64'), mtimeMs: info.mtimeMs, ino: info.ino }
  }
  return out
}

const names = async (dir: string) => (await readdir(dir)).sort()

interface Booted {
  dataDir: string
  file: string
  url: string
  port: number
  server: Server
  stop(): Promise<void>
}

async function boot(dataDir?: string): Promise<Booted> {
  const dir = dataDir ?? (await tempDir())
  const running = await startServer({ port: 0, dataDir: dir })
  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    await running.close()
  }
  cleanups.push(stop)
  const url = new URL(running.url)
  return { dataDir: dir, file: join(dir, 'release.json'), url: running.url, port: Number(url.port), server: running.server as Server, stop }
}

interface Res {
  status: number
  headers: IncomingHttpHeaders
  body: Buffer
  text: string
  json: Json
}

interface ReqOpts {
  body?: string | Buffer
  /** Default: `application/json` when there is a body. `null` sends no content-type at all. */
  contentType?: string | null
  /** Overrides the Host header. */
  host?: string
  /** Sends the body as these chunks with `transfer-encoding: chunked` and no content-length. */
  chunks?: Buffer[]
}

/** A plain `node:http` request on its own connection; it can set Host and content-type exactly (fetch cannot). */
function request(base: string, method: string, path: string, opts: ReqOpts = {}): Promise<Res> {
  const url = new URL(base)
  const headers: Record<string, string> = {}
  const hasBody = opts.body !== undefined || opts.chunks !== undefined
  if (opts.contentType === undefined ? hasBody : opts.contentType !== null) headers['content-type'] = opts.contentType ?? 'application/json'
  if (opts.host !== undefined) headers.host = opts.host
  if (opts.chunks) headers['transfer-encoding'] = 'chunked'
  return new Promise((resolve, reject) => {
    const req = http.request({ host: url.hostname, port: Number(url.port), method, path, headers, agent: false })
    let response = false
    req.setTimeout(20_000, () => req.destroy(new Error(`${method} ${path}: timed out`)))
    req.on('error', (error) => {
      // A server may answer 413 and drop the connection while the client is still sending: the answer wins.
      if (!response) reject(error)
    })
    req.on('response', (res) => {
      response = true
      const parts: Buffer[] = []
      let done = false
      const finish = () => {
        if (done) return
        done = true
        const body = Buffer.concat(parts)
        const text = body.toString('utf8')
        let json: Json
        try {
          json = JSON.parse(text)
        } catch {
          json = undefined
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body, text, json })
      }
      res.on('data', (chunk: Buffer) => parts.push(chunk))
      res.on('end', finish)
      res.on('close', finish)
      res.on('error', finish)
    })
    if (opts.chunks) {
      for (const chunk of opts.chunks) req.write(chunk)
      req.end()
    } else {
      req.end(opts.body)
    }
  })
}

const get = (b: Booted, path: string, opts?: ReqOpts) => request(b.url, 'GET', path, opts)
const put = (b: Booted, doc: unknown) => request(b.url, 'PUT', '/api/release', { body: JSON.stringify(doc) })
const importDoc = (b: Booted, doc: unknown) => request(b.url, 'POST', '/api/import', { body: JSON.stringify(doc) })

/** True when a TCP connection to host:port is accepted. */
function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(2000, () => done(false))
    socket.on('connect', () => done(true))
    socket.on('error', () => done(false))
  })
}

/** A valid document whose compact JSON is exactly `bytes` long (ASCII padding in a title). */
function documentOfSize(bytes: number): string {
  const base = structuredClone(FIXTURE)
  base.tasks[0].title = ''
  const overhead = Buffer.byteLength(JSON.stringify(base))
  base.tasks[0].title = 'p'.repeat(bytes - overhead)
  const text = JSON.stringify(base)
  expect(Buffer.byteLength(text)).toBe(bytes)
  expect(validateDocument(base).ok).toBe(true)
  return text
}

// ================================================================ the store

describe('store: file, round trip and exact content', () => {
  it('keeps the document in <dir>/release.json', async () => {
    const dir = await tempDir()
    expect(createStore(dir).file).toBe(join(dir, 'release.json'))
  })

  it('load of a missing file is exactly { ok: false, missing: true } and creates nothing', async () => {
    const dir = await tempDir()
    expect(await createStore(dir).load()).toEqual({ ok: false, missing: true })
    expect(await names(dir)).toEqual([])
  })

  it('save then load returns an equal document; the file is JSON.stringify(doc, null, 2) + newline and nothing else is left behind', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    expect(await store.save(FIXTURE)).toEqual({ ok: true })
    expect(await readFile(store.file, 'utf8')).toBe(pretty(FIXTURE))
    expect(await names(dir)).toEqual(['release.json'])
    const loaded = await store.load()
    expect(loaded).toEqual({ ok: true, document: FIXTURE })
  })

  it('stores exactly what it was given: unicode, escapes, key order and fields the validator does not know', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    const doc = variant('Zoë "quoted" \\ back — 日本語 🚀 \u2028 line\nbreak\ttab')
    doc.note = { z: 1, a: [1, 2, { c: null }] }
    expect(validateDocument(doc).ok).toBe(true)
    expect(await store.save(doc)).toEqual({ ok: true })
    expect(await readFile(store.file, 'utf8')).toBe(pretty(doc))
    expect(await store.load()).toEqual({ ok: true, document: doc })
  })

  it('a second save replaces the first completely', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    await store.save(variant('first', 5000))
    const second = variant('second')
    expect(await store.save(second)).toEqual({ ok: true })
    expect(await readFile(store.file, 'utf8')).toBe(pretty(second))
    expect(await names(dir)).toEqual(['release.json'])
  })

  it('a valid save replaces a corrupt file (the operator can overwrite a bad file through the store)', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    await writeFile(store.file, '{ this is not json')
    expect(await store.save(FIXTURE)).toEqual({ ok: true })
    expect(await store.load()).toEqual({ ok: true, document: FIXTURE })
  })
})

describe('store: an invalid document is refused and the file is left untouched', () => {
  it('reports every validator error and leaves the existing file, its mtime and the directory unchanged', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    await store.save(FIXTURE)
    const before = await snapshot(dir)
    const bad = multiInvalid()
    expect(new Set(validatorErrors(bad).map((e) => e.code)).size).toBeGreaterThanOrEqual(4)
    const result = await store.save(bad)
    expect(result.ok).toBe(false)
    expectValidatorErrors((result as { errors: unknown }).errors, bad)
    expect(await snapshot(dir)).toEqual(before)
  })

  it('creates neither the file nor a tmp file when the first save is invalid', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    const result = await store.save(CYCLE_FIXTURE)
    expect(result.ok).toBe(false)
    expect((result as { errors: ValidationError[] }).errors.map((e) => e.code)).toContain('cycle')
    expect(await names(dir)).toEqual([])
    expect(await store.load()).toEqual({ ok: false, missing: true })
  })

  it.each([[null], [undefined], [[]], ['text'], [42], [true], [{}]])('refuses %j and leaves the file unchanged', async (value) => {
    const dir = await tempDir()
    const store = createStore(dir)
    await store.save(FIXTURE)
    const before = await snapshot(dir)
    const result = await store.save(value)
    expect(result.ok).toBe(false)
    expect((result as { errors: unknown[] }).errors.length).toBeGreaterThan(0)
    expect(await snapshot(dir)).toEqual(before)
  })
})

describe('store: an invalid or corrupt file is refused on load and never repaired', () => {
  const corrupt: Array<[string, string | Buffer]> = [
    ['an empty file', ''],
    ['truncated JSON', pretty(FIXTURE).slice(0, 300)],
    ['plain text', 'this is not json\n'],
    ['binary junk', Buffer.from([0, 255, 254, 1, 2, 3, 123, 125])],
    ['a half-written save', pretty(FIXTURE).slice(0, -40)],
  ]
  it.each(corrupt)('%s: invalid-json, the file and directory are unchanged', async (_name, content) => {
    const dir = await tempDir()
    const store = createStore(dir)
    await writeFile(store.file, content)
    const before = await snapshot(dir)
    const result = await store.load()
    expect(result.ok).toBe(false)
    expect('missing' in result && result.missing).toBeFalsy()
    const errors = (result as { errors: Array<{ code: string; message: string }> }).errors
    expect(errors.map((e) => e.code)).toContain('invalid-json')
    expect(errors.every((e) => typeof e.message === 'string' && e.message.length > 0)).toBe(true)
    expect(await snapshot(dir)).toEqual(before)
  })

  const invalid: Array<[string, unknown]> = [
    ['a dependency cycle', CYCLE_FIXTURE],
    ['several independent faults', multiInvalid()],
    ['an unsupported schemaVersion', { ...structuredClone(FIXTURE), schemaVersion: 2 }],
    ['JSON null', null],
    ['a JSON array', []],
    ['an empty object', {}],
  ]
  it.each(invalid)('%s: the validator errors are returned, the file and directory are unchanged', async (_name, doc) => {
    const dir = await tempDir()
    const store = createStore(dir)
    await writeFile(store.file, pretty(doc))
    const before = await snapshot(dir)
    const result = await store.load()
    expect(result.ok).toBe(false)
    const errors = (result as { errors: ValidationError[] }).errors
    expect(errors.map((e) => e.code)).not.toContain('invalid-json')
    expectValidatorErrors(errors, doc)
    expect(await snapshot(dir)).toEqual(before)
  })

  it('a valid file in another layout (minified, CRLF) loads as is and is not rewritten', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    for (const text of [JSON.stringify(FIXTURE), pretty(FIXTURE).replace(/\n/g, '\r\n'), FIXTURE_BYTES.toString('utf8')]) {
      await writeFile(store.file, text)
      const before = await snapshot(dir)
      expect(await store.load()).toEqual({ ok: true, document: FIXTURE })
      expect(await snapshot(dir)).toEqual(before)
    }
  })

  it('a leftover release.json.tmp does not affect load: the old file is used, and without a file the result is still "missing"', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    const partial = pretty(variant('new')).slice(0, 200)
    await writeFile(join(dir, 'release.json.tmp'), partial)
    expect(await store.load()).toEqual({ ok: false, missing: true })
    await writeFile(store.file, pretty(FIXTURE))
    const before = await snapshot(dir)
    expect(await store.load()).toEqual({ ok: true, document: FIXTURE })
    expect(await snapshot(dir)).toEqual(before)
  })
})

describe('store: atomicity', () => {
  /**
   * Runs the real store in a child process whose `rename` (all three Node variants) writes a report of what it saw
   * and then SIGKILLs the process. A fsync (fs.fsync, fs.fsyncSync or FileHandle#sync) is recorded so the order
   * "write tmp, fsync, rename" can be checked.
   */
  const CHILD = `
    import fs from 'node:fs'
    import { syncBuiltinESMExports } from 'node:module'
    const readFileSync = fs.readFileSync, writeFileSync = fs.writeFileSync
    const events = []
    const crash = (src, dest) => {
      events.push('rename')
      let tmpContent = null
      try { tmpContent = readFileSync(src, 'utf8') } catch {}
      writeFileSync(process.env.QA_REPORT, JSON.stringify({ events, src: String(src), dest: String(dest), tmpContent }))
      process.kill(process.pid, 'SIGKILL')
    }
    const spy = (target, name) => {
      const original = target[name]
      target[name] = function (...args) { events.push('fsync'); return original.apply(this, args) }
    }
    spy(fs, 'fsync')
    spy(fs, 'fsyncSync')
    const handle = await fs.promises.open(process.execPath, 'r')
    spy(Object.getPrototypeOf(handle), 'sync')
    await handle.close()
    fs.rename = (src, dest) => crash(src, dest)
    fs.renameSync = (src, dest) => crash(src, dest)
    fs.promises.rename = async (src, dest) => crash(src, dest)
    syncBuiltinESMExports()
    const { createStore } = await import(process.env.QA_STORE)
    const result = await createStore(process.env.QA_DIR).save(JSON.parse(process.env.QA_DOC))
    writeFileSync(process.env.QA_REPORT, JSON.stringify({ events, finished: result }))
  `

  it('a crash between the tmp write and the rename leaves the old file intact; the next save and a restart work', async () => {
    const dir = await tempDir()
    const reportDir = await tempDir()
    const report = join(reportDir, 'report.json')
    const store = createStore(dir)
    const oldDoc = variant('old')
    const newDoc = variant('new', 3000)
    await store.save(oldDoc)
    const before = await snapshot(dir)

    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', CHILD], {
      cwd: ROOT,
      timeout: 30_000,
      encoding: 'utf8',
      env: {
        ...process.env,
        QA_STORE: new URL('../../src/server/store.ts', import.meta.url).href,
        QA_DIR: dir,
        QA_REPORT: report,
        QA_DOC: JSON.stringify(newDoc),
      },
    })
    const saw = JSON.parse(await readFile(report, 'utf8').catch(() => '{}'))
    const context = `child signal=${child.signal} status=${child.status}\n${child.stderr}`
    expect(saw.finished, `the save finished without ever calling rename\n${context}`).toBeUndefined()
    expect(child.signal, context).toBe('SIGKILL')

    // At the moment of the rename: the complete new content was already in a tmp file in the same directory, after a fsync.
    expect(saw.events.at(-1)).toBe('rename')
    expect(saw.events.indexOf('fsync'), 'no fsync before the rename').toBeGreaterThanOrEqual(0)
    expect(saw.events.indexOf('fsync')).toBeLessThan(saw.events.indexOf('rename'))
    expect(basename(saw.src)).toBe('release.json.tmp')
    expect(await realpath(dirname(saw.src))).toBe(await realpath(dir))
    expect(saw.dest).toBe(store.file)
    expect(saw.tmpContent).toBe(pretty(newDoc))

    // After the "crash": the old file is byte-identical and loads; a leftover tmp may remain.
    const after = await snapshot(dir)
    expect(after['release.json']).toEqual(before['release.json'])
    expect(await readFile(store.file, 'utf8')).toBe(pretty(oldDoc))
    expect(await store.load()).toEqual({ ok: true, document: oldDoc })

    // A restarted server serves the old document, and the next save succeeds over the leftover tmp.
    await rm(report)
    const running = await boot(dir)
    expect((await get(running, '/api/release')).json).toEqual(oldDoc)
    expect((await put(running, newDoc)).status).toBe(200)
    expect(await readFile(store.file, 'utf8')).toBe(pretty(newDoc))
    expect(await names(dir)).toEqual(['release.json'])
  }, 60_000)

  it('a stray partial release.json.tmp from an earlier crash does not block or leak into the next save', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    await store.save(variant('old'))
    await writeFile(join(dir, 'release.json.tmp'), '{"schemaVersion": 1, "relea')
    const next = variant('next', 1000)
    expect(await store.save(next)).toEqual({ ok: true })
    expect(await readFile(store.file, 'utf8')).toBe(pretty(next))
    expect(await names(dir)).toEqual(['release.json'])
  })

  it('concurrent saves never interleave: all succeed, the file is exactly one of the documents, no tmp remains, and loads never see a partial file', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    const docs = Array.from({ length: 30 }, (_, i) => variant(`doc-${i}-`, 150_000 + i * 7919))
    const known = new Map([[pretty(variant('seed')), 'seed'], ...docs.map((d, i) => [pretty(d), `doc-${i}`] as const)])
    await store.save(variant('seed'))

    const saves = docs.map((d) => store.save(d))
    const loads = Array.from({ length: 60 }, async () => {
      await new Promise((r) => setImmediate(r))
      return store.load()
    })
    const [saved, loaded] = await Promise.all([Promise.all(saves), Promise.all(loads)])

    expect(saved.every((r) => r.ok === true)).toBe(true)
    for (const result of loaded) {
      expect(result.ok).toBe(true)
      expect(known.has(pretty((result as { document: unknown }).document))).toBe(true)
    }
    const text = await readFile(store.file, 'utf8')
    expect(known.has(text)).toBe(true)
    expect(JSON.parse(text)).toBeTypeOf('object')
    expect(await names(dir)).toEqual(['release.json'])
  })

  it('saves are serialized in the order they were requested: the last one requested is the one that remains', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    const docs = ['a', 'b', 'c', 'd', 'e'].map((label, i) => variant(label, (5 - i) * 40_000))
    const results = await Promise.all(docs.map((d) => store.save(d)))
    expect(results.every((r) => r.ok)).toBe(true)
    expect(await readFile(store.file, 'utf8')).toBe(pretty(docs[4]))
  })

  it('an invalid save queued between valid saves is refused without disturbing the others', async () => {
    const dir = await tempDir()
    const store = createStore(dir)
    const first = variant('first', 20_000)
    const last = variant('last', 20_000)
    const [r1, r2, r3] = await Promise.all([store.save(first), store.save(multiInvalid()), store.save(last)])
    expect([r1.ok, r2.ok, r3.ok]).toEqual([true, false, true])
    expect(await readFile(store.file, 'utf8')).toBe(pretty(last))
    expect(await names(dir)).toEqual(['release.json'])
  })
})

// ================================================================ the server: binding and lifecycle

describe('server: binds 127.0.0.1 only', () => {
  it('listens on 127.0.0.1 on an ephemeral port, and its url says so', async () => {
    const s = await boot()
    const address = s.server.address() as AddressInfo
    expect(address.address).toBe('127.0.0.1')
    expect(address.family).toBe('IPv4')
    expect(address.port).toBeGreaterThan(0)
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/)
    expect(s.port).toBe(address.port)
    expect(s.server.listening).toBe(true)
  })

  const external = Object.values(networkInterfaces())
    .flatMap((list) => list ?? [])
    .find((i) => i.family === 'IPv4' && !i.internal)
  it.skipIf(!external)('is not reachable on the machine\'s own non-loopback address, only on 127.0.0.1', async () => {
    const s = await boot()
    expect(await canConnect('127.0.0.1', s.port)).toBe(true)
    expect(await canConnect(external!.address, s.port)).toBe(false)
  })

  it('is not reachable over IPv6 loopback either', async () => {
    const s = await boot()
    expect(await canConnect('::1', s.port)).toBe(false)
  })

  it('close() stops listening and the port is released', async () => {
    const s = await boot()
    expect((await get(s, '/api/release')).status).toBe(404)
    await s.stop()
    expect(s.server.listening).toBe(false)
    expect(await canConnect('127.0.0.1', s.port)).toBe(false)
  })

  it('two servers started with port 0 get different ports', async () => {
    const a = await boot()
    const b = await boot()
    expect(a.port).not.toBe(b.port)
  })
})

// ================================================================ the API

describe('API: GET /api/release', () => {
  it('404 { error: "no release" } when there is no file', async () => {
    const s = await boot()
    const res = await get(s, '/api/release')
    expect(res.status).toBe(404)
    expect(res.json).toEqual({ error: 'no release' })
    expect(await names(s.dataDir)).toEqual([])
  })

  it('200 with the document when the file is valid', async () => {
    const s = await boot()
    await createStore(s.dataDir).save(FIXTURE)
    const res = await get(s, '/api/release')
    expect(res.status).toBe(200)
    expect(res.json).toEqual(FIXTURE)
  })

  it('500 { errors } with the validator errors when the stored file is invalid, and the file is left as it was', async () => {
    const s = await boot()
    await writeFile(s.file, pretty(CYCLE_FIXTURE))
    const before = await snapshot(s.dataDir)
    const res = await get(s, '/api/release')
    expect(res.status).toBe(500)
    expect(Object.keys(res.json)).toEqual(['errors'])
    expectValidatorErrors(res.json.errors, CYCLE_FIXTURE)
    expect(res.json.errors.map((e: ValidationError) => e.code)).toContain('cycle')
    expect(await snapshot(s.dataDir)).toEqual(before)
  })

  it('500 with an invalid-json error when the stored file is corrupt, and the file is left as it was', async () => {
    const s = await boot()
    await writeFile(s.file, '{"schemaVersion": 1, "release": ')
    const before = await snapshot(s.dataDir)
    const res = await get(s, '/api/release')
    expect(res.status).toBe(500)
    expect(res.json.errors.map((e: ValidationError) => e.code)).toContain('invalid-json')
    expect(await snapshot(s.dataDir)).toEqual(before)
  })

  it('a corrupt file present at server start does not stop the server and is not repaired', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'release.json'), 'garbage')
    const before = await snapshot(dir)
    const s = await boot(dir)
    expect((await get(s, '/api/release')).status).toBe(500)
    expect(await snapshot(dir)).toEqual(before)
  })

  it('a leftover release.json.tmp is never served: with no release.json the answer is 404', async () => {
    const s = await boot()
    await writeFile(join(s.dataDir, 'release.json.tmp'), pretty(FIXTURE))
    expect((await get(s, '/api/release')).status).toBe(404)
    expect((await get(s, '/api/export')).status).toBe(404)
  })
})

describe('API: PUT /api/release', () => {
  it('200 { ok: true } for a valid document; the file is JSON.stringify(doc, null, 2) + newline and GET returns the document', async () => {
    const s = await boot()
    const res = await put(s, FIXTURE)
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true })
    expect(await readFile(s.file, 'utf8')).toBe(pretty(FIXTURE))
    expect(await names(s.dataDir)).toEqual(['release.json'])
    expect((await get(s, '/api/release')).json).toEqual(FIXTURE)
  })

  it('replaces the previous document', async () => {
    const s = await boot()
    await put(s, FIXTURE)
    const next = variant('second')
    expect((await put(s, next)).status).toBe(200)
    expect((await get(s, '/api/release')).json).toEqual(next)
    expect(await readFile(s.file, 'utf8')).toBe(pretty(next))
  })

  it('400 { errors } with ALL validator errors for an invalid document; the stored file is unchanged', async () => {
    const s = await boot()
    await put(s, FIXTURE)
    const before = await snapshot(s.dataDir)
    const bad = multiInvalid()
    const res = await put(s, bad)
    expect(res.status).toBe(400)
    expectValidatorErrors(res.json.errors, bad)
    expect(new Set(res.json.errors.map((e: ValidationError) => e.code)).size).toBeGreaterThanOrEqual(4)
    expect(await snapshot(s.dataDir)).toEqual(before)
  })

  it('400 for an invalid first document: no file is created', async () => {
    const s = await boot()
    const res = await put(s, CYCLE_FIXTURE)
    expect(res.status).toBe(400)
    expect(res.json.errors.map((e: ValidationError) => e.code)).toContain('cycle')
    expect(await names(s.dataDir)).toEqual([])
    expect((await get(s, '/api/release')).status).toBe(404)
  })

  it.each([['{"schemaVersion":1,'], ['not json at all'], [''], ["{'single': 'quotes'}"], ['{"a":1}{"b":2}']])(
    'an unparseable body %j: 400 with an invalid-json error, on both write routes, and the stored file is unchanged',
    async (body) => {
      const s = await boot()
      await put(s, FIXTURE)
      const before = await snapshot(s.dataDir)
      for (const [method, path] of [['PUT', '/api/release'], ['POST', '/api/import']] as const) {
        const res = await request(s.url, method, path, { body })
        expect(res.status, `${method} ${path}`).toBe(400)
        expect(res.json.errors.map((e: ValidationError) => e.code), `${method} ${path}`).toContain('invalid-json')
      }
      expect(await snapshot(s.dataDir)).toEqual(before)
    },
  )

  it.each([['null'], ['[]'], ['42'], ['"text"'], ['true'], ['{}']])(
    'a body that parses but is not a document (%s): 400 with the validator errors, on both write routes, and the file is unchanged',
    async (body) => {
      const s = await boot()
      await put(s, FIXTURE)
      const before = await snapshot(s.dataDir)
      for (const [method, path] of [['PUT', '/api/release'], ['POST', '/api/import']] as const) {
        const res = await request(s.url, method, path, { body })
        expect(res.status, `${method} ${path}`).toBe(400)
        expectValidatorErrors(res.json.errors, JSON.parse(body))
        expect(res.json.errors.map((e: ValidationError) => e.code)).not.toContain('invalid-json')
      }
      expect(await snapshot(s.dataDir)).toEqual(before)
    },
  )

  it('replaces a corrupt stored file when the new document is valid', async () => {
    const s = await boot()
    await writeFile(s.file, 'garbage')
    expect((await put(s, FIXTURE)).status).toBe(200)
    expect((await get(s, '/api/release')).json).toEqual(FIXTURE)
  })

  it('accepts a content-type with parameters: application/json; charset=utf-8', async () => {
    const s = await boot()
    const res = await request(s.url, 'PUT', '/api/release', { body: JSON.stringify(FIXTURE), contentType: 'application/json; charset=utf-8' })
    expect(res.status).toBe(200)
    expect(await readFile(s.file, 'utf8')).toBe(pretty(FIXTURE))
  })

  it('stores unicode and extra fields exactly as sent', async () => {
    const s = await boot()
    const doc = variant('Zoë 日本語 🚀 "q"')
    doc.extra = { keep: [1, 2, 3] }
    expect((await request(s.url, 'PUT', '/api/release', { body: Buffer.from(JSON.stringify(doc), 'utf8') })).status).toBe(200)
    expect(await readFile(s.file, 'utf8')).toBe(pretty(doc))
  })
})

describe('API: POST /api/import', () => {
  it('imports the fixture file as is: 200 { ok: true }; the stored file is the canonical form and GET returns the fixture', async () => {
    const s = await boot()
    const res = await request(s.url, 'POST', '/api/import', { body: FIXTURE_BYTES })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true })
    expect(await readFile(s.file, 'utf8')).toBe(pretty(FIXTURE))
    expect((await get(s, '/api/release')).json).toEqual(FIXTURE)
  })

  it('400 { errors } with all errors for an invalid import; the stored file is unchanged', async () => {
    const s = await boot()
    await importDoc(s, FIXTURE)
    const before = await snapshot(s.dataDir)
    const bad = multiInvalid()
    const res = await importDoc(s, bad)
    expect(res.status).toBe(400)
    expectValidatorErrors(res.json.errors, bad)
    const cycle = await request(s.url, 'POST', '/api/import', { body: JSON.stringify(CYCLE_FIXTURE) })
    expect(cycle.status).toBe(400)
    expect(cycle.json.errors.map((e: ValidationError) => e.code)).toContain('cycle')
    expect(await snapshot(s.dataDir)).toEqual(before)
  })

  it('an import into an empty directory creates the file; an invalid import there creates nothing', async () => {
    const s = await boot()
    expect((await importDoc(s, CYCLE_FIXTURE)).status).toBe(400)
    expect(await names(s.dataDir)).toEqual([])
    expect((await importDoc(s, FIXTURE)).status).toBe(200)
    expect(await names(s.dataDir)).toEqual(['release.json'])
  })
})

describe('API: GET /api/export', () => {
  it('404 when there is no file', async () => {
    const s = await boot()
    expect((await get(s, '/api/export')).status).toBe(404)
    expect(await names(s.dataDir)).toEqual([])
  })

  it('200 with the stored document, byte-identical to the file, as an attachment named release.json', async () => {
    const s = await boot()
    await importDoc(s, FIXTURE)
    const res = await get(s, '/api/export')
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toBe('attachment; filename="release.json"')
    expect(Buffer.compare(res.body, await readFile(s.file))).toBe(0)
    expect(res.text).toBe(pretty(FIXTURE))
    expect(JSON.parse(res.text)).toEqual(FIXTURE)
  })

  const handLaidOut = () => [JSON.stringify(FIXTURE), FIXTURE_BYTES.toString('utf8'), pretty(FIXTURE).replace(/\n/g, '\r\n')]

  it('a valid file laid out differently by hand is exported as the same document', async () => {
    const s = await boot()
    for (const text of handLaidOut()) {
      await writeFile(s.file, text)
      const res = await get(s, '/api/export')
      expect(res.status).toBe(200)
      expect(JSON.parse(res.text)).toEqual(FIXTURE)
    }
  })

  // Was a known deviation (export re-serialized the document); the server now serves the file's own bytes.
  it('serves the file\'s own bytes, also when a valid file was laid out differently by hand', async () => {
    const s = await boot()
    for (const text of handLaidOut()) {
      await writeFile(s.file, text)
      const res = await get(s, '/api/export')
      expect(res.status).toBe(200)
      expect(Buffer.compare(res.body, Buffer.from(text, 'utf8'))).toBe(0)
    }
  })

  it('does not export an invalid or corrupt file as if it were a release, and leaves it unchanged', async () => {
    const s = await boot()
    for (const text of ['garbage', pretty(CYCLE_FIXTURE)]) {
      await writeFile(s.file, text)
      const before = await snapshot(s.dataDir)
      const res = await get(s, '/api/export')
      expect(res.status, text.slice(0, 20)).toBeGreaterThanOrEqual(400)
      expect(res.headers['content-disposition']).toBeUndefined()
      expect(await snapshot(s.dataDir)).toEqual(before)
    }
  })
})

describe('API: JSON in and out', () => {
  it('every JSON response says application/json', async () => {
    const s = await boot()
    const responses = [
      await get(s, '/api/release'), // 404
      await put(s, FIXTURE), // 200
      await get(s, '/api/release'), // 200
      await get(s, '/api/export'), // 200
      await put(s, multiInvalid()), // 400
      await request(s.url, 'POST', '/api/import', { body: '{' }), // 400
    ]
    expect(responses.map((r) => r.status)).toEqual([404, 200, 200, 200, 400, 400])
    for (const res of responses) expect(res.headers['content-type'], `status ${res.status}`).toMatch(/^application\/json/i)
  })
})

describe('API: export → import round trip and persistence', () => {
  it('importing the exported bytes (into a fresh server) gives a byte-identical file', async () => {
    const a = await boot()
    await request(a.url, 'POST', '/api/import', { body: FIXTURE_BYTES })
    const exported = await get(a, '/api/export')
    expect(exported.status).toBe(200)

    const b = await boot()
    const res = await request(b.url, 'POST', '/api/import', { body: exported.body })
    expect(res.status).toBe(200)
    expect(Buffer.compare(await readFile(b.file), await readFile(a.file))).toBe(0)
    expect(Buffer.compare((await get(b, '/api/export')).body, exported.body)).toBe(0)
  })

  it('importing the exported bytes into the same server changes nothing in content, and exporting again returns the same bytes', async () => {
    const s = await boot()
    await importDoc(s, FIXTURE)
    const first = (await get(s, '/api/export')).body
    expect((await request(s.url, 'POST', '/api/import', { body: first })).status).toBe(200)
    expect(Buffer.compare(await readFile(s.file), first)).toBe(0)
    expect(Buffer.compare((await get(s, '/api/export')).body, first)).toBe(0)
  })

  it('a document imported in the canonical form comes back out as exactly those bytes', async () => {
    const s = await boot()
    const bytes = Buffer.from(pretty(FIXTURE), 'utf8')
    expect((await request(s.url, 'POST', '/api/import', { body: bytes })).status).toBe(200)
    expect(Buffer.compare((await get(s, '/api/export')).body, bytes)).toBe(0)
  })

  it('PUT and import store the same file for the same document', async () => {
    const viaPut = await boot()
    const viaImport = await boot()
    await put(viaPut, FIXTURE)
    await importDoc(viaImport, FIXTURE)
    expect(Buffer.compare(await readFile(viaPut.file), await readFile(viaImport.file))).toBe(0)
  })

  it('restart: after close() a new server on the same directory still serves the data', async () => {
    const first = await boot()
    await put(first, FIXTURE)
    const edited = variant('edited after import')
    expect((await put(first, edited)).status).toBe(200)
    const bytes = await readFile(first.file)
    await first.stop()

    const second = await boot(first.dataDir)
    expect(second.port).toBeGreaterThan(0)
    const res = await get(second, '/api/release')
    expect(res.status).toBe(200)
    expect(res.json).toEqual(edited)
    expect(Buffer.compare((await get(second, '/api/export')).body, bytes)).toBe(0)
    expect(Buffer.compare(await readFile(second.file), bytes)).toBe(0)
  })

  it('restart after an import, and edits keep working on the restarted server', async () => {
    const first = await boot()
    await request(first.url, 'POST', '/api/import', { body: FIXTURE_BYTES })
    await first.stop()
    const second = await boot(first.dataDir)
    expect((await get(second, '/api/release')).json).toEqual(FIXTURE)
    const edited = variant('after restart')
    expect((await put(second, edited)).status).toBe(200)
    await second.stop()
    const third = await boot(first.dataDir)
    expect((await get(third, '/api/release')).json).toEqual(edited)
  })

  it('a rejected write before the restart leaves the old data in place after it', async () => {
    const first = await boot()
    await put(first, FIXTURE)
    expect((await put(first, multiInvalid())).status).toBe(400)
    await first.stop()
    const second = await boot(first.dataDir)
    expect((await get(second, '/api/release')).json).toEqual(FIXTURE)
  })

  it('the server and the store share one file: what the store saves the server serves, and the reverse', async () => {
    const s = await boot()
    const store = createStore(s.dataDir)
    expect(store.file).toBe(s.file)
    await store.save(FIXTURE)
    expect((await get(s, '/api/release')).json).toEqual(FIXTURE)
    const edited = variant('via http')
    await put(s, edited)
    expect(await store.load()).toEqual({ ok: true, document: edited })
  })
})

describe('API: requests are serialized', () => {
  it('concurrent PUTs all succeed, never interleave a partial file, and the file is exactly one of the documents', async () => {
    const s = await boot()
    const seed = variant('seed')
    await put(s, seed)
    const docs = Array.from({ length: 25 }, (_, i) => variant(`doc-${i}-`, 120_000 + i * 4099))
    const known = new Set([pretty(seed), ...docs.map(pretty)])

    const writes = docs.map((d) => put(s, d))
    const reads = Array.from({ length: 40 }, async () => {
      await new Promise((r) => setImmediate(r))
      return get(s, '/api/release')
    })
    const exports = Array.from({ length: 10 }, async () => {
      await new Promise((r) => setImmediate(r))
      return get(s, '/api/export')
    })
    const [written, read, exported] = await Promise.all([Promise.all(writes), Promise.all(reads), Promise.all(exports)])

    expect(written.map((r) => r.status)).toEqual(docs.map(() => 200))
    for (const res of read) {
      expect(res.status).toBe(200)
      expect(known.has(pretty(res.json))).toBe(true)
    }
    for (const res of exported) {
      expect(res.status).toBe(200)
      expect(known.has(res.text)).toBe(true)
    }
    expect(known.has(await readFile(s.file, 'utf8'))).toBe(true)
    expect(await names(s.dataDir)).toEqual(['release.json'])
    expect(known.has(pretty((await get(s, '/api/release')).json))).toBe(true)
  })

  it('concurrent valid and invalid writes: the invalid ones are 400, the valid ones 200, and the file is one of the valid documents', async () => {
    const s = await boot()
    await put(s, FIXTURE)
    const good = Array.from({ length: 8 }, (_, i) => variant(`good-${i}-`, 60_000))
    const known = new Set(good.map(pretty))
    const results = await Promise.all(
      good.flatMap((d, i) => [put(s, d), i % 2 === 0 ? put(s, multiInvalid()) : importDoc(s, CYCLE_FIXTURE)]),
    )
    expect(results.map((r) => r.status)).toEqual(good.flatMap(() => [200, 400]))
    expect(known.has(await readFile(s.file, 'utf8'))).toBe(true)
    expect(await names(s.dataDir)).toEqual(['release.json'])
  })
})

/**
 * Sends an oversized body until an answer is read. A server that answers 413 and drops the socket while the client is
 * still uploading can make the client see ECONNRESET/EPIPE instead of the answer (observed on about 1 upload in 10 of
 * 1 MiB + 1 against the reference run, more for larger bodies; reported to #1510), so a reset is retried. Whatever
 * answer is finally read is asserted by the caller, and a 2xx can never hide behind a retry.
 */
async function oversized(base: string, method: string, path: string, opts: ReqOpts): Promise<Res> {
  let last: unknown
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return await request(base, method, path, opts)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ECONNRESET' && code !== 'EPIPE') throw error
      last = error
    }
  }
  throw last
}

describe('API: body size limit', () => {
  it('a body of exactly 1 MiB is accepted; one byte more is 413, on both write routes, and nothing is stored', async () => {
    const s = await boot()
    const exact = documentOfSize(MIB)
    expect((await request(s.url, 'PUT', '/api/release', { body: exact })).status).toBe(200)
    expect((await get(s, '/api/release')).status).toBe(200)
    await rm(s.file)

    const over = documentOfSize(MIB + 1)
    for (const [method, path] of [['PUT', '/api/release'], ['POST', '/api/import']] as const) {
      const res = await oversized(s.url, method, path, { body: over })
      expect(res.status, `${method} ${path}`).toBe(413)
    }
    expect(await names(s.dataDir)).toEqual([])
    expect((await get(s, '/api/release')).status).toBe(404)
  })

  it('an oversized (otherwise valid) body does not replace the stored document and the server keeps working', async () => {
    const s = await boot()
    await put(s, FIXTURE)
    const before = await snapshot(s.dataDir)
    for (const size of [MIB + 1, 2 * MIB]) {
      const res = await oversized(s.url, 'PUT', '/api/release', { body: documentOfSize(size) })
      expect(res.status, `${size} bytes`).toBe(413)
    }
    expect(await snapshot(s.dataDir)).toEqual(before)
    expect((await get(s, '/api/release')).json).toEqual(FIXTURE)
    expect((await put(s, variant('after 413'))).status).toBe(200)
  })

  it('the limit also holds for a chunked body that declares no content-length', async () => {
    const s = await boot()
    await put(s, FIXTURE)
    const before = await snapshot(s.dataDir)
    const body = Buffer.from(documentOfSize(MIB + 1))
    const chunks: Buffer[] = []
    for (let at = 0; at < body.length; at += 64 * 1024) chunks.push(body.subarray(at, at + 64 * 1024))
    const res = await oversized(s.url, 'PUT', '/api/release', { chunks })
    expect(res.status).toBe(413)
    expect(await snapshot(s.dataDir)).toEqual(before)
  })

  it('a body just under the limit that is not a document is a 400, not a 413', async () => {
    const s = await boot()
    const res = await request(s.url, 'PUT', '/api/release', { body: 'x'.repeat(MIB - 1) })
    expect(res.status).toBe(400)
  })
})

describe('API: other paths are 404, a wrong method on a known path is 405 with an allow header', () => {
  const unknown = ['/', '/index.html', '/api', '/api/', '/api/releases', '/api/release/extra', '/api/import/x', '/api/export/x', '/etc/passwd', '/favicon.ico']
  it.each(unknown)('%s is 404 for every method and writes nothing', async (path) => {
    const s = await boot()
    await put(s, FIXTURE)
    const before = await snapshot(s.dataDir)
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await request(s.url, method, path, method === 'GET' ? {} : { body: JSON.stringify(variant('nope')) })
      expect(res.status, `${method} ${path}`).toBe(404)
    }
    expect(await snapshot(s.dataDir)).toEqual(before)
  })

  const allowed: Record<string, string[]> = {
    '/api/release': ['GET', 'PUT'],
    '/api/import': ['POST'],
    '/api/export': ['GET'],
  }
  const wrong = Object.entries(allowed).flatMap(([path, ok]) =>
    ['GET', 'PUT', 'POST', 'DELETE', 'PATCH'].filter((m) => !ok.includes(m)).map((method) => [method, path, ok] as const),
  )
  it.each(wrong)('%s %s is 405 and allow lists the supported methods; nothing is written', async (method, path, ok) => {
    const s = await boot()
    const res = await request(s.url, method, path, method === 'GET' ? {} : { body: JSON.stringify(FIXTURE) })
    expect(res.status).toBe(405)
    const header = res.headers.allow
    expect(header, 'allow header').toBeTypeOf('string')
    const listed = String(header).split(',').map((m) => m.trim().toUpperCase())
    for (const m of ok) expect(listed).toContain(m)
    expect(listed).not.toContain(method)
    expect(await names(s.dataDir)).toEqual([])
  })
})

describe('API security: writes need content-type application/json (415)', () => {
  const wrongTypes: Array<[string, string | null]> = [
    ['no content-type', null],
    ['text/plain', 'text/plain'],
    ['text/plain;charset=UTF-8', 'text/plain;charset=UTF-8'],
    ['application/x-www-form-urlencoded', 'application/x-www-form-urlencoded'],
    ['multipart/form-data', 'multipart/form-data; boundary=----x'],
    ['application/xml', 'application/xml'],
    ['application/jsonx (not a JSON type)', 'application/jsonx'],
  ]
  it.each(wrongTypes)('%s: PUT /api/release and POST /api/import are 415 with a valid document, and nothing is stored', async (_name, contentType) => {
    const s = await boot()
    await put(s, FIXTURE)
    const before = await snapshot(s.dataDir)
    const doc = JSON.stringify(variant('cross-site write'))
    for (const [method, path] of [['PUT', '/api/release'], ['POST', '/api/import']] as const) {
      const res = await request(s.url, method, path, { body: doc, contentType })
      expect(res.status, `${method} ${path}`).toBe(415)
    }
    expect(await snapshot(s.dataDir)).toEqual(before)
    expect((await get(s, '/api/release')).json).toEqual(FIXTURE)
  })

  it('a 415 on an empty directory creates no file', async () => {
    const s = await boot()
    expect((await request(s.url, 'PUT', '/api/release', { body: JSON.stringify(FIXTURE), contentType: 'text/plain' })).status).toBe(415)
    expect(await names(s.dataDir)).toEqual([])
  })

  it('reads do not need a content-type', async () => {
    const s = await boot()
    await put(s, FIXTURE)
    expect((await get(s, '/api/release', { contentType: null })).status).toBe(200)
    expect((await get(s, '/api/export', { contentType: null })).status).toBe(200)
  })

  it('a JSON content-type with an empty body is an invalid-json 400, not a 415', async () => {
    const s = await boot()
    const res = await request(s.url, 'PUT', '/api/release', { body: '', contentType: 'application/json' })
    expect(res.status).toBe(400)
    expect(res.json.errors.map((e: ValidationError) => e.code)).toContain('invalid-json')
  })
})

describe('API security: only a loopback Host is served (403)', () => {
  const badHosts = (port: number) => [
    'evil.example',
    'evil.example:80',
    `evil.example:${port}`,
    '127.0.0.1.evil.example',
    `127.0.0.1.evil.example:${port}`,
    'localhost.evil.example',
    `localhost.evil.example:${port}`,
    'evil-localhost',
    '127.0.0.2',
    `127.0.0.2:${port}`,
    `0.0.0.0:${port}`,
    `[::1]:${port}`,
    '192.168.1.10',
    `192.168.1.10:${port}`,
  ]

  it('every route is 403 for a foreign Host: reads leak nothing, writes store nothing', async () => {
    const s = await boot()
    await put(s, FIXTURE)
    const before = await snapshot(s.dataDir)
    const doc = JSON.stringify(variant('dns rebinding write'))
    for (const host of badHosts(s.port)) {
      const attempts: Array<[string, string, ReqOpts]> = [
        ['GET', '/api/release', { host }],
        ['GET', '/api/export', { host }],
        ['PUT', '/api/release', { host, body: doc }],
        ['POST', '/api/import', { host, body: doc }],
      ]
      for (const [method, path, opts] of attempts) {
        const res = await request(s.url, method, path, opts)
        expect(res.status, `${method} ${path} Host: ${host}`).toBe(403)
        expect(res.text, `${method} ${path} Host: ${host} leaked the document`).not.toContain('workstreams')
      }
    }
    expect(await snapshot(s.dataDir)).toEqual(before)
    expect((await get(s, '/api/release')).json).toEqual(FIXTURE)
  })

  it('a foreign Host is 403 even when the store is empty (no 404 that reveals anything)', async () => {
    const s = await boot()
    expect((await get(s, '/api/release', { host: 'evil.example' })).status).toBe(403)
    expect((await get(s, '/api/export', { host: 'evil.example' })).status).toBe(403)
  })

  const goodHosts = (port: number) => ['127.0.0.1', `127.0.0.1:${port}`, 'localhost', `localhost:${port}`, 'localhost:8080', '127.0.0.1:8080']
  it('127.0.0.1 and localhost, with or without a port, are served (GET and PUT)', async () => {
    const s = await boot()
    for (const host of goodHosts(s.port)) {
      const written = await request(s.url, 'PUT', '/api/release', { host, body: JSON.stringify(variant(`host ${host}`)) })
      expect(written.status, `PUT Host: ${host}`).toBe(200)
      const read = await get(s, '/api/release', { host })
      expect(read.status, `GET Host: ${host}`).toBe(200)
      expect(read.json.tasks[0].title).toBe(`host ${host}`)
    }
  })
})
