// Finding the optional `secrets` command: PATH only, never a shell.
import { assert, test } from 'orca/testing'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { OVERRIDE, secretsBin } from './secrets-cli'

const root = mkdtempSync(join(tmpdir(), 'run-command-bin-'))
const withBin = join(root, 'with')
const without = join(root, 'without')
mkdirSync(withBin)
mkdirSync(without)
const bin = join(withBin, 'secrets')
writeFileSync(bin, '#!/bin/sh\nexit 0\n')
chmodSync(bin, 0o755)
const plain = join(without, 'secrets')
writeFileSync(plain, 'not executable')

test('finds an executable secrets on PATH', () => {
  assert.equal(secretsBin({ PATH: `${without}:${withBin}`, HOME: root }), bin)
})

test('is null when no secrets command is installed', () => {
  assert.equal(secretsBin({ PATH: without, HOME: root }), null)
})

test('an override must be an absolute path to an executable', () => {
  assert.equal(secretsBin({ [OVERRIDE]: bin, PATH: without, HOME: root }), bin)
  assert.equal(secretsBin({ [OVERRIDE]: plain, PATH: withBin, HOME: root }), null)
  assert.equal(secretsBin({ [OVERRIDE]: 'secrets', PATH: withBin, HOME: root }), null)
})
