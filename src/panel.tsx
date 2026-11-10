// The Run Command panel: one input line, and Enter runs it in a terminal of this workspace.
// Orca draws every control with its own components and theme, so it follows light and dark.
import {
  atom,
  Button,
  Callout,
  Code,
  Collapsible,
  EmptyState,
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
  Spinner,
  Stack,
  Text,
  type PanelContext
} from 'orca'
import type { RunState } from './protocol'

const state = atom<RunState | null>(null)
const draft = atom('draft', '')
const chosen = atom<string | null>('terminal', null)
const running = atom(false)
const result = atom<{ command: string; ranIn: string; kept: boolean } | null>(null)
const error = atom<string | null>(null)

// Save a secret: only shown when a `secrets` command is installed (see the README).
// The secret atom is unkeyed, so Orca never persists it, and it is cleared once sent.
const NEW_GROUP = '__new__'
const secretsAvailable = atom(false)
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

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong.'
}

async function checkSecrets(): Promise<void> {
  try {
    set(secretsAvailable, (await plugin.request('secrets.available')).available)
  } catch {
    set(secretsAvailable, false)
  }
}

async function loadGroups(): Promise<void> {
  try {
    const answer = await plugin.request('secrets.groups', undefined, { timeoutMs: 30_000 })
    set(groups, answer.groups)
    if (!read(secretGroup) || (read(secretGroup) !== NEW_GROUP && !answer.groups.includes(read(secretGroup)))) {
      set(secretGroup, answer.groups[0] ?? NEW_GROUP)
    }
  } catch (err) {
    set(groups, [])
    set(secretGroup, NEW_GROUP)
    set(secretError, messageOf(err))
  }
}

async function saveSecret(): Promise<void> {
  if (read(saving)) return
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
    set(secretError, messageOf(err))
  } finally {
    set(saving, false)
  }
}

function SaveSecret() {
  if (!read(secretsAvailable)) return null
  const list = read(groups)
  const group = read(secretGroup)
  const outcome = read(saved)
  const problem = read(secretError)
  const options = [
    ...(list ?? []).map((name) => ({ value: name, label: name })),
    { value: NEW_GROUP, label: 'New group…' }
  ]
  return (
    <Stack gap="md">
      <Separator />
      <Collapsible
        title="Save a secret"
        description="Hands a token to your secrets command on stdin: never a terminal, the clipboard or this plugin's storage."
        onChange={(open) => {
          if (open && read(groups) === null) void loadGroups()
        }}
      >
        <Stack gap="sm">
          {list === null ? <Spinner label="Reading your groups" /> : null}
          <Select label="Group" value={group || undefined} options={options} onChange={(value) => set(secretGroup, value)} />
          {group === NEW_GROUP ? (
            <Input label="New group" placeholder="e.g. github" value={read(newGroup)} onChange={(value) => set(newGroup, value)} />
          ) : null}
          <Input label="Name" placeholder="e.g. EXAMPLE_API_TOKEN" value={read(secretName)} onChange={(value) => set(secretName, value)} />
          <Input
            label="Secret"
            type="password"
            value={read(secretValue)}
            onChange={(value) => set(secretValue, value)}
            onSubmit={() => void saveSecret()}
          />
          <Input label="Title (optional)" placeholder="defaults to the name" value={read(secretTitle)} onChange={(value) => set(secretTitle, value)} />
          <Input label="Service (optional)" placeholder="defaults to the group" value={read(secretService)} onChange={(value) => set(secretService, value)} />
          <Input label="Expires (optional)" placeholder="YYYY-MM-DD" value={read(secretExpires)} onChange={(value) => set(secretExpires, value)} />
          <Input label="URL (optional)" placeholder="where the token is managed" value={read(secretUrl)} onChange={(value) => set(secretUrl, value)} />
          <Row gap="xs">
            <Button icon="check" disabled={read(saving)} onPress={saveSecret}>
              {read(saving) ? 'Saving…' : 'Save'}
            </Button>
          </Row>
          {outcome ? (
            <Callout tone={outcome.ok ? 'success' : 'danger'} title={outcome.ok ? 'Saved' : 'Not saved'}>
              {outcome.lines.join('\n')}
            </Callout>
          ) : null}
          {problem ? <Callout tone="danger">{problem}</Callout> : null}
        </Stack>
      </Collapsible>
    </Stack>
  )
}

