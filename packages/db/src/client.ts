import { PrismaClient } from '@prisma/client';

// Enhanced Prisma configuration with optimized connection pooling
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
  // Connection pooling is handled by the database URL configuration
  // For PostgreSQL, add connection pool parameters to DATABASE_URL:
  // postgresql://user:password@host:port/database?connection_limit=10&pool_timeout=10&connect_timeout=10
});

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e: any) => {
    console.log(`🔍 Query: ${e.query}`);
    console.log(`⏱️  Duration: ${e.duration}ms`);
  });
}

// Log database errors
prisma.$on('error', (e: any) => {
  console.error('❌ Database Error:', e);
});

// Log database info
prisma.$on('info', (e: any) => {
  console.info('ℹ️  Database Info:', e.message);
});

// Log database warnings
prisma.$on('warn', (e: any) => {
  console.warn('⚠️  Database Warning:', e.message);
});

// Database health monitoring
let connectionHealth = {
  isConnected: false,
  lastHealthCheck: 0,
  connectionCount: 0,
  errorCount: 0
};

// Health check function
export async function checkDatabaseHealth(): Promise<{
  isHealthy: boolean;
  latency: number;
  connectionCount: number;
  errorCount: number;
  lastCheck: number;
}> {
  const startTime = Date.now();
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - startTime;
    
    connectionHealth = {
      isConnected: true,
      lastHealthCheck: Date.now(),
      connectionCount: connectionHealth.connectionCount + 1,
      errorCount: connectionHealth.errorCount
    };
    
    return {
      isHealthy: true,
      latency,
      connectionCount: connectionHealth.connectionCount,
      errorCount: connectionHealth.errorCount,
      lastCheck: connectionHealth.lastHealthCheck
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    
    connectionHealth = {
      isConnected: false,
      lastHealthCheck: Date.now(),
      connectionCount: connectionHealth.connectionCount,
      errorCount: connectionHealth.errorCount + 1
    };
    
    console.error('Database health check failed:', error);
    
    return {
      isHealthy: false,
      latency,
      connectionCount: connectionHealth.connectionCount,
      errorCount: connectionHealth.errorCount,
      lastCheck: connectionHealth.lastHealthCheck
    };
  }
}

// Connection metrics
export function getConnectionMetrics(): {
  isConnected: boolean;
  connectionCount: number;
  errorCount: number;
  lastHealthCheck: number;
  uptime: number;
} {
  return {
    ...connectionHealth,
    uptime: process.uptime()
  };
}

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