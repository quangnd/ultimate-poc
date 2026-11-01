/** JSON file store with atomic writes (ADR-001 §3): one document in `<dir>/release.json`, validated on save and on load. */
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReleaseDocument } from '../domain/types'
import { validateDocument, type ValidationError } from '../domain/validate'

export type InvalidJson = { code: 'invalid-json'; message: string }

export type LoadResult =
  | { ok: true; document: ReleaseDocument }
  | { ok: false; missing: true }
  | { ok: false; missing?: false; errors: ValidationError[] | InvalidJson[] }

export type SaveResult = { ok: true } | { ok: false; errors: ValidationError[] }

export interface Store {
  file: string
  /** Reads and validates the stored document; a missing, corrupt or invalid file is reported, never repaired. */
  load(): Promise<LoadResult>
  /** Like `load`, but returns the file's exact bytes once they validate. */
  exportText(): Promise<{ ok: true; text: string } | Exclude<LoadResult, { ok: true }>>
  /** Validates, then replaces the stored document atomically; an invalid document leaves the file untouched. */
  save(doc: unknown): Promise<SaveResult>
}

/** Single writer: saves run one after another in call order, so the tmp file is never shared between two writes. */
export function createStore(dir: string): Store {
  const file = join(dir, 'release.json')
  const tmp = `${file}.tmp`
  let queue: Promise<unknown> = Promise.resolve()

  async function write(text: string): Promise<void> {
    await mkdir(dir, { recursive: true })
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(text)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, file)
    // Makes the rename itself durable (macOS/Linux open and fsync directories). A failure is a failed save, never
    // a silent success (reviewer #4342).
    const dirHandle = await open(dir, 'r')
    try {
      await dirHandle.sync()
    } finally {
      await dirHandle.close()
    }
  }

  /** The stored file's text with its validation result; `text` is the exact bytes export serves (QA #3972). */
  async function read(): Promise<{ ok: true; document: ReleaseDocument; text: string } | Exclude<LoadResult, { ok: true }>> {
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ok: false, missing: true }
      throw error
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      return { ok: false, errors: [{ code: 'invalid-json', message: (error as Error).message }] }
    }
    const result = validateDocument(parsed)
    return result.ok ? { ...result, text } : result
  }

  return {
    file,

    async load() {
      const result = await read()
      return result.ok ? { ok: true, document: result.document } : result
    },

    async exportText() {
      const result = await read()
      return result.ok ? { ok: true, text: result.text } : result
    },

    async save(doc) {
      const result = validateDocument(doc)
      if (!result.ok) return result
      // Serialized now, so a caller mutating `doc` while the save waits in the queue cannot change what was validated.
      const text = JSON.stringify(doc, null, 2) + '\n'
      const run = queue.then(() => write(text))
      queue = run.catch(() => {}) // a failed write must not block the saves behind it
      await run
      return { ok: true }
    },
  }
}