async function refresh(): Promise<void> {
  try {
    const next = await plugin.request('run.state')
    set(state, next)
    if (!next.terminals.some((choice) => choice.id === read(chosen))) set(chosen, next.terminal)
  } catch (err) {
    set(error, messageOf(err))
  }
}

/** Enter in the field is the confirmation: nothing runs until the person presses it, once. */
async function run(typed: string): Promise<void> {
  if (read(running)) return
  set(running, true)
  set(error, null)
  set(result, null)
  try {
    const answer = await plugin.request('run.exec', { command: typed, terminal: read(chosen) })
    set(result, { command: typed.trim().replace(/^!\s*/, ''), ranIn: answer.ranIn, kept: answer.kept })
    set(draft, '')
    const current = read(state)
    if (current) set(state, { ...current, history: answer.history })
  } catch (err) {
    set(error, messageOf(err))
  } finally {
    set(running, false)
  }
}

async function clearHistory(): Promise<void> {
  set(error, null)
  try {
    const answer = await plugin.request('run.clearHistory')
    const current = read(state)
    if (current) set(state, { ...current, history: answer.history })
  } catch (err) {
    set(error, messageOf(err))
  }
}

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(on('workspace.changed', () => void refresh()))
  void refresh()
  void checkSecrets()
}

function Outcome() {
  const done = read(result)
  const message = read(error)
  if (message) return <Callout tone="danger">{message}</Callout>
  if (!done) return null
  return (
    <Callout tone="success" title={`Ran in ${done.ranIn}`}>
      {done.kept
        ? 'The output is in that terminal tab.'
        : 'The output is in that terminal tab. The command was not kept in Recent.'}
    </Callout>
  )
}

function Recent({ history }: { history: readonly string[] }) {
  if (history.length === 0) {
    return (
      <Text muted size="xs">
        Commands you run show up here. Start one with a space, or put a secret in it, and it is not kept.
      </Text>
    )
  }
  return (
    <Stack gap="xs">
      <Row justify="between" align="center">
        <Text weight="medium" size="sm">
          Recent
        </Text>
        <Button variant="ghost" size="xs" icon="delete" onPress={clearHistory}>
          Clear
        </Button>
      </Row>
      <List label="Recent commands">
        {history.map((command) => (
          <ListItem key={command} title={command} icon="terminal" onPress={() => set(draft, command)} />
        ))}
      </List>
      <Text muted size="xs">
        Pick one to put it back in the field; Enter runs it.
      </Text>
    </Stack>
  )
}

export default function Panel() {
  const current = read(state)
  const terminal = read(chosen)
  if (current === null) {
    const message = read(error)
    return message ? <Callout tone="danger">{message}</Callout> : <Spinner label="Looking for terminals" />
  }
  if (current.workspace === null) {
    return (
      <Stack gap="md">
        <EmptyState title="No workspace open" description="Open a workspace, then run a command in one of its terminals." icon="terminal" />
        <SaveSecret />
      </Stack>
    )
  }
  const terminals = current.terminals
  const target = terminals.find((choice) => choice.id === terminal)?.label
  return (
    <Stack gap="md">
      <Text muted size="xs">
        Types a command into a terminal of {current.workspace} and presses Enter for you.
      </Text>
      {terminals.length === 0 ? (
        <EmptyState
          title="No shell terminal yet"
          description="Open a terminal tab in this workspace. Tabs that run an agent are left out, so a command never becomes a prompt."
          icon="terminal"
        />
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
        placeholder="e.g. git status"
        value={read(draft)}
        disabled={terminals.length === 0}
        onChange={(value) => set(draft, value)}
        onSubmit={(value) => void run(value)}
      />
      <Row gap="sm" align="center" wrap>
        <Button icon="play" disabled={terminals.length === 0 || read(running)} onPress={() => run(read(draft))}>
          {target ? `Run in ${target}` : 'Run'}
        </Button>
        <Text muted size="xs">
          or press <Code>Enter</Code>
        </Text>
      </Row>
      <Outcome />
      <Recent history={current.history} />
      <SaveSecret />
    </Stack>
  )
}
