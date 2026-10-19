import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isGroundedReadAllowed,
  isPathWithinProject,
  isSensitiveProjectPath,
  readPathFor,
} from './readScope.js'

let base: string
let root: string
let outside: string

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'duo-readscope-'))
  root = join(base, 'project')
  outside = join(base, 'outside.txt')
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, '.git'), { recursive: true })
  await writeFile(join(root, 'src', 'app.ts'), 'export const ok = true\n')
  await writeFile(join(root, '.env'), 'API_KEY=secret\n')
  await writeFile(join(root, '.git', 'config'), '[remote]\n')
  await writeFile(outside, 'outside secret\n')
  await symlink(outside, join(root, 'src', 'escape.txt'))
})

afterAll(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('isPathWithinProject', () => {
  test('accepts a project file and rejects ../ escapes', async () => {
    expect(await isPathWithinProject('src/app.ts', root)).toBe(true)
    expect(await isPathWithinProject('../outside.txt', root)).toBe(false)
    expect(await isPathWithinProject(outside, root)).toBe(false)
  })

  test('resolves symlinks before deciding', async () => {
    expect(await isPathWithinProject('src/escape.txt', root)).toBe(false)
  })

  test('expands ~ before deciding (the Read tool does)', async () => {
    expect(await isPathWithinProject('~/.fcc/.env', root)).toBe(false)
  })
})

describe('isSensitiveProjectPath', () => {
  test('flags env files, keys and .git internals', () => {
    expect(isSensitiveProjectPath('.env')).toBe(true)
    expect(isSensitiveProjectPath('deploy/.env.production')).toBe(true)
    expect(isSensitiveProjectPath('certs/server.pem')).toBe(true)
    expect(isSensitiveProjectPath('.git/config')).toBe(true)
    expect(isSensitiveProjectPath('src/app.ts')).toBe(false)
  })
})

describe('readPathFor', () => {
  test('defaults Glob/Grep to the project root and requires Read file_path', () => {
    expect(readPathFor('Read', { file_path: 'a.ts' })).toBe('a.ts')
    expect(readPathFor('Read', {})).toBeNull()
    expect(readPathFor('Glob', { pattern: '**/*.ts' })).toBe('.')
    expect(readPathFor('Grep', { path: 'src', pattern: 'x' })).toBe('src')
    expect(readPathFor('Bash', { command: 'ls' })).toBeNull()
  })
})

describe('isGroundedReadAllowed', () => {
  test('allows normal repository reads and searches', async () => {
    expect(await isGroundedReadAllowed('Read', { file_path: 'src/app.ts' }, root))
      .toEqual({ allowed: true })
    expect(await isGroundedReadAllowed('Glob', { pattern: '**/*.ts' }, root))
      .toEqual({ allowed: true })
  })

  test('denies outside paths, secrets, symlink escapes and non-read tools', async () => {
    expect(await isGroundedReadAllowed('Read', { file_path: outside }, root))
      .toEqual({ allowed: false, reason: 'outside-project' })
    expect(await isGroundedReadAllowed('Read', { file_path: 'src/escape.txt' }, root))
      .toEqual({ allowed: false, reason: 'outside-project' })
    expect(await isGroundedReadAllowed('Read', { file_path: '.env' }, root))
      .toEqual({ allowed: false, reason: 'sensitive-path' })
    expect(await isGroundedReadAllowed('Read', { file_path: '.git/config' }, root))
      .toEqual({ allowed: false, reason: 'sensitive-path' })
    expect(await isGroundedReadAllowed('Bash', { command: 'cat .env' }, root))
      .toEqual({ allowed: false, reason: 'tool' })
    expect(await isGroundedReadAllowed('Glob', { pattern: '../**/*' }, root))
      .toEqual({ allowed: false, reason: 'outside-project' })
    expect(await isGroundedReadAllowed('Grep', { glob: '../**/*', pattern: 'x' }, root))
      .toEqual({ allowed: false, reason: 'outside-project' })
  })
})
