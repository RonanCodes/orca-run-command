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
        return { ranIn: 'zsh', history: ['pnpm test', 'git status'], kept: true }
      }
    }
  })
  const view = await mount(panel, { host })
  await view.type({ label: 'Command' }, 'pnpm test')
  assert.equal(runs.length, 0)
  await view.submit({ label: 'Command' })
  assert.deepEqual(runs, [{ command: 'pnpm test', terminal: 't2' }])
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
        return { ranIn: 'zsh', history: [], kept: true }
      }
    }
  })
  const view = await mount(panel, { host })
  await view.press({ text: 'git status' })
  assert.equal(view.valueOf({ label: 'Command' }), 'git status')
  assert.equal(ran, false)
  await view.unmount()
})

test('Save a secret sends the value once and clears the field', async () => {
  const saves: { value: string; name: string; group: string }[] = []
  const host = mockHost({
    requests: {
      'run.state': () => state,
      'secrets.available': () => ({ available: true }),
      'secrets.groups': () => ({ groups: ['github', 'plugin-e2e'] }),
      'secrets.save': (input) => {
        saves.push(input)
        return { ok: true, lines: ["saved 'Test' as vault/abc"] }
      }
    }
  })
  const view = await mount(panel, { host })
  await view.toggle({ label: 'Save a secret' })
  await view.select({ label: 'Group' }, 'plugin-e2e')
  await view.type({ label: 'Name' }, 'PLUGIN_E2E_DUMMY_TOKEN')
  await view.type({ label: 'Secret' }, 'tok_ABCdef0123456789xyz')
  await view.press({ text: 'Save' })
  assert.equal(saves.length, 1)
  assert.equal(saves[0].value, 'tok_ABCdef0123456789xyz')
  assert.equal(saves[0].group, 'plugin-e2e')
  assert.equal(view.valueOf({ label: 'Secret' }), '')
  assert.equal(view.valueOf({ label: 'Name' }), '')
  assert.ok(!JSON.stringify(view.persisted).includes('tok_ABCdef0123456789xyz'))
  assert.deepEqual(view.errors, [])
  await view.unmount()
})

test('a failed Clear shows the error instead of losing it', async () => {
  const host = mockHost({
    requests: {
      'run.state': () => state,
      'run.clearHistory': () => {
        throw new Error('Storage is not available.')
      }
    }
  })
  const view = await mount(panel, { host })
  await view.press({ text: 'Clear' })
  assert.ok(view.summary().some((line) => line.includes('Storage is not available.')))
  await view.unmount()
})

test('pressing Enter twice while a run is in flight sends it once', async () => {
  const runs: unknown[] = []
  const host = mockHost({
    requests: {
      'run.state': () => state,
      'run.exec': (input) => {
        runs.push(input)
        return new Promise((resolve) => setTimeout(() => resolve({ ranIn: 'zsh', history: ['pwd'], kept: true }), 20))
      }
    }
  })
  const view = await mount(panel, { host })
  await view.type({ label: 'Command' }, 'pwd')
  await Promise.all([view.submit({ label: 'Command' }), view.submit({ label: 'Command' })])
  assert.equal(runs.length, 1)
  await view.unmount()
})

test('says so when a command was run but kept out of the history', async () => {
  const host = mockHost({
    requests: {
      'run.state': () => state,
      'run.exec': () => ({ ranIn: 'zsh', history: ['git status'], kept: false })
    }
  })
  const view = await mount(panel, { host })
  await view.type({ label: 'Command' }, 'export API_TOKEN=abc', { submit: true })
  assert.ok(JSON.stringify(view.tree()).includes('not kept in Recent'))
  await view.unmount()
})

test('hides Save a secret when no secrets command is installed', async () => {
  const host = mockHost({
    requests: { 'run.state': () => state, 'secrets.available': () => ({ available: false }) }
  })
  const view = await mount(panel, { host })
  assert.equal(view.find({ label: 'Save a secret' }), null)
  await view.unmount()
})
