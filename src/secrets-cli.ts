// Runs the `secrets` command for the worker. Node's child_process with an argument list, never a
// shell string, and the secret only ever goes to the child's stdin.
import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'

/** An absolute path here wins over looking `secrets` up, for tests and unusual setups. */
const OVERRIDE = 'ORCA_RUN_COMMAND_SECRETS_BIN'
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

let resolved: string | null = null

/**
 * Where `secrets` lives. Orca is a GUI app, so its PATH is not the terminal's: ask the person's
 * own shell, the way their terminal finds it. Only the command's path comes back.
 */
async function secretsBin(): Promise<string> {
  const override = process.env[OVERRIDE]
  if (override && isAbsolute(override)) return override
  if (resolved) return resolved
  const shell = process.env.SHELL && isAbsolute(process.env.SHELL) ? process.env.SHELL : '/bin/zsh'
  const found = await run(shell, ['-ilc', 'command -v secrets'], null, 15_000)
  const path = found.stdout.split('\n').map((line) => line.trim()).filter((line) => isAbsolute(line)).pop()
  if (!path) throw new Error('Could not find the `secrets` command in your shell.')
  resolved = path
  return path
}

export async function secretsStatus(): Promise<string> {
  const result = await run(await secretsBin(), ['status'], null, 15_000)
  if (result.code !== 0) throw new Error('`secrets status` failed.')
  return result.stdout
}

/** `secrets save ... --stdin` with the value on stdin. */
export async function secretsSave(args: readonly string[], value: string): Promise<CliResult> {
  return run(await secretsBin(), args, `${value}\n`)
}
