import { assert, test } from 'orca/testing'
import {
  CommandError,
  holdsSecret,
  MAX_HISTORY,
  normalizeHistory,
  pickTerminal,
  readCommand,
  remember,
  shellTerminals,
  skipsHistory,
  terminalChoices
} from './commands'

test('reads a command, with or without a leading !', () => {
  assert.equal(readCommand('secrets status'), 'secrets status')
  assert.equal(readCommand('  ! secrets status '), 'secrets status')
  assert.equal(readCommand('!pwd'), 'pwd')
})

test('refuses an empty or multi-line command', () => {
  for (const typed of ['', '   ', '!', 'echo a\necho b']) {
    assert.throws(() => readCommand(typed), (error) => error instanceof CommandError)
  }
})

test('keeps the newest commands first, without duplicates', () => {
  let history: string[] = []
  history = remember(history, 'a')
  history = remember(history, 'b')
  history = remember(history, 'a')
  assert.deepEqual(history, ['a', 'b'])
  for (let i = 0; i < 20; i++) history = remember(history, `c${i}`)
  assert.equal(history.length, MAX_HISTORY)
  assert.equal(history[0], 'c19')
})

test('cleans whatever storage held', () => {
  assert.deepEqual(normalizeHistory(null), [])
  assert.deepEqual(normalizeHistory(['a', 3, '', 'a', 'b']), ['a', 'b'])
  assert.deepEqual(normalizeHistory(['ls', 'export API_TOKEN=abc123']), ['ls'])
})

test('never offers a terminal that runs an agent', () => {
  const shells = shellTerminals(
    [{ id: 't1', title: 'Claude' }, { id: 't2', title: 'zsh' }, { id: 't3' }],
    ['t1', null]
  )
  assert.deepEqual(
    shells.map((terminal) => terminal.id),
    ['t2', 't3']
  )
  assert.deepEqual(terminalChoices(shells), [
    { id: 't2', label: 'zsh' },
    { id: 't3', label: 'Terminal' }
  ])
})

test('picks the remembered terminal while it is still there', () => {
  const choices = [
    { id: 't2', label: 'zsh' },
    { id: 't3', label: 'Terminal' }
  ]
  assert.equal(pickTerminal(choices, 't3'), 't3')
  assert.equal(pickTerminal(choices, 'gone'), 't2')
  assert.equal(pickTerminal([], 't3'), null)
})

test('keeps an ordinary command in the history', () => {
  for (const command of ['git status', 'pnpm test', 'ls -la', 'echo $HOME', 'export EDITOR=vim']) {
    assert.equal(holdsSecret(command), false, command)
  }
})

test('never keeps a command that looks like it holds a secret', () => {
  for (const command of [
    'export GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'API_KEY=abc123 ./deploy.sh',
    'export DB_PASSWORD="hunter2"',
    'curl -H "Authorization: Bearer abc.def.ghi" https://example.com',
    'mysql -u root --password=hunter2',
    'git clone https://user:s3cret@example.com/repo.git',
    'echo sk-proj-abcdefghijklmnopqrstuvwxyz012345',
    'aws configure set aws_secret_access_key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    'echo xoxb-1234567890-abcdefghij'
  ]) {
    assert.equal(holdsSecret(command), true, command)
  }
})

test('a command typed with a leading space stays out of the history, as in a shell', () => {
  assert.equal(skipsHistory(' git status'), true)
  assert.equal(skipsHistory(' ! git status'), true)
  assert.equal(skipsHistory('git status'), false)
  assert.equal(skipsHistory('! git status'), false)
})
