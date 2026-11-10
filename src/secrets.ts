// Pure logic for the "Save a secret" section: checking the form and building the arguments for
// `secrets save GROUP NAME --stdin ...`. The value itself is never part of anything built here.

export const NAME_RE = /^[A-Z][A-Z0-9_]+$/
export const GROUP_RE = /^[a-z0-9][a-z0-9-]*$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** The longest value the form sends. */
export const MAX_VALUE = 4096

export type SecretForm = {
  group: string
  name: string
  title?: string
  service?: string
  expires?: string
  url?: string
}

export class SecretFormError extends Error {
  readonly code = 'invalid_params'
}

function clean(value: string | undefined): string {
  return (value ?? '').trim()
}

/** The arguments after `secrets`, for a checked form. The value goes to stdin, never here. */
export function saveArgs(form: SecretForm): string[] {
  const group = clean(form.group)
  const name = clean(form.name)
  if (!GROUP_RE.test(group)) {
    throw new SecretFormError('Pick a group, or type one in lowercase letters, digits and dashes.')
  }
  if (!NAME_RE.test(name)) {
    throw new SecretFormError('The name is upper case letters, digits and _, starting with a letter, e.g. EXAMPLE_API_TOKEN.')
  }
  const expires = clean(form.expires)
  if (expires !== '' && (!DATE_RE.test(expires) || Number.isNaN(Date.parse(expires)))) {
    throw new SecretFormError('The expiry date is YYYY-MM-DD.')
  }
  const url = clean(form.url)
  if (url !== '' && !/^https?:\/\//.test(url)) {
    throw new SecretFormError('The URL starts with http:// or https://.')
  }
  const args = [
    'save',
    group,
    name,
    '--stdin',
    '--title',
    clean(form.title) || name,
    '--service',
    clean(form.service) || group
  ]
  if (expires !== '') args.push('--expires', expires)
  if (url !== '') args.push('--url', url)
  return args
}

/** One line of text, trimmed. The `secrets` command applies its own rules after this. */
export function checkValue(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new SecretFormError('Paste the secret first.')
  if (/[\r\n]/.test(trimmed)) throw new SecretFormError('The secret is one line.')
  if (trimmed.length > MAX_VALUE) {
    throw new SecretFormError(`Keep the secret under ${MAX_VALUE} characters.`)
  }
  return trimmed
}

/** The group names in `secrets status` output, which lists names and never values. */
export function parseGroups(statusOutput: string): string[] {
  const groups: string[] = []
  for (const line of statusOutput.split('\n')) {
    const match = /^([a-z0-9][a-z0-9-]*) {2}\(/.exec(line)
    if (match && !groups.includes(match[1])) groups.push(match[1])
  }
  return groups
}

/**
 * The last lines of `secrets save` output worth showing. A well-behaved command never prints the
 * value; if one does, every copy of it is masked before it reaches the panel.
 */
export function resultLines(output: string, value = ''): string[] {
  const masked = value === '' ? output : output.split(value).join('••••••')
  return masked
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(-6)
}
