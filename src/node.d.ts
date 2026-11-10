// The few Node APIs src/secrets-cli.ts (and its tests) use, typed here so the plugin needs no package.json or
// @types/node. The worker runs in Node, where these exist.

declare module 'node:child_process' {
  type Readable = { on(event: 'data', listener: (chunk: unknown) => void): void }
  type Writable = { write(data: string): void; end(): void }
  export type ChildProcess = {
    stdin: Writable
    stdout: Readable
    stderr: Readable
    kill(signal?: string): boolean
    on(event: 'error', listener: (error: Error) => void): void
    on(event: 'close', listener: (code: number | null) => void): void
  }
  export function spawn(
    file: string,
    args: readonly string[],
    options: { stdio: ['pipe', 'pipe', 'pipe'] }
  ): ChildProcess
}

declare module 'node:path' {
  export const delimiter: string
  export function isAbsolute(path: string): boolean
  export function join(...parts: string[]): string
}

declare module 'node:fs' {
  export const constants: { X_OK: number }
  export function accessSync(path: string, mode: number): void
  export function statSync(path: string): { isFile(): boolean }
  // Used by the tests only.
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function chmodSync(path: string, mode: number): void
  export function mkdtempSync(prefix: string): string
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function writeFileSync(path: string, data: string): void
}

declare module 'node:os' {
  export function homedir(): string
  export function tmpdir(): string
}

declare const process: { env: Record<string, string | undefined> }
