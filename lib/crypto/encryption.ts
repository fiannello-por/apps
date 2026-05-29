import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function key() {
  const k = process.env.ENCRYPTION_KEY
  if (!k || k.length !== 64) throw new Error('ENCRYPTION_KEY must be 64 hex chars')
  return Buffer.from(k, 'hex')
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

export function decrypt(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted payload format')
  const [ivHex, tagHex, dataHex] = parts
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
}
