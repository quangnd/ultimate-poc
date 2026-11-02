// Cold-connect probe for the Claude Code relay failure (FAILURES.md, root cause).
// Opens N fresh HTTPS connections to api.anthropic.com (agent: false, no reuse),
// like pi-claude-code's turn relay does once per turn, and prints one line per
// attempt plus a summary. Usage: node experiments/P4/net-probe.mjs [count=15]
// Run it under the flags to compare, e.g.
//   NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000 node experiments/P4/net-probe.mjs 20
import https from 'node:https'
import net from 'node:net'

const count = Number(process.argv[2] ?? 15)
const attemptTimeout = net.getDefaultAutoSelectFamilyAttemptTimeout()
console.log(
  `node ${process.version} autoSelectFamily=${net.getDefaultAutoSelectFamily()} attemptTimeout=${attemptTimeout}ms NODE_OPTIONS=${process.env.NODE_OPTIONS ?? '<unset>'}`,
)

function once() {
  return new Promise((resolve) => {
    const started = Date.now()
    const req = https.request(
      { hostname: 'api.anthropic.com', path: '/', method: 'HEAD', agent: false, timeout: 15000 },
      (res) => {
        res.resume()
        resolve({ ok: true, ms: Date.now() - started, detail: `HTTP ${res.statusCode}` })
      },
    )
    req.on('timeout', () => req.destroy(new Error('request timeout')))
    req.on('error', (error) => {
      const inner = error.errors?.map((e) => `${e.code} ${e.address ?? ''}`.trim()).join(', ')
      resolve({
        ok: false,
        ms: Date.now() - started,
        detail: `${error.name}: "${error.message}"${inner ? ` [${inner}]` : ''}`,
      })
    })
    req.end()
  })
}

let failed = 0
for (let i = 1; i <= count; i++) {
  const result = await once()
  if (!result.ok) failed++
  console.log(`${String(i).padStart(2)} ${result.ok ? 'ok  ' : 'FAIL'} ${result.ms}ms ${result.detail}`)
}
console.log(`summary: ${count - failed}/${count} ok, ${failed} failed (attemptTimeout=${attemptTimeout}ms)`)
