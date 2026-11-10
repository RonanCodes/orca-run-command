# Changelog

## 0.2.0 (2026-11-10)

First release in the Orca community catalog.

- Commands that look like they hold a secret (`NAME_TOKEN=...`, `Bearer ...`, `user:password@`
  URLs, well-known token prefixes) still run but are never kept in Recent, and a line started
  with a space stays out too. Entries of that shape kept by 0.1.0 are dropped.
- Save a secret is optional: it shows only when a `secrets` command is on `PATH`, which the
  plugin finds without starting a shell. Any value the command prints back is masked.
- Errors from **Clear** show in the panel; pressing Enter twice during a run sends it once.
- Native empty states for no workspace and no shell terminal, a spinner while loading, and a Run
  button that names its terminal.
- A plugin icon, a cover and light and dark screenshots for the catalog.
- A longer README: every flow, the palette commands, safety, privacy and an FAQ.

## 0.1.0 (2026-11-09)

- A sidebar panel that types a one-line command into a shell terminal of the focused workspace.
- Recent commands, the last terminal remembered, and two palette commands.
- Save a secret through a `secrets save --stdin` command.
