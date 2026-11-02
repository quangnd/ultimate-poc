// Shows that fork() passes the parent's Node flags (execArgv) to the child, as the Ultimate
// supervisor does for the host core (bin/ultimate.ts fork). No network, no writes.
//   node --network-family-autoselection-attempt-timeout=2000 experiments/P4/fork-inherit.mjs  -> child ... 2000
//   node experiments/P4/fork-inherit.mjs                                                       -> child ... 500
import { fork } from 'node:child_process'
import net from 'node:net'

if (process.argv[2] === 'child') {
  console.log(
    `child execArgv=[${process.execArgv.join(' ')}] attemptTimeout=${net.getDefaultAutoSelectFamilyAttemptTimeout()} NODE_OPTIONS=${process.env.NODE_OPTIONS ?? '<unset>'}`,
  )
} else {
  fork(import.meta.filename, ['child'])
}
