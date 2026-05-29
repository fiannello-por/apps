import { test, expect, beforeAll } from 'vitest'
import { encrypt, decrypt } from './encryption'

beforeAll(() => { process.env.ENCRYPTION_KEY = '0'.repeat(64) })

test('round-trips a secret', () => {
  const c = encrypt('my-token')
  expect(c).not.toContain('my-token')
  expect(decrypt(c)).toBe('my-token')
})

test('two encryptions of same input differ (random IV)', () => {
  expect(encrypt('x')).not.toBe(encrypt('x'))
})

test('tampered ciphertext fails to decrypt', () => {
  const c = encrypt('secret')
  const bad = c.slice(0, -2) + (c.endsWith('aa') ? 'bb' : 'aa')
  expect(() => decrypt(bad)).toThrow()
})
