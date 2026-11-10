import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

const context = {
  displayName: 'api',
  branch: 'main',
  terminals: [
    { id: 't1', title: 'Claude' },
    { id: 't2', title: 'zsh' }
  ]
}
const agents = {
  agents: [{ terminalId: 't1', title: 'Claude', agent: 'claude', state: 'working', stateStartedAt: 0 }]
}

function host(storage: Record<string, string | string[]> = {}) {
  return mockHost({
    results: {
      'workspace.readContext': context,
      'agents.list': agents,
      'terminal.sendText': { accepted: true }
    },
    storage
  })
}

test('types the command into the shell terminal and presses Enter', async () => {
  const orca = host()
  const worker = await mountWorker(main, { host: orca })
  const answer = await worker.request('run.exec', { command: '! git status', terminal: 't2' })
  assert.equal(answer.ranIn, 'zsh')
  assert.deepEqual(orca.callsOf('terminal.sendText'), [
    { terminalId: 't2', text: 'git status', enter: true }
  ])
  assert.deepEqual(answer.history, ['git status'])
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('stores the command and the terminal, never any output', async () => {
  const orca = host()
  const worker = await mountWorker(main, { host: orca })
  await worker.request('run.exec', { command: 'pwd', terminal: 't2' })
  assert.deepEqual(orca.data().storage, { history: ['pwd'], terminal: 't2' })
  await worker.deactivate()
})

test('refuses to type into an agent terminal', async () => {
  const orca = host()
  const worker = await mountWorker(main, { host: orca })
  await assert.rejects(worker.request('run.exec', { command: 'pwd', terminal: 't1' }))
  assert.equal(orca.callsOf('terminal.sendText').length, 0)
  await worker.deactivate()
})

test('state lists only shell terminals and the history', async () => {
  const worker = await mountWorker(main, { host: host({ history: ['ls'], terminal: 't2' }) })
  const state = await worker.request('run.state')
  assert.equal(state.workspace, 'api')
  assert.deepEqual(state.terminals, [{ id: 't2', label: 'zsh' }])
  assert.equal(state.terminal, 't2')
  assert.deepEqual(state.history, ['ls'])
  await worker.deactivate()
})

test('the palette command runs the last command again', async () => {
  const orca = host({ history: ['git status'], terminal: 't2' })
  const worker = await mountWorker(main, { host: orca })
  const said = await worker.command('run.again')
  assert.equal(said, 'Ran in zsh: git status')
  assert.equal(orca.callsOf('terminal.sendText').length, 1)
  await worker.deactivate()
})

test('runs a command that holds a secret but never stores it', async () => {
  const orca = host({ history: ['ls'] })
  const worker = await mountWorker(main, { host: orca })
  const answer = await worker.request('run.exec', { command: 'export API_TOKEN=abcdef123456', terminal: 't2' })
  assert.equal(orca.callsOf('terminal.sendText').length, 1)
  assert.equal(answer.kept, false)
  assert.deepEqual(answer.history, ['ls'])
  assert.ok(!JSON.stringify(orca.data()).includes('abcdef123456'))
  await worker.deactivate()
})

test('a leading space runs the command without keeping it', async () => {
  const orca = host()
  const worker = await mountWorker(main, { host: orca })
  const answer = await worker.request('run.exec', { command: ' git status', terminal: 't2' })
  assert.deepEqual(orca.callsOf('terminal.sendText'), [{ terminalId: 't2', text: 'git status', enter: true }])
  assert.equal(answer.kept, false)
  assert.deepEqual(answer.history, [])
  await worker.deactivate()
})

test('says why when the terminal refuses the command', async () => {
  const orca = mockHost({
    results: { 'workspace.readContext': context, 'agents.list': agents, 'terminal.sendText': { accepted: false } }
  })
  const worker = await mountWorker(main, { host: orca })
  await assert.rejects(worker.request('run.exec', { command: 'pwd', terminal: 't2' }), /did not take/)
  assert.deepEqual(orca.data().storage, {})
  await worker.deactivate()
})
