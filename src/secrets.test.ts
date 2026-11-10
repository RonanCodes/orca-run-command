import { assert, test } from 'orca/testing'
import { checkValue, parseGroups, resultLines, SecretFormError, saveArgs } from './secrets'

const isFormError = (error: unknown) => error instanceof SecretFormError

test('builds the save arguments with --stdin and never the value', () => {
  assert.deepEqual(saveArgs({ group: 'example', name: 'EXAMPLE_API_TOKEN' }), [
    'save', 'example', 'EXAMPLE_API_TOKEN', '--stdin',
    '--title', 'EXAMPLE_API_TOKEN', '--service', 'example'
  ])
  assert.deepEqual(
    saveArgs({
      group: 'example', name: 'X_TOKEN', title: 'Example · API token', service: 'example',
      expires: '2027-01-31', url: 'https://example.com/tokens'
    }).slice(4),
    ['--title', 'Example · API token', '--service', 'example', '--expires', '2027-01-31', '--url', 'https://example.com/tokens']
  )
})

test('refuses a bad name, group, expiry or URL', () => {
  assert.throws(() => saveArgs({ group: 'ok', name: 'lower_case' }), isFormError)
  assert.throws(() => saveArgs({ group: 'ok', name: 'X' }), isFormError)
  assert.throws(() => saveArgs({ group: 'Bad Group', name: 'GOOD_NAME' }), isFormError)
  assert.throws(() => saveArgs({ group: 'ok', name: 'GOOD_NAME', expires: '31/01/2027' }), isFormError)
  assert.throws(() => saveArgs({ group: 'ok', name: 'GOOD_NAME', url: 'ftp://x' }), isFormError)
})

test('takes any one-line value and trims it', () => {
  assert.equal(checkValue('  abcdefghij0123456789_-.  '), 'abcdefghij0123456789_-.')
  assert.equal(checkValue('short pass phrase'), 'short pass phrase')
  assert.throws(() => checkValue('   '), isFormError)
  assert.throws(() => checkValue('two\nlines'), isFormError)
  assert.throws(() => checkValue('x'.repeat(5000)), isFormError)
})

test('reads group names from secrets status, never values', () => {
  const status = [
    'github  (78.8 h old)  /home/.local/share/secrets/github.env',
    '   ✓ GITHUB_TOKEN',
    'test-data  (not synced)  /home/.local/share/secrets/test-data.env',
    '   ✗ TEST_PHONE'
  ].join('\n')
  assert.deepEqual(parseGroups(status), ['github', 'test-data'])
})

test('keeps the last few output lines', () => {
  assert.deepEqual(resultLines('a\n\nb\n'), ['a', 'b'])
})

test('masks the value if the command ever prints it back', () => {
  assert.deepEqual(resultLines('refused tok_ABCdef0123456789xyz: bad\nok', 'tok_ABCdef0123456789xyz'), [
    'refused ••••••: bad',
    'ok'
  ])
})
