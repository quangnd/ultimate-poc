/** Starts the loopback server (ADR-001 §4): `npm run server`, `PORT` (default 5174) and `DATA_DIR` (default `data`). */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHandler } from './api'
import { createStore } from './store'

export interface RunningServer {
  server: Server
  url: string
  close(): Promise<void>
}

/** Listens on 127.0.0.1 only, never on every interface; port 0 picks a free port (tests). */
export async function startServer({ port, dataDir }: { port: number; dataDir: string }): Promise<RunningServer> {
  const server = createServer(createHandler(createStore(dataDir)))
  await new Promise<void>((resolveListening, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolveListening()
    })
  })
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const close = () =>
    new Promise<void>((resolveClosed, reject) => {
      server.close((error) => (error ? reject(error) : resolveClosed()))
      server.closeIdleConnections()
    })
  return { server, url, close }
}

// Only when run as the entry point (`tsx src/server/main.ts`), not when a test imports startServer.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.DATA_DIR ?? 'data'
  const { url } = await startServer({ port: Number(process.env.PORT ?? 5174), dataDir })
  console.log(`Release Readiness Lab API listening on ${url} (data: ${resolve(dataDir)})`)
}
