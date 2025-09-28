import { PrismaClient } from '@prisma/client';

export interface DatabaseConfig {
  maxConnections: number;
  connectionTimeout: number;
  queryTimeout: number;
  enableLogging: boolean;
  logLevel: 'query' | 'info' | 'warn' | 'error';
}

export class DatabaseUtils {
  private static instance: DatabaseUtils;
  private prisma: PrismaClient;
  private config: DatabaseConfig;

  private constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = {
      maxConnections: 10,
      connectionTimeout: 10000,
      queryTimeout: 30000,
      enableLogging: process.env.NODE_ENV === 'development',
      logLevel: 'query',
      ...config
    };

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });

    // Simple console logger
    const log = (level: string, message: string, data?: any) => {
      console.log(`[${level.toUpperCase()}] [DATABASE] ${message}`, data || '');
    };

    // Logging disabled for now due to TypeScript compatibility issues
    // if (this.config.enableLogging) {
    //   this.prisma.$on('query', (e: any) => {
    //     log('debug', 'Database query', {
    //       query: e.query,
    //       params: e.params,
    //       duration: e.duration,
    //       target: e.target
    //     });
    //   });
    // }
  }

  static getInstance(config?: Partial<DatabaseConfig>): DatabaseUtils {
    if (!DatabaseUtils.instance) {
      DatabaseUtils.instance = new DatabaseUtils(config);
    }
    return DatabaseUtils.instance;
  }

  getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * Execute a transaction with retry logic
   */
  async executeTransaction<T>(
    fn: (prisma: any) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(fn);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          console.error('Transaction failed after all retries', {
            attempt,
            maxRetries,
            error: lastError.message
          });
          break;
        }

        console.warn('Transaction retry', {
          attempt,
          maxRetries,
          error: lastError.message
        });

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
    
    throw lastError!;
  }

  /**
   * Execute a query with timeout and error handling
   */
  async executeQuery<T>(
    fn: (prisma: PrismaClient) => Promise<T>,
    operation: string,
    timeoutMs?: number
  ): Promise<T> {
    const timeout = timeoutMs || this.config.queryTimeout;
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        fn(this.prisma),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
        )
      ]);

      const duration = Date.now() - startTime;
      console.log('Query executed successfully', {
        operation,
        duration,
        timeout
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('Query execution failed', {
        operation,
        duration,
        timeout,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Batch insert with chunking
   */
  async batchInsert<T>(
    model: any,
    data: T[],
    chunkSize: number = 1000
  ): Promise<number> {
    if (data.length === 0) return 0;

    const chunks = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }

    let totalInserted = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        await model.createMany({
          data: chunk,
          skipDuplicates: true
        });
        totalInserted += chunk.length;

        console.log('Batch insert chunk completed', {
          chunk: i + 1,
          totalChunks: chunks.length,
          chunkSize: chunk.length,
          totalInserted
        });
      } catch (error) {
        console.error('Batch insert chunk failed', {
          chunk: i + 1,
          totalChunks: chunks.length,
          chunkSize: chunk.length,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }

    return totalInserted;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      console.log('Database connection closed');
    } catch (error) {
      console.error('Error closing database connection', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export default DatabaseUtils;