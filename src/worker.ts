// The plugin's worker: types a command into a terminal of the focused workspace and keeps a short
// history of the commands (never their output). Orca transpiles this file; no build step.
import type { OrcaWorkerApi } from 'orca/worker'
import {
  CommandError,
  forget,
  NEW_TERMINAL,
  normalizeHistory,
  pickTerminal,
  readCommand,
  remember,
  shellTerminals,
  terminalChoices,
  terminalTitle,
  type TerminalChoice
} from './commands'
import type { RunState } from './protocol'

const HISTORY = 'history'
const LAST_TERMINAL = 'terminal'

type Context = { branch: string; displayName: string; terminals: { id: string; title?: string }[] }

export default function activate(orca: OrcaWorkerApi): void {
  /** Orca 1.4.246 only types into an existing terminal; later hosts can open a new tab. */
  const canCreate = orca.host.has('terminal.create') && orca.host.has('workspace.list')

  async function history(): Promise<string[]> {
    return normalizeHistory(await orca.storage.get(HISTORY))
  }

  async function lastTerminal(): Promise<string | null> {
    const value = await orca.storage.get(LAST_TERMINAL)
    return typeof value === 'string' ? value : null
  }

  async function agentTerminalIds(): Promise<(string | null)[]> {
    try {
      return (await orca.host.call('agents.list', {})).agents.map((agent) => agent.terminalId)
    } catch {
      return []
    }
  }

  async function choicesFor(context: Context | null): Promise<TerminalChoice[]> {
    if (!context) return []
    return terminalChoices(shellTerminals(context.terminals, await agentTerminalIds()), canCreate)
  }

  async function state(): Promise<RunState> {
    const context = await orca.host.call('workspace.readContext', {})
    const terminals = await choicesFor(context)
    return {
      workspace: context ? context.displayName || context.branch : null,
      terminals,
      terminal: pickTerminal(terminals, await lastTerminal()),
      history: await history()
    }
  }

  /** The id `terminal.create` needs: the one listed workspace with the focused one's name and branch. */
  async function workspaceId(context: Context): Promise<string> {
    const host = orca.host as unknown as {
      call(method: 'workspace.list', params: object): Promise<{
        workspaces: { id: string; name: string; branch: string | null }[]
      }>
    }
    const { workspaces } = await host.call('workspace.list', {})
    const matches = workspaces.filter(
      (workspace) => workspace.name === context.displayName && workspace.branch === context.branch
    )
    if (matches.length !== 1) {
      throw new CommandError('Could not tell which workspace this is; pick an open terminal instead.')
    }
    return matches[0].id
  }

  async function openTerminal(context: Context, command: string): Promise<string> {
    const host = orca.host as unknown as {
      call(method: 'terminal.create', params: object): Promise<{ terminalId: string }>
    }
    const title = terminalTitle(command)
    await host.call('terminal.create', { workspaceId: await workspaceId(context), title, command })
    return title
  }

  async function exec(typed: string, chosen: string | null | undefined): Promise<string> {
    const command = readCommand(typed)
    const context = await orca.host.call('workspace.readContext', {})
    if (!context) throw new CommandError('Focus a workspace first.')
    const choices = await choicesFor(context)
    const target = pickTerminal(choices, chosen ?? (await lastTerminal()))
    if (target === null) {
      throw new CommandError('Open a terminal tab in this workspace first; it then shows up here.')
    }
    if (chosen && chosen !== target) {
      throw new CommandError('That terminal is gone or runs an agent; pick another.')
    }
    let ranIn: string
    if (target === NEW_TERMINAL) {
      ranIn = await openTerminal(context, command)
    } else {
      const { accepted } = await orca.host.call('terminal.sendText', {
        terminalId: target,
        text: command,
        enter: true
      })
      if (!accepted) throw new CommandError('That terminal did not take the command.')
      ranIn = choices.find((choice) => choice.id === target)?.label ?? 'Terminal'
    }
    await orca.storage.set(LAST_TERMINAL, target)
    await orca.storage.set(HISTORY, remember(await history(), command))
    return ranIn
  }

  orca.panels.handle('run.state', () => state())
  orca.panels.handle('run.exec', async ({ command, terminal }) => {
    const ranIn = await exec(command, terminal)
    return { ranIn, history: await history() }
  })
  orca.panels.handle('run.forget', async ({ command }) => {
    const next = forget(await history(), command)
    await orca.storage.set(HISTORY, next)
    return { history: next }
  })
  orca.panels.handle('run.clearHistory', async () => {
    await orca.storage.set(HISTORY, [])
    return { history: [] }
  })

  // Palette: run the last command again in the terminal used last, without opening the panel.
  orca.commands.register('run.again', async () => {
    const [last] = await history()
    if (!last) return 'No command to run again yet. Open the Run Command panel to run one.'
    try {
      return `Ran in ${await exec(last, null)}: ${last}`
    } catch (error) {
      return (error as Error).message
    }
  })
  orca.commands.register('run.history', async () => {
    const list = await history()
    return list.length === 0 ? 'No commands yet.' : list.join('\n')
  })
}
