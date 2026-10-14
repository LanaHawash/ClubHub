import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hash } from 'bcrypt'

async function main() {
  // Prevent accidental execution in production.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Development Deanship seed cannot run in production.'
    )
  }

  const connectionString = process.env.DATABASE_URL
  const email = process.env.DEV_DEANSHIP_EMAIL?.trim().toLowerCase()
  const password = process.env.DEV_DEANSHIP_PASSWORD

  if (!connectionString) {
    throw new Error('DATABASE_URL is missing')
  }

  if (!email || !password) {
    throw new Error(
      'DEV_DEANSHIP_EMAIL and DEV_DEANSHIP_PASSWORD must be configured'
    )
  }

  if (password.length < 12) {
    throw new Error(
      'DEV_DEANSHIP_PASSWORD must contain at least 12 characters'
    )
  }

  // Only permit seeding the local development database.
const databaseUrl = new URL(connectionString)
const databaseName = decodeURIComponent(
  databaseUrl.pathname.replace(/^\/+/, '')
)

if (databaseName !== 'clubhub_dev') {
  throw new Error(
    `Deanship seed refused: expected clubhub_dev, found ${databaseName}`
  )
}

if (
  !['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Deanship seed refused: database must be hosted locally'
  )
}

  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  try {
    const existing = await prisma.account.findUnique({
      where: { email },
    })

    if (existing) {
      if (existing.role !== 'DEANSHIP') {
        throw new Error(
          'This email already belongs to a non-Deanship account'
        )
      }

      console.log('Deanship account already exists. No changes made.')
      return
    }

    const passwordHash = await hash(password, 12)

    await prisma.account.create({
      data: {
        email,
        passwordHash,
        role: 'DEANSHIP',
        status: 'ACTIVE',
      },
    })

    console.log('Development Deanship account created successfully.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Deanship seed failed:', error.message)
  process.exitCode = 1
})