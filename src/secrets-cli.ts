// Runs an optional `secrets` command for the worker's Save a secret section. Node's child_process
// with an argument list, never a shell string, and the secret only ever goes to the child's stdin.
//
// Nothing here runs at load: `secretsBin` only looks for an executable file on PATH, and the
// command itself starts only when the person opens the section (status) or presses Save.
import { spawn } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'

/** An absolute path here wins over looking `secrets` up on PATH, for tests and unusual setups. */
export const OVERRIDE = 'ORCA_RUN_COMMAND_SECRETS_BIN'
const COMMAND = 'secrets'
const TIMEOUT_MS = 110_000

export type CliResult = { code: number; stdout: string; stderr: string }

function run(file: string, args: readonly string[], input: string | null, timeoutMs = TIMEOUT_MS): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
    if (input !== null) child.stdin.write(input)
    child.stdin.end()
  })
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Where `secrets` lives, or null when it is not installed. It reads PATH (Orca passes on the
 * login shell's PATH) and a few usual install folders; it never starts a shell to ask.
 */
export function secretsBin(env: Record<string, string | undefined> = process.env): string | null {
  const override = env[OVERRIDE]
  if (override) return isAbsolute(override) && isExecutable(override) ? override : null
  const home = env.HOME || homedir()
  const folders = [
    ...(env.PATH ?? '').split(delimiter),
    join(home, '.local', 'bin'),
    join(home, 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ].filter((folder) => isAbsolute(folder))
  for (const folder of new Set(folders)) {
    const candidate = join(folder, COMMAND)
    if (isExecutable(candidate)) return candidate
  }
  return null
}

function requireBin(): string {
  const bin = secretsBin()
  if (!bin) throw new Error('No `secrets` command found on PATH.')
  return bin
}

export async function secretsStatus(): Promise<string> {
  const result = await run(requireBin(), ['status'], null, 15_000)
  if (result.code !== 0) throw new Error('`secrets status` failed.')
  return result.stdout
}

/** `secrets save ... --stdin` with the value on stdin. */
export async function secretsSave(args: readonly string[], value: string): Promise<CliResult> {
  return run(requireBin(), args, `${value}\n`)
}
