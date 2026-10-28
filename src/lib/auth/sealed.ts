import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// Chiffrement des jetons Google gardés en base (boîte kingso@, agenda du planning).
// Clé dérivée de SESSION_SECRET, distincte pour chaque usage.

const key = (purpose: string) => createHash('sha256').update(`${purpose}:${process.env.SESSION_SECRET ?? ''}`).digest()

export function seal(purpose: string, text: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(purpose), iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.')
}

export function unseal(purpose: string, sealed: string): string {
  const [iv, tag, data] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', key(purpose), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
