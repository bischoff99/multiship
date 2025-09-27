import { PrismaClient } from '@prisma/client';

// Prisma Accelerate configuration with connection pooling and caching
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event', 
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    console.log(`🔍 Query: ${e.query}`);
    console.log(`⏱️  Duration: ${e.duration}ms`);
  });
}

// Log database errors
prisma.$on('error', (e) => {
  console.error('❌ Database Error:', e);
});

// Log database info
prisma.$on('info', (e) => {
  console.info('ℹ️  Database Info:', e.message);
});

// Log database warnings
prisma.$on('warn', (e) => {
  console.warn('⚠️  Database Warning:', e.message);
});

// Graceful shutdown handling
process.on('beforeExit', async () => {
  console.log('🔌 Disconnecting from database...');
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  console.log('🔌 Disconnecting from database...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔌 Disconnecting from database...');
  await prisma.$disconnect();
  process.exit(0);
});

export { prisma };