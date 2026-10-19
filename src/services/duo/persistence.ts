/**
 * duo — session persistence (save/load debates).
 *
 * Writes full debate state to JSON files in ~/.duo/sessions/ so debates can
 * be resumed across app restarts. The saved state includes:
 *   - all config (models, rounds, protocol, grounded, adversarial, etc.)
 *   - conversation history (builtin) or transcript (cli)
 *   - budget config and usage so far
 *   - session name for identification
 *
 * File format is versioned (v1) for future migrations. `question` is an
 * additive v1 field: older files simply lack it and fall back to extracting
 * the first user message.
 */

import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Message } from '../../types/message.js'
import type { DuoState, DuoResult, DuoStats, DuoSide } from './types.js'

export const PERSISTENCE_VERSION = 1

/** Overridable for tests; resolved per call so a test can change it. */
export function sessionDir(): string {
  return process.env.DUO_SESSION_DIR ?? join(homedir(), '.duo', 'sessions')
}

export type PersistedSession = {
  version: number
  savedAt: number
  name: string
  /** The opening question, so /duo sessions does not have to guess. */
  question?: string
  state: DuoState
  lastResult?: DuoResult
  lastStats?: DuoStats
}

/** Session names are user input and become file names: keep them simple. */
export function isSafeSessionName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name) && name !== '.' && name !== '..'
}

function sessionPath(name: string): string {
  if (!isSafeSessionName(name)) {
    throw new Error(`invalid session name "${name}" (letters, digits, . _ -; max 64)`)
  }
  return join(sessionDir(), `${name}.json`)
}

/** Flatten a message's text content (user/assistant only). */
function messageText(message: Message): string {
  if (message.type !== 'user' && message.type !== 'assistant') return ''
  const content: unknown = message.message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/** First question carried by a result or by the stored session history. */
function questionOf(state: DuoState, result?: DuoResult): string {
  const fromResult = result?.entries.find(entry => entry.kind === 'question')?.text?.trim()
  if (fromResult) return fromResult
  for (const side of ['A', 'B'] as const satisfies readonly DuoSide[]) {
    for (const message of state.history[side]) {
      const text = messageText(message).trim()
      if (text) return text
    }
  }
  // CLI sessions have no Message[] history; the replayed transcript carries the
  // first composed question instead.
  return state.clTranscript?.[0]?.message?.trim() ?? ''
}

/** Ensure the session directory exists, private to the user. */
export async function ensureSessionDir(): Promise<void> {
  const dir = sessionDir()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  try {
    await fs.chmod(dir, 0o700)
    // Tighten files written by older versions (they used the default umask,
    // typically 0644). Best effort: a filesystem without POSIX modes keeps
    // working.
    for (const file of await fs.readdir(dir)) {
      if (file.endsWith('.json')) await fs.chmod(join(dir, file), 0o600).catch(() => {})
    }
  } catch {
    // best effort (e.g. a filesystem without POSIX permissions)
  }
}

/** List all saved sessions with basic metadata. */
export async function listSessions(): Promise<Array<{ name: string; savedAt: number; question: string; rounds: number }>> {
  await ensureSessionDir()
  const files = await fs.readdir(sessionDir())
  const sessions: Array<{ name: string; savedAt: number; question: string; rounds: number }> = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const name = file.slice(0, -5)
      if (!isSafeSessionName(name)) continue
      const data = JSON.parse(await fs.readFile(sessionPath(name), 'utf-8')) as PersistedSession
      sessions.push({
        name: typeof data.name === 'string' ? data.name : name,
        savedAt: Number(data.savedAt) || 0,
        question:
          data.question?.trim() ||
          questionOf(data.state, data.lastResult) ||
          '(unknown)',
        rounds: Number(data.state?.rounds) || 0,
      })
    } catch { /* skip corrupt files */ }
  }
  return sessions.sort((a, b) => b.savedAt - a.savedAt)
}

/** Save a session to disk (atomic write, 0600). */
export async function saveSession(name: string, state: DuoState, result?: DuoResult, stats?: DuoStats): Promise<void> {
  const target = sessionPath(name)
  await ensureSessionDir()
  const payload: PersistedSession = {
    version: PERSISTENCE_VERSION,
    savedAt: Date.now(),
    name,
    question: questionOf(state, result) || undefined,
    state: {
      ...state,
      sessionName: name,
    },
    lastResult: result,
    lastStats: stats,
  }
  const tmp = `${target}.${process.pid}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 })
    await fs.chmod(tmp, 0o600)
    await fs.rename(tmp, target)
  } finally {
    await fs.unlink(tmp).catch(() => {})
  }
}

/** Load a session from disk. Returns null if not found or invalid. */
export async function loadSession(name: string): Promise<PersistedSession | null> {
  try {
    const data = JSON.parse(await fs.readFile(sessionPath(name), 'utf-8')) as PersistedSession
    if (data.version !== PERSISTENCE_VERSION) {
      throw new Error(`session version ${data.version} not supported (current: ${PERSISTENCE_VERSION})`)
    }
    return data
  } catch {
    return null
  }
}

/** Delete a session. */
export async function deleteSession(name: string): Promise<boolean> {
  try {
    await fs.unlink(sessionPath(name))
    return true
  } catch {
    return false
  }
}
