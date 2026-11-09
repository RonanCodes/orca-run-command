// The Run Command panel: one input line and Enter runs it in a terminal of this workspace.
import {
  atom,
  Button,
  Callout,
  EmptyState,
  Heading,
  Input,
  List,
  ListItem,
  on,
  plugin,
  read,
  Row,
  Select,
  set,
  Stack,
  Text,
  type PanelContext
} from 'orca'
import type { RunState } from './protocol'

const state = atom<RunState | null>(null)
const draft = atom('draft', '')
const chosen = atom<string | null>('terminal', null)
const result = atom<string | null>(null)
const error = atom<string | null>(null)

async function refresh(): Promise<void> {
  try {
    const next = await plugin.request('run.state')
    set(state, next)
    if (!next.terminals.some((choice) => choice.id === read(chosen))) set(chosen, next.terminal)
  } catch (err) {
    set(error, (err as Error).message)
  }
}

/** Enter in the field is the confirmation: nothing runs until the person presses it. */
async function run(typed: string): Promise<void> {
  set(error, null)
  set(result, null)
  try {
    const answer = await plugin.request('run.exec', { command: typed, terminal: read(chosen) })
    set(result, `Ran in ${answer.ranIn}. The output is in that terminal tab.`)
    set(draft, '')
    const current = read(state)
    if (current) set(state, { ...current, history: answer.history })
  } catch (err) {
    set(error, (err as Error).message)
  }
}

async function clearHistory(): Promise<void> {
  const answer = await plugin.request('run.clearHistory')
  const current = read(state)
  if (current) set(state, { ...current, history: answer.history })
}

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(on('workspace.changed', () => void refresh()))
  void refresh()
}

export default function Panel() {
  const current = read(state)
  const terminal = read(chosen)
  const message = read(error)
  const done = read(result)
  if (current !== null && current.workspace === null) {
    return <EmptyState title="No workspace focused" description="Open a workspace to run a command in it." icon="terminal" />
  }
  if (current === null) {
    return (
      <Stack gap="md">
        <Heading>Run Command</Heading>
        {message ? <Callout tone="danger">{message}</Callout> : <Text muted>Loading…</Text>}
      </Stack>
    )
  }
  const terminals = current.terminals
  return (
    <Stack gap="md">
      <Heading>Run Command</Heading>
      {current.workspace ? <Text muted size="xs">In {current.workspace}</Text> : null}
      {terminals.length === 0 ? (
        <Callout tone="warning">Open a terminal tab in this workspace; it then shows up here.</Callout>
      ) : (
        <Select
          label="Terminal"
          value={terminal ?? undefined}
          options={terminals.map((choice) => ({ value: choice.id, label: choice.label }))}
          onChange={(value) => set(chosen, value)}
        />
      )}
      <Input
        label="Command"
        placeholder="e.g. secrets status"
        value={read(draft)}
        onChange={(value) => set(draft, value)}
        onSubmit={(value) => void run(value)}
      />
      <Row gap="xs">
        <Button icon="play" disabled={terminals.length === 0} onPress={() => run(read(draft))}>
          Run in terminal
        </Button>
      </Row>
      {done ? <Callout tone="success">{done}</Callout> : null}
      {message ? <Callout tone="danger">{message}</Callout> : null}
      {current.history.length > 0 ? (
        <Stack gap="xs">
          <Row justify="between">
            <Text weight="medium">Recent</Text>
            <Button variant="ghost" size="xs" onPress={clearHistory}>
              Clear
            </Button>
          </Row>
          <List label="Recent commands">
            {current.history.map((command) => (
              <ListItem key={command} title={command} icon="terminal" onPress={() => set(draft, command)} />
            ))}
          </List>
          <Text muted size="xs">Pick one to put it back in the field; Enter runs it.</Text>
        </Stack>
      ) : null}
    </Stack>
  )
}
