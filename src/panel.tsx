// The Run Command panel: one input line and Enter runs it in a terminal of this workspace.
import {
  atom,
  Button,
  Callout,
  Collapsible,
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
  Separator,
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

// Save a secret. The secret atom is unkeyed, so Orca never persists it, and it is cleared once sent.
const NEW_GROUP = '__new__'
const groups = atom<string[] | null>(null)
const secretGroup = atom<string>('secret.group', '', { persist: 'plugin' })
const newGroup = atom('')
const secretName = atom('')
const secretValue = atom('')
const secretTitle = atom('')
const secretService = atom('')
const secretExpires = atom('')
const secretUrl = atom('')
const saving = atom(false)
const saved = atom<{ ok: boolean; lines: string[] } | null>(null)
const secretError = atom<string | null>(null)

async function loadGroups(): Promise<void> {
  try {
    const answer = await plugin.request('secrets.groups', undefined, { timeoutMs: 30_000 })
    set(groups, answer.groups)
    if (!read(secretGroup)) set(secretGroup, answer.groups[0] ?? NEW_GROUP)
  } catch (err) {
    set(groups, [])
    set(secretError, (err as Error).message)
  }
}

async function saveSecret(): Promise<void> {
  set(secretError, null)
  set(saved, null)
  const group = read(secretGroup) === NEW_GROUP ? read(newGroup) : read(secretGroup)
  const value = read(secretValue)
  // The field empties as the request leaves, so the value is held only for this one call.
  set(secretValue, '')
  set(saving, true)
  try {
    const answer = await plugin.request(
      'secrets.save',
      {
        group,
        name: read(secretName),
        value,
        title: read(secretTitle),
        service: read(secretService),
        expires: read(secretExpires),
        url: read(secretUrl)
      },
      { timeoutMs: 120_000 }
    )
    set(saved, answer)
    if (answer.ok) {
      set(secretName, '')
      set(secretTitle, '')
      set(secretService, '')
      set(secretExpires, '')
      set(secretUrl, '')
      set(newGroup, '')
      await loadGroups()
    }
  } catch (err) {
    set(secretError, (err as Error).message)
  } finally {
    set(saving, false)
  }
}

function SaveSecret() {
  const list = read(groups)
  const group = read(secretGroup)
  const result = read(saved)
  const problem = read(secretError)
  const options = [
    ...(list ?? []).map((name) => ({ value: name, label: name })),
    { value: NEW_GROUP, label: 'New group…' }
  ]
  return (
    <Collapsible
      title="Save a secret"
      description="Stored with `secrets save --stdin`: never in a terminal, the clipboard or this plugin."
      onChange={(open) => {
        if (open && read(groups) === null) void loadGroups()
      }}
    >
      <Stack gap="sm">
        <Select label="Group" value={group || undefined} options={options} onChange={(value) => set(secretGroup, value)} />
        {group === NEW_GROUP ? (
          <Input label="New group" placeholder="e.g. supabase" value={read(newGroup)} onChange={(value) => set(newGroup, value)} />
        ) : null}
        <Input label="Name" placeholder="e.g. SUPABASE_FOO_TOKEN" value={read(secretName)} onChange={(value) => set(secretName, value)} />
        <Input label="Secret" type="password" value={read(secretValue)} onChange={(value) => set(secretValue, value)} onSubmit={() => void saveSecret()} />
        <Input label="Title (optional)" placeholder="Supabase · API token (scope, owner)" value={read(secretTitle)} onChange={(value) => set(secretTitle, value)} />
        <Input label="Service (optional)" placeholder="defaults to the group" value={read(secretService)} onChange={(value) => set(secretService, value)} />
        <Input label="Expires (optional)" placeholder="YYYY-MM-DD" value={read(secretExpires)} onChange={(value) => set(secretExpires, value)} />
        <Input label="URL (optional)" placeholder="where the token is managed" value={read(secretUrl)} onChange={(value) => set(secretUrl, value)} />
        <Row gap="xs">
          <Button icon="check" disabled={read(saving)} onPress={saveSecret}>
            {read(saving) ? 'Saving…' : 'Save'}
          </Button>
        </Row>
        {result ? (
          <Callout tone={result.ok ? 'success' : 'danger'} title={result.ok ? 'Saved' : 'Not saved'}>
            {result.lines.join('\n')}
          </Callout>
        ) : null}
        {problem ? <Callout tone="danger">{problem}</Callout> : null}
      </Stack>
    </Collapsible>
  )
}

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
    return (
      <Stack gap="md">
        <EmptyState title="No workspace focused" description="Open a workspace to run a command in it." icon="terminal" />
        <Separator />
        <SaveSecret />
      </Stack>
    )
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
      <Separator />
      <SaveSecret />
    </Stack>
  )
}
