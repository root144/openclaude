import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUserMessage } from '../../utils/messages.js'
import {
  deleteSession,
  isSafeSessionName,
  listSessions,
  loadSession,
  saveSession,
  sessionDir,
} from './persistence.js'
import { createDuoState } from './types.js'

let dir: string
let previous: string | undefined

beforeAll(async () => {
  previous = process.env.DUO_SESSION_DIR
  dir = await mkdtemp(join(tmpdir(), 'duo-sessions-'))
  process.env.DUO_SESSION_DIR = dir
})

afterAll(async () => {
  if (previous === undefined) delete process.env.DUO_SESSION_DIR
  else process.env.DUO_SESSION_DIR = previous
  await rm(dir, { recursive: true, force: true })
})

describe('session names', () => {
  test('accepts ordinary names and rejects paths/dots', () => {
    expect(isSafeSessionName('parser-debate_2026.10')).toBe(true)
    expect(isSafeSessionName('..')).toBe(false)
    expect(isSafeSessionName('../escape')).toBe(false)
    expect(isSafeSessionName('a/b')).toBe(false)
    expect(isSafeSessionName('-leading-dash')).toBe(false)
    expect(isSafeSessionName('has space')).toBe(false)
    expect(isSafeSessionName('')).toBe(false)
  })

  test('save/load/delete reject traversal instead of touching outside files', async () => {
    const state = createDuoState()
    await expect(saveSession('../../escape', state)).rejects.toThrow('invalid session name')
    expect(await loadSession('../../escape')).toBeNull()
    expect(await deleteSession('../../escape')).toBe(false)
  })
})

describe('save/list/load/delete', () => {
  test('writes 0600, keeps the question and loads it back', async () => {
    const state = createDuoState()
    state.history.A = [createUserMessage({ content: 'the original question' })]
    state.rounds = 2
    await saveSession('q', state)

    const path = join(sessionDir(), 'q.json')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    const payload = JSON.parse(await readFile(path, 'utf-8'))
    expect(payload.question).toBe('the original question')

    const sessions = await listSessions()
    expect(sessions[0]?.question).toBe('the original question')
    const loaded = await loadSession('q')
    expect(loaded?.name).toBe('q')
    expect(loaded?.state.rounds).toBe(2)
    expect(await deleteSession('q')).toBe(true)
    expect(await loadSession('q')).toBeNull()
  })

  test('session directory is private', async () => {
    await saveSession('perm', createDuoState())
    expect((await stat(sessionDir())).mode & 0o777).toBe(0o700)
    // restore a permissive dir to prove ensureSessionDir tightens it again
    await chmod(sessionDir(), 0o755)
    await saveSession('perm2', createDuoState())
    expect((await stat(sessionDir())).mode & 0o777).toBe(0o700)
  })
})
