// The plugin's worker: types a command into a terminal of the focused workspace and keeps a short
// history of the commands (never their output). Orca transpiles this file; no build step.
import type { OrcaWorkerApi } from 'orca/worker'
import {
  CommandError,
  forget,
  normalizeHistory,
  pickTerminal,
  readCommand,
  remember,
  shellTerminals,
  terminalChoices,
  type TerminalChoice
} from './commands'
import type { RunState } from './protocol'
import { checkValue, parseGroups, resultLines, saveArgs } from './secrets'
import { secretsSave, secretsStatus } from './secrets-cli'

const HISTORY = 'history'
const LAST_TERMINAL = 'terminal'

type Context = { branch: string; displayName: string; terminals: { id: string; title?: string }[] }

export default function activate(orca: OrcaWorkerApi): void {
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
    return terminalChoices(shellTerminals(context.terminals, await agentTerminalIds()))
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
    const { accepted } = await orca.host.call('terminal.sendText', {
      terminalId: target,
      text: command,
      enter: true
    })
    if (!accepted) throw new CommandError('That terminal did not take the command.')
    const ranIn = choices.find((choice) => choice.id === target)?.label ?? 'Terminal'
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

  // Save a secret: the value arrives here, goes to the child's stdin, and is never stored or logged.
  orca.panels.handle('secrets.groups', async () => ({ groups: parseGroups(await secretsStatus()) }))
  orca.panels.handle('secrets.save', async ({ value, ...form }) => {
    const args = saveArgs(form)
    const result = await secretsSave(args, checkValue(value))
    const lines = resultLines(result.code === 0 ? result.stdout : `${result.stdout}\n${result.stderr}`)
    orca.log(`secrets save ${form.name} in ${form.group}: exit ${result.code}`)
    return { ok: result.code === 0, lines }
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
