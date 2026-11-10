// `orca plugin check` renders the panel once per scenario, each with the worker on a fresh host.
import { defineCheck } from 'orca/testing'

const context = {
  displayName: 'acme-web',
  branch: 'main',
  terminals: [
    { id: 't1', title: 'Claude: review PR' },
    { id: 't2', title: 'zsh' },
    { id: 't3', title: 'dev server' }
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
    storage: { history: ['git status', 'pnpm test', 'docker compose up -d'], terminal: 't2' }
  },
  // Run with ORCA_RUN_COMMAND_SECRETS_BIN set to an executable to show Save a secret.
  withSecrets: {
    results: { 'workspace.readContext': context, 'agents.list': agents },
    storage: { history: ['git status', 'pnpm test'], terminal: 't2' }
  }
})
