// The panel <-> worker contract, declared once: src/panel.tsx and src/worker.ts both read it.
import type { TerminalChoice } from './commands'

export type { TerminalChoice }

export type RunState = {
  /** The focused workspace's name, or null when none is focused. */
  workspace: string | null
  /** Where a command can go: the workspace's terminals that run a shell, not an agent. */
  terminals: TerminalChoice[]
  /** The terminal used last, when it is still there. */
  terminal: string | null
  /** Recent commands, newest first. Never their output. */
  history: string[]
}

declare module 'orca' {
  interface PluginRequests {
    'run.state': { output: RunState }
    /** Runs one command in the chosen terminal (or the last one used) and answers where it ran. */
    'run.exec': {
      input: { command: string; terminal?: string | null }
      /** `kept` is false when the command stayed out of the history (a leading space, or it
       *  looked like it held a secret). */
      output: { ranIn: string; history: string[]; kept: boolean }
    }
    'run.forget': { input: { command: string }; output: { history: string[] } }
    'run.clearHistory': { output: { history: string[] } }
    /** Whether an optional `secrets` command is on PATH; the Save a secret section shows only then. */
    'secrets.available': { output: { available: boolean } }
    /** The groups `secrets status` lists (names only). */
    'secrets.groups': { output: { groups: string[] } }
    /** Saves one secret with `secrets save ... --stdin`; the value goes to its stdin only. */
    'secrets.save': {
      input: {
        group: string
        name: string
        value: string
        title?: string
        service?: string
        expires?: string
        url?: string
      }
      output: { ok: boolean; lines: string[] }
    }
  }
}
