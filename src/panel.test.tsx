// `orca plugin test .` runs this in Node with the same runtime and checks Orca uses.
import { assert, mockHost, mount, test } from 'orca/testing'
import * as panel from './panel'

const state = {
  workspace: 'api',
  terminals: [{ id: 't2', label: 'zsh' }],
  terminal: 't2',
  history: ['git status']
}

test('Enter runs the typed command in the chosen terminal', async () => {
  const runs: unknown[] = []
  const host = mockHost({
    requests: {
      'run.state': () => state,
      'run.exec': (input) => {
        runs.push(input)
        return { ranIn: 'zsh', history: ['secrets status', 'git status'] }
      }
    }
  })
  const view = await mount(panel, { host })
  await view.type({ label: 'Command' }, 'secrets status')
  assert.equal(runs.length, 0)
  await view.submit({ label: 'Command' })
  assert.deepEqual(runs, [{ command: 'secrets status', terminal: 't2' }])
  assert.ok(view.summary().some((line) => line.includes('Ran in zsh')))
  assert.equal(view.valueOf({ label: 'Command' }), '')
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
  await view.unmount()
})

test('picking a recent command fills the field without running it', async () => {
  let ran = false
  const host = mockHost({
    requests: {
      'run.state': () => state,
      'run.exec': () => {
        ran = true
        return { ranIn: 'zsh', history: [] }
      }
    }
  })
  const view = await mount(panel, { host })
  await view.press({ text: 'git status' })
  assert.equal(view.valueOf({ label: 'Command' }), 'git status')
  assert.equal(ran, false)
  await view.unmount()
})
