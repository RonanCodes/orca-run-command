// Pure logic shared by the worker and the panel: reading a typed command, the history, and which
// terminal a command goes to. No Orca calls here, so it is tested directly.

/** How many recent commands the history keeps. Commands only: output is never stored. */
export const MAX_HISTORY = 10
export const MAX_COMMAND = 2000

export type Terminal = { id: string; title?: string }
export type TerminalChoice = { id: string; label: string }

export class CommandError extends Error {
  readonly code = 'invalid_params'
}

/**
 * The command to run, from what was typed. A leading `!` is dropped, so `! secrets status` works
 * as it does in Claude Code's terminal. One line only: a pasted newline would run extra commands.
 */
export function readCommand(typed: string): string {
  let command = typed.trim()
  if (command.startsWith('!')) command = command.slice(1).trim()
  if (command === '') throw new CommandError('Type a command to run.')
  if (/[\r\n]/.test(command)) throw new CommandError('Run one line at a time.')
  if (command.length > MAX_COMMAND) {
    throw new CommandError(`Keep the command under ${MAX_COMMAND} characters.`)
  }
  return command
}

/**
 * True when the typed text starts with a space: like a shell with `HISTCONTROL=ignorespace`, the
 * command runs but stays out of the recent list.
 */
export function skipsHistory(typed: string): boolean {
  return /^[ \t]/.test(typed)
}

// Shapes that mean a command carries a credential. Matching any of them keeps the command out of
// storage; it still runs, because the person typed it and pressed Enter.
const SECRET_SHAPES: readonly RegExp[] = [
  // NAME=value where the name says what it is: GITHUB_TOKEN=..., DB_PASSWORD=..., API_KEY=...
  /\b[A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIALS?)[A-Za-z0-9_]*=\S/i,
  // --password=..., --token ..., -p'...' style flags with a value
  /--(?:password|passwd|token|secret|api-key|access-key)(?:=|\s+)\S/i,
  // Authorization headers
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/i,
  // user:password@ in a URL
  /:\/\/[^\s/:@]+:[^\s/@]+@/,
  // Well-known token prefixes
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abposr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.)/,
  // aws ... secret_access_key <value>
  /secret_access_key\s+\S{16,}/i
]

/** True when the command looks like it holds a credential, so it is never written to storage. */
export function holdsSecret(command: string): boolean {
  return SECRET_SHAPES.some((shape) => shape.test(command))
}

/** The history with `command` first, without duplicates, at most MAX_HISTORY long. */
export function remember(history: readonly string[], command: string): string[] {
  return [command, ...history.filter((entry) => entry !== command)].slice(0, MAX_HISTORY)
}

export function forget(history: readonly string[], command: string): string[] {
  return history.filter((entry) => entry !== command)
}

/** Whatever storage held, as a clean history list. */
export function normalizeHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  // An older version may have kept a command with a credential in it: drop it on the way out.
  const commands = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry !== '' && !holdsSecret(entry)
  )
  return [...new Set(commands)].slice(0, MAX_HISTORY)
}

/** The workspace's terminals that run a shell, not an agent: typing into an agent sends a prompt. */
export function shellTerminals(
  terminals: readonly Terminal[],
  agentTerminalIds: readonly (string | null)[]
): Terminal[] {
  const agents = new Set(agentTerminalIds.filter((id): id is string => id !== null))
  return terminals.filter((terminal) => !agents.has(terminal.id))
}

export function terminalChoices(shells: readonly Terminal[]): TerminalChoice[] {
  return shells.map((terminal) => ({ id: terminal.id, label: terminal.title?.trim() || 'Terminal' }))
}

/** The chosen terminal if it is still offered, else the first one offered, else null. */
export function pickTerminal(choices: readonly TerminalChoice[], preferred: string | null): string | null {
  if (preferred && choices.some((choice) => choice.id === preferred)) return preferred
  return choices[0]?.id ?? null
}
