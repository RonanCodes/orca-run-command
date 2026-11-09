// Pure logic shared by the worker and the panel: reading a typed command, the history, and which
// terminal a command goes to. No Orca calls here, so it is tested directly.

/** How many recent commands the history keeps. Commands only: output is never stored. */
export const MAX_HISTORY = 10
export const MAX_COMMAND = 2000
/** The panel's terminal choice that opens a fresh terminal tab, where Orca can (host API 1.3+). */
export const NEW_TERMINAL = 'new'

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
  const commands = value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
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

export function terminalChoices(shells: readonly Terminal[], canCreate: boolean): TerminalChoice[] {
  const choices = shells.map((terminal) => ({
    id: terminal.id,
    label: terminal.title?.trim() || 'Terminal'
  }))
  return canCreate ? [{ id: NEW_TERMINAL, label: 'New terminal tab' }, ...choices] : choices
}

/** The chosen terminal if it is still offered, else the first one offered, else null. */
export function pickTerminal(choices: readonly TerminalChoice[], preferred: string | null): string | null {
  if (preferred && choices.some((choice) => choice.id === preferred)) return preferred
  return choices[0]?.id ?? null
}

/** A short tab title naming the command, for a new terminal tab. */
export function terminalTitle(command: string): string {
  const title = `! ${command}`
  return title.length > 40 ? `${title.slice(0, 39)}…` : title
}
