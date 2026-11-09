// `orca plugin check` renders the panel once per scenario, each with the worker on a fresh host.
import { defineCheck } from 'orca/testing'

const context = {
  displayName: 'api',
  branch: 'main',
  terminals: [
    { id: 't1', title: 'Claude: review PR' },
    { id: 't2', title: 'zsh' }
  ]
}
const agents = {
  agents: [{ terminalId: 't1', title: 'Claude: review PR', agent: 'claude', state: 'working', stateStartedAt: 0 }]
}

export default defineCheck({
  noWorkspace: { results: { 'workspace.readContext': null } },
  noTerminal: {
    results: { 'workspace.readContext': { ...context, terminals: [context.terminals[0]] }, 'agents.list': agents }
  },
  withHistory: {
    results: { 'workspace.readContext': context, 'agents.list': agents },
    storage: { history: ['secrets status', 'git status', 'pnpm test'], terminal: 't2' }
  }
})
