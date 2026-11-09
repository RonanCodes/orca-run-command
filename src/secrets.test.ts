import { assert, test } from 'orca/testing'
import { checkValue, parseGroups, resultLines, SecretFormError, saveArgs } from './secrets'

const isFormError = (error: unknown) => error instanceof SecretFormError

test('builds the save arguments with --stdin and never the value', () => {
  assert.deepEqual(saveArgs({ group: 'supabase', name: 'SUPABASE_FOO_TOKEN' }), [
    'save', 'supabase', 'SUPABASE_FOO_TOKEN', '--stdin',
    '--title', 'SUPABASE_FOO_TOKEN', '--service', 'supabase'
  ])
  assert.deepEqual(
    saveArgs({
      group: 'supabase', name: 'X_TOKEN', title: 'Supabase · API token', service: 'supabase',
      expires: '2027-01-31', url: 'https://example.com/tokens'
    }).slice(4),
    ['--title', 'Supabase · API token', '--service', 'supabase', '--expires', '2027-01-31', '--url', 'https://example.com/tokens']
  )
})

test('refuses a bad name, group, expiry or URL', () => {
  assert.throws(() => saveArgs({ group: 'ok', name: 'lower_case' }), isFormError)
  assert.throws(() => saveArgs({ group: 'ok', name: 'X' }), isFormError)
  assert.throws(() => saveArgs({ group: 'Bad Group', name: 'GOOD_NAME' }), isFormError)
  assert.throws(() => saveArgs({ group: 'ok', name: 'GOOD_NAME', expires: '31/01/2027' }), isFormError)
  assert.throws(() => saveArgs({ group: 'ok', name: 'GOOD_NAME', url: 'ftp://x' }), isFormError)
})

test('checks the value the way secrets save does', () => {
  assert.equal(checkValue('  abcdefghij0123456789_-.  '), 'abcdefghij0123456789_-.')
  assert.throws(() => checkValue('short'), isFormError)
  assert.throws(() => checkValue('has spaces in it and is long'), isFormError)
})

test('reads group names from secrets status, never values', () => {
  const status = [
    'sentry  (78.8 h old)  /home/.local/share/secrets/sentry.env',
    '   ✓ SENTRY_API_KEY',
    'test-data  (not synced)  /home/.local/share/secrets/test-data.env',
    '   ✗ TEST_PHONE'
  ].join('\n')
  assert.deepEqual(parseGroups(status), ['sentry', 'test-data'])
})

test('keeps the last few output lines', () => {
  assert.deepEqual(resultLines('a\n\nb\n'), ['a', 'b'])
})
