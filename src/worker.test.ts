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
  const answer = await worker.request('run.exec', { command: '! secrets status', terminal: 't2' })
  assert.equal(answer.ranIn, 'zsh')
  assert.deepEqual(orca.callsOf('terminal.sendText'), [
    { terminalId: 't2', text: 'secrets status', enter: true }
  ])
  assert.deepEqual(answer.history, ['secrets status'])
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
  const orca = host({ history: ['secrets status'], terminal: 't2' })
  const worker = await mountWorker(main, { host: orca })
  const said = await worker.command('run.again')
  assert.equal(said, 'Ran in zsh: secrets status')
  assert.equal(orca.callsOf('terminal.sendText').length, 1)
  await worker.deactivate()
})
