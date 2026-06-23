/**
 * Crée ou met à jour un compte admin.
 * Usage : npm run create-admin -- --email=admin@lrs.fr --password=xxxx [--name="Admin"] [--role=SUPER_ADMIN]
 */

import path from 'node:path'
import bcrypt from 'bcryptjs'

try { process.loadEnvFile(path.resolve(process.cwd(), '.env.local')) } catch { /* absent en CI */ }

function parseArgs() {
  return Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=')
      return [key, value ?? '']
    })
  )
}

async function main() {
  const { email, password, name, role } = parseArgs()

  if (!email || !password) {
    console.error('Usage: npm run create-admin -- --email=... --password=... [--name=...] [--role=ADMIN|SUPER_ADMIN]')
    process.exit(1)
  }

  const { db } = await import('../src/lib/db/client')
  const hashedPassword = await bcrypt.hash(password, 10)

  const user = await db.user.upsert({
    where: { email },
    update: { password: hashedPassword, ...(name && { name }), ...(role && { role: role as 'ADMIN' | 'SUPER_ADMIN' }) },
    create: { email, password: hashedPassword, name: name || null, role: (role as 'ADMIN' | 'SUPER_ADMIN') || 'ADMIN' },
  })

  console.log(`✓ Utilisateur admin prêt : ${user.email} (${user.role})`)
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
