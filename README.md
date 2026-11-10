# Run Command for Orca

<img src="assets/cover.png" alt="Run Command in Orca's right sidebar, in a light and a dark theme: a terminal picker, a command field, a Run button and the recent commands" width="800">

**Type a shell command in Orca's sidebar, press Enter, and it runs in a terminal of the workspace you are in, without leaving your chat.**

Run Command is a small [Orca](https://github.com/stablyai/orca) plugin for the moments when an
agent chat is open and you need one quick command: `git status`, `pnpm test`, restarting a dev
server. You type it once in the side panel, press Enter, and it is typed into a shell tab of the
same workspace for you. The output stays in that terminal, where it belongs.

[Open in Orca](https://onorca.dev/plugins/ronancodes.run-command?catalog=community) ·
[Changelog](CHANGELOG.md) · [Report a problem](https://github.com/RonanCodes/orca-run-command/issues)

## Contents

- [Why it exists](#why-it-exists)
- [What it does](#what-it-does)
- [Install](#install)
- [Run a command](#run-a-command)
- [Pick the terminal](#pick-the-terminal)
- [Recent commands](#recent-commands)
- [Command palette](#command-palette)
- [Save a secret (optional)](#save-a-secret-optional)
- [Safety](#safety)
- [Privacy: what it keeps](#privacy-what-it-keeps)
- [Permissions](#permissions)
- [FAQ](#faq)
- [Known limits](#known-limits)
- [Develop](#develop)

## Why it exists

Claude Code's terminal app has a `!` prefix: type `! git status` in the prompt and it runs as a
shell command. Orca's structured chat view does not have it yet, so `!pwd` goes to the model as a
prompt. A plugin cannot add that to the chat box, because Orca's plugin API has no hook on the
chat composer ([stablyai/orca#32165](https://github.com/stablyai/orca/issues/32165)).

Run Command is the next best thing: one input line in the right sidebar, next to the chat. A
leading `!` is accepted and dropped, so the habit carries over.

## What it does

- **One input line.** Type a command and press Enter, or press **Run in &lt;terminal&gt;**.
- **The right terminal.** It lists the shell tabs of the focused workspace and remembers the one
  you used last. Tabs that run an agent are never offered.
- **Recent commands.** The last 10 commands, newest first, one click to put one back.
- **Palette commands** to run the last command again without opening the panel.
- **Follows your theme.** Every control is one of Orca's own components, so the panel matches
  your light or dark theme and your font.
- **Save a secret**, only if you have a compatible `secrets` command installed.

## Install

**From Orca (recommended).** Open the
[plugin page](https://onorca.dev/plugins/ronancodes.run-command?catalog=community), or in Orca go
to Settings → Plugins, add the community catalog if you have not yet, search for **Run Command**
and press Install. Orca shows what the plugin asks for before anything runs.

**From Git.**

```sh
orca plugin install RonanCodes/orca-run-command
```

**From a clone, for development.**

```sh
git clone https://github.com/RonanCodes/orca-run-command
orca plugin dev load ./orca-run-command   # prints what it would grant; re-run with --approve <fingerprint>
orca plugin open local.run-command        # shows the panel in the right sidebar
```

The plugin needs Orca 1.4.246 or newer.

## Run a command

1. Open a terminal tab in your workspace (a plain shell, not an agent).
2. Open **Run Command** in the right sidebar (the terminal icon).
3. Type a command, for example `git status`.
4. Press **Enter**. The panel says where it ran.
5. Switch to that terminal tab to read the output.

Enter is the confirmation. Nothing is sent while you type, and pressing Enter twice while a run is
in flight sends the command once. A leading `!` is dropped, so `! git status` works too.

One line at a time: a pasted newline is refused, so a paste never runs extra commands by accident.
Commands are capped at 2000 characters.

## Pick the terminal

The **Terminal** dropdown lists the focused workspace's terminal tabs that run a shell. It
remembers the one you used last and picks it again next time, as long as it is still open.

Tabs that run an agent (Claude Code, Codex and the like) are left out on purpose: typing into an
agent sends it a prompt, which is never what a shell command should do.

With no shell tab open, the panel says so and the field is disabled. Open a terminal tab and it
shows up at once; the panel follows Orca's workspace and terminal changes without polling.

## Recent commands

The last 10 commands you ran, newest first, without duplicates. Pick one to put it back in the
field, check it, then press Enter. **Clear** empties the list.

Two kinds of command are run but never kept:

- **One you start with a space**, the way a shell with `HISTCONTROL=ignorespace` treats it. Type
  ` export TOKEN=...` (with a leading space) and it stays out of the list.
- **One that looks like it holds a secret**: a `NAME=value` where the name says TOKEN, SECRET,
  PASSWORD, API_KEY or similar, `--password=` and `--token` flags, `Bearer` headers, URLs with a
  `user:password@` part, and well-known token prefixes such as `ghp_`, `github_pat_`, `sk-`,
  `xoxb-`, `glpat-` and AWS access keys.

When that happens, the panel says the command was not kept.

## Command palette

| Command | What it does |
| --- | --- |
| `Run Command: Run the last command again` | Runs the newest recent command in the terminal you used last. Only offered while a workspace is open. |
| `Run Command: Show recent commands` | Lists the recent commands. |

Both work without opening the panel.

## Save a secret (optional)

This section appears **only when a `secrets` command is installed** on your `PATH`. Most people
will never see it, and the rest of the plugin does not need it.

It stores a token through your own secrets tool without the value ever reaching a terminal, the
shell history, the clipboard, the plugin's storage or its logs. The form asks for a group, a name
(`EXAMPLE_API_TOKEN`), the secret in a masked field, and optional title, service, expiry
(`YYYY-MM-DD`) and URL. **Save** runs, as a child process with an argument list and no shell:

```sh
secrets save GROUP NAME --stdin --title TITLE --service SERVICE [--expires YYYY-MM-DD] [--url URL]
```

The value is written to the command's stdin and the stream is closed; it is never an argument.
The field empties as the request leaves, and the panel shows the last few lines the command
printed. If the command ever prints the value back, it is masked before the panel shows it.

**The interface your `secrets` command needs:**

| Call | Expected behaviour |
| --- | --- |
| `secrets status` | Exit 0 and print one line per group that starts with the group name, two spaces and `(`, such as `github  (2 h old)`. Never print values. Used to fill the Group list when you open the section. |
| `secrets save GROUP NAME --stdin --title T --service S [--expires D] [--url U]` | Read the value from stdin, store it, exit 0 on success, and print a short summary without the value. Exit non-zero with a reason otherwise. |

Group names are lowercase letters, digits and dashes; names are upper case letters, digits and
`_`, starting with a letter. The plugin finds `secrets` on the `PATH` Orca passes on, plus
`~/.local/bin`, `~/bin`, `/opt/homebrew/bin` and `/usr/local/bin`. It never starts a shell to look.
Set `ORCA_RUN_COMMAND_SECRETS_BIN` to an absolute path to use a specific executable.

Nothing runs when the panel opens: `secrets status` runs when you open the section, and
`secrets save` when you press Save.

## Safety

- **Nothing runs without you.** A command is sent only when you press Enter or the Run button,
  or pick **Run the last command again** in the palette.
- **No agent tabs.** A command never goes to a terminal that runs an agent.
- **One line only.** Newlines are refused, so a paste cannot chain extra commands.
- **No output read.** The plugin cannot read a terminal: it does not ask for `terminal:read`.
- **No network.** The plugin makes no network calls and has no analytics.
- **Errors show in the panel.** A closed terminal, a refused send or a storage failure appears as
  a message in the panel, never as a silent failure.
- **Source is plain TypeScript** with no build step and no dependencies, so what you read in
  `src/` is what Orca runs.

A command typed into a terminal that is busy (a running program, an editor) goes to that
program, exactly as if you had typed it there.

## Privacy: what it keeps

In the plugin's own storage, on your machine:

- the recent commands (at most 10, never ones that look like secrets), and
- the id of the terminal you used last.

It never reads or stores a command's output. Clear the list any time with **Clear**; removing the
plugin removes its storage.

## Permissions

| Capability | Why |
| --- | --- |
| `terminal:send` | Type the command into the terminal and press Enter. |
| `workspace:read` | List the focused workspace's terminal tabs. |
| `agent:read` | Leave out the tabs that run an agent. |
| `storage:own` | Keep the recent commands and the last terminal. |

It runs a small worker (Orca's `trusted-worker` profile, shown as **Full access**), because only a
worker may type into a terminal. Orca's approval prompt says the worker runs in a separate Node.js
process with your user account's access. The worker uses that access for one thing beyond the
capabilities above: starting your `secrets` command, when you use Save a secret.

## FAQ

**Where does the output go?** To the terminal tab the command ran in. Switch to it to read it.

**Can it open a new terminal for me?** Not yet. Orca's plugin API can open a terminal only in the
background, and it does not tell a plugin which workspace is focused by id, so a new tab could
land in the wrong place. Open a shell tab once and the panel uses it from then on.

**Why is my terminal not in the list?** It probably runs an agent. Only shell tabs are offered.

**Does it work over SSH?** Yes. It types into whatever terminal tab you pick, local or remote.

**Can I run several lines?** Not in one go. Join them with `&&` or `;` on one line.

**I typed a token by mistake. Is it in the history?** Not if it matched one of the secret shapes
above, or you started the line with a space. Otherwise press **Clear**. The terminal's own shell
history is up to your shell, as with anything typed there.

**Is it free?** Yes, MIT licensed, no account, no tracking.

## Known limits

- A plugin can only type into a terminal that is already open, so the workspace needs one plain
  terminal tab first.
- The command runs as if typed in that terminal, in its current directory and shell.
- The secret patterns are a safety net, not a guarantee: start a line with a space when in doubt.

## Develop

```sh
orca plugin types .      # writes .orca/types for tsc
npx tsc -p .             # type-check
orca plugin test .       # unit tests (src/*.test.ts) with orca/testing
orca plugin check .      # renders the panel in each src/panel.check.ts scenario
orca plugin dev watch .  # load into Orca, reload on save, stream logs
```

| File | Holds |
| --- | --- |
| `src/commands.ts` | Pure logic: reading a command, the history and its secret filter, picking a terminal. |
| `src/worker.ts` | The worker: answers the panel, types into the terminal, keeps the history. |
| `src/panel.tsx` | The panel, built from Orca's components. |
| `src/protocol.ts` | The typed requests between panel and worker. |
| `src/secrets.ts`, `src/secrets-cli.ts` | The optional Save a secret form and the `secrets` command runner. |
| `src/node.d.ts` | Types for the few Node APIs used, so there is no `package.json`. |

Issues and pull requests are welcome.

If Run Command saves you a few context switches, a star on GitHub helps other Orca users find it.

## License

MIT
