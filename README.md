# Run Command for Orca

Run a one-off shell command from a sidebar panel in [Orca](https://github.com/stablyai/orca),
in a terminal of the workspace you are in, without leaving the chat. Type `secrets status` (or
`! secrets status`), press Enter, and it runs in that workspace's terminal tab.

<img src="docs/screenshot.png" alt="The Run Command panel in Orca's right sidebar: a terminal picker set to ~/dev, a command field, a Run in terminal button and the recent commands" width="340">

> **This is a stopgap.** What I really want is Claude Code's `!` prefix in Orca's chat box: type
> `! <command>` in a chat and it runs. Chats that run inside a terminal tab already have it (the
> Claude TUI runs it), but the structured chat view sends `!pwd` to the model as a prompt. A
> plugin cannot add that, because Orca's plugin API has no hook on the chat composer. It needs
> Orca itself: [stablyai/orca#32165](https://github.com/stablyai/orca/issues/32165).

## What it does

- **One input line.** Type a command and press Enter (or **Run in terminal**). Enter is the
  confirmation: nothing runs before you press it. A leading `!` is dropped, so `! pwd` works too.
- **Pick the terminal.** It lists the workspace's terminal tabs that run a shell and remembers
  the one you used last. Tabs that run an agent are never offered, because typing into an agent
  sends it a prompt.
- **Recent commands.** The last 10 commands, newest first. Pick one to put it back in the field;
  Enter runs it. **Clear** empties the list.
- **Palette commands:** `Run Command: Run the last command again` and
  `Run Command: Show recent commands`.

The output appears in the terminal tab, never in the panel or the chat.

## Save a secret

A collapsible **Save a secret** section stores a token without it ever reaching a terminal, the
shell history, the clipboard, the plugin's storage or its logs:

- **Group**: a dropdown of the groups your `secrets status` lists (names only), or **New group…**.
- **Name**: upper case, digits and `_`, starting with a letter (`^[A-Z][A-Z0-9_]+$`), e.g.
  `SUPABASE_FOO_TOKEN`.
- **Secret**: a masked field.
- **Title**, **Service**, **Expires** (`YYYY-MM-DD`) and **URL** are optional. Title defaults to
  the name and Service to the group.

**Save** runs `secrets save GROUP NAME --stdin --title … --service … [--expires …] [--url …]` from
the plugin's worker as a child process with an argument list (no shell). The value is written to
the child's stdin and the stream is closed: it is never in the arguments. The field empties as the
request leaves, and the panel shows only what `secrets save` printed (the item it created and the
sync summary, never the value).

This needs a `secrets` command on your shell's `PATH` that implements `save … --stdin`. Orca is a
GUI app, so the worker asks your login shell where `secrets` is (`$SHELL -ilc 'command -v secrets'`).
Set `ORCA_RUN_COMMAND_SECRETS_BIN` to an absolute path to skip that lookup.

## What it keeps, and what it asks for

It stores two things in the plugin's own storage: the recent commands and the id of the terminal
used last. **It never reads or stores a command's output**, and it makes no network calls.

| Capability | Why |
| --- | --- |
| `terminal:send` | Type the command into the terminal and press Enter. |
| `workspace:read` | List the focused workspace's terminal tabs. |
| `agent:read` | Leave out the tabs that run an agent. |
| `storage:own` | Keep the recent commands. |

It runs a small worker (the `trusted-worker` profile), because only a worker may type into a
terminal. **Save a secret** also uses the worker's Node process directly: it starts `secrets` (and,
once, your login shell to find it) as child processes. That is part of the access Orca's approval
prompt names ("runs its own code in a separate Node.js process … with your user account's access").

## Install

```sh
git clone https://github.com/RonanCodes/orca-run-command
orca plugin dev load ./orca-run-command   # prints what it would grant; re-run with --approve <fingerprint>
orca plugin open run-command              # shows the panel in the right sidebar
```

## Use

1. Open a terminal tab in the workspace (a plain shell, not an agent).
2. Open the **Run Command** panel in the right sidebar.
3. Type the command, for example `secrets status`, and press Enter.
4. Switch to the terminal tab to read the output.

## Known limits

- A plugin can only type into a terminal that is already open, so the workspace needs one plain
  terminal tab first. A command typed into a terminal that is busy (a running
  program, an editor) goes to that program, as if you had typed it.
- The command runs as if typed in that terminal, in its current directory and shell.
- One line at a time: a pasted newline is refused, so a paste never runs extra commands.

## Develop

```sh
orca plugin types .      # writes .orca/types for tsc
npx tsc -p .             # type-check
orca plugin test .       # unit tests (src/*.test.ts) with orca/testing
orca plugin check .      # renders the panel in each src/panel.check.ts scenario
orca plugin dev watch .  # load into Orca, reload on save, stream logs
```

`src/commands.ts` holds the pure logic (reading a command, the history, picking a terminal),
`src/secrets.ts` checks the Save a secret form and builds its arguments, `src/secrets-cli.ts` runs
`secrets`, `src/worker.ts` answers the panel, `src/panel.tsx` is the panel, and `src/protocol.ts`
types the requests between them. `src/node.d.ts` types the few Node APIs used, so there is no
`package.json`.

## License

MIT
