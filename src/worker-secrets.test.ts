// The worker's Save a secret path against a fake `secrets` command that records what it got.
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as main from './worker'

const dir = mkdtempSync(join(tmpdir(), 'run-command-secrets-'))
const fake = join(dir, 'secrets')
writeFileSync(
  fake,
  [
    '#!/bin/sh',
    `printf '%s\\n' "$@" > "${dir}/argv"`,
    'if [ "$1" = "status" ]; then',
    "  printf 'sentry  (1.0 h old)  /x/sentry.env\\n   ✓ SENTRY_API_KEY\\nplugin-e2e  (0.1 h old)  /x/p.env\\n'",
    '  exit 0',
    'fi',
    `cat > "${dir}/stdin"`,
    "echo \"saved 'Fake' as Claude-managed/fakeid\"",
    'echo "sync ok: 2 values"'
  ].join('\n')
)
chmodSync(fake, 0o755)
process.env.ORCA_RUN_COMMAND_SECRETS_BIN = fake

const VALUE = 'tok_ABCdef0123456789xyz'

test('lists the groups from secrets status', async () => {
  const worker = await mountWorker(main, { host: mockHost() })
  assert.deepEqual(await worker.request('secrets.groups'), { groups: ['sentry', 'plugin-e2e'] })
  await worker.deactivate()
})

test('saves through stdin; the value is never in argv, storage, logs or the answer', async () => {
  const host = mockHost()
  const worker = await mountWorker(main, { host })
  const answer = await worker.request('secrets.save', {
    group: 'plugin-e2e',
    name: 'PLUGIN_E2E_DUMMY_TOKEN',
    value: VALUE,
    title: 'Test · API token'
  })
  assert.equal(answer.ok, true)
  assert.deepEqual(answer.lines, ["saved 'Fake' as Claude-managed/fakeid", 'sync ok: 2 values'])
  const argv = readFileSync(join(dir, 'argv'), 'utf8')
  assert.equal(
    argv,
    ['save', 'plugin-e2e', 'PLUGIN_E2E_DUMMY_TOKEN', '--stdin', '--title', 'Test · API token', '--service', 'plugin-e2e', ''].join('\n')
  )
  assert.equal(readFileSync(join(dir, 'stdin'), 'utf8').trim(), VALUE)
  assert.ok(!JSON.stringify(answer).includes(VALUE))
  assert.ok(!JSON.stringify(host.data()).includes(VALUE))
  assert.ok(!worker.logs.join('\n').includes(VALUE))
  await worker.deactivate()
})

test('refuses a bad name before running anything', async () => {
  writeFileSync(join(dir, 'argv'), '')
  const worker = await mountWorker(main, { host: mockHost() })
  await assert.rejects(worker.request('secrets.save', { group: 'plugin-e2e', name: 'bad', value: VALUE }))
  assert.equal(readFileSync(join(dir, 'argv'), 'utf8'), '')
  await worker.deactivate()
})
