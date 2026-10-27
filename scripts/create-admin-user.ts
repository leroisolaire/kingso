/**
 * Crée ou met à jour un compte Super admin avec mot de passe de secours (les autres comptes se créent
 * dans le back-office, page Utilisateurs, et se connectent avec Google).
 * Usage : npm run create-admin -- --email=admin@lrs.fr --password=xxxx [--name="Admin"]
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
  const { email, password, name } = parseArgs()

  if (!email || !password) {
    console.error('Usage: npm run create-admin -- --email=... --password=... [--name=...]')
    process.exit(1)
  }

  const { db } = await import('../src/lib/db/client')
  const hashedPassword = await bcrypt.hash(password, 10)

  const user = await db.user.upsert({
    where: { email },
    update: { password: hashedPassword, active: true, roles: { set: ['SUPER_ADMIN'] }, sessionVersion: { increment: 1 }, ...(name && { name }) },
    create: { email: email.toLowerCase(), password: hashedPassword, name: name || null, roles: ['SUPER_ADMIN'] },
  })

  console.log(`✓ Utilisateur admin prêt : ${user.email} (${user.roles.join(', ')})`)
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
