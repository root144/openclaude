/**
 * duo — path policy for grounded debates.
 *
 * The debate prompt allows Read/Glob/Grep so a claim can rest on the actual
 * repository instead of recollection. Allowing those tools *by name* is not a
 * boundary: the tool input carries an arbitrary path, and an absolute path or
 * `../` escape would let a debater read the FCC key, SSH material, or any other
 * file and ship it to a free model provider. Scope every path to the project
 * root and refuse obvious secret files.
 *
 * Kept I/O-thin and injectable so the policy is unit-testable without running a
 * tool.
 */

import { realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { expandPath } from '../../utils/path.js'
import { READ_ONLY_TOOLS } from './debate.js'

/** Basenames that must never reach a debater, even inside the project. */
const SENSITIVE_NAMES = new Set([
  '.env',
  '.netrc',
  '.npmrc',
  '.git-credentials',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
])

const SENSITIVE_SUFFIXES = ['.pem', '.key', '.p12', '.pfx']

/** True when a project-relative path names a secret or VCS internals. */
export function isSensitiveProjectPath(candidate: string): boolean {
  const parts = candidate.split(/[\\/]+/).filter(Boolean)
  if (parts.includes('.git')) return true
  const base = (parts[parts.length - 1] ?? '').toLowerCase()
  if (!base) return false
  if (SENSITIVE_NAMES.has(base)) return true
  if (base.startsWith('.env.')) return true
  return SENSITIVE_SUFFIXES.some(suffix => base.endsWith(suffix))
}

/** Resolve symlinks when possible; fall back to the lexical path. */
async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch {
    return resolve(path)
  }
}

/** True when a glob pattern itself climbs out of the project. */
function globEscapes(pattern: unknown): boolean {
  return typeof pattern === 'string' && /(^|[\\/])\.\.([\\/]|$)/.test(pattern)
}

/** True when `candidate` resolves inside `projectRoot` (symlinks included). */
export async function isPathWithinProject(
  candidate: string,
  projectRoot: string,
): Promise<boolean> {
  const root = await canonical(projectRoot)
  // Match the Read tool's own path expansion: `~/…` must not be treated as a
  // relative path inside the project while the tool expands it to $HOME.
  const target = await canonical(expandPath(candidate, projectRoot))
  return target === root || target.startsWith(root + sep)
}

/**
 * Path a grounded tool would touch, or null when the call has no usable path.
 * Glob/Grep default to the project root, which is what the tool itself does.
 */
export function readPathFor(
  toolName: string,
  input: Record<string, unknown>,
): string | null {
  if (toolName === 'Read') {
    return typeof input.file_path === 'string' && input.file_path.trim()
      ? input.file_path
      : null
  }
  if (toolName === 'Glob' || toolName === 'Grep') {
    return typeof input.path === 'string' && input.path.trim()
      ? input.path
      : '.'
  }
  return null
}

export type GroundedReadDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'tool' | 'no-path' | 'outside-project' | 'sensitive-path' }

/** Decide one grounded tool call. Only Read/Glob/Grep are eligible. */
export async function isGroundedReadAllowed(
  toolName: string,
  input: Record<string, unknown>,
  projectRoot: string,
): Promise<GroundedReadDecision> {
  if (!(READ_ONLY_TOOLS as readonly string[]).includes(toolName)) {
    return { allowed: false, reason: 'tool' }
  }
  const candidate = readPathFor(toolName, input)
  if (candidate === null) return { allowed: false, reason: 'no-path' }
  if (!(await isPathWithinProject(candidate, projectRoot))) {
    return { allowed: false, reason: 'outside-project' }
  }
  if (
    (toolName === 'Glob' && globEscapes(input.pattern)) ||
    (toolName === 'Grep' && globEscapes(input.glob))
  ) {
    return { allowed: false, reason: 'outside-project' }
  }
  if (isSensitiveProjectPath(candidate)) {
    return { allowed: false, reason: 'sensitive-path' }
  }
  return { allowed: true }
}
