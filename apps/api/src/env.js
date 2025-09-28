import { config } from 'dotenv';

// Load environment variables
config({ path: '../../.env' });

export const cfg = {
  port: parseInt(process.env.API_PORT || '4000', 10),
  token: process.env.API_TOKEN || 'dev-token',
  epSecret: process.env.EASYPOST_WEBHOOK_SECRET || 'your_hmac_secret',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/multiship?schema=public',
  easypostApiKey: process.env.EASYPOST_API_KEY || 'your_easypost_key',
  shippoApiKey: process.env.SHIPPO_API_KEY || 'shippo_test_xxx',
  veeqoApiKey: process.env.VEEQO_API_KEY || 'veeqo_api_key_here',
  veeqoApiBase: process.env.VEEQO_API_BASE || 'https://api.veeqo.com',
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:4000',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  nodeEnv: process.env.NODE_ENV || 'development',
  // Cache configuration
  cacheEnabled: process.env.CACHE_ENABLED === 'true',
  cacheProvider: process.env.CACHE_PROVIDER || 'memory',
  cacheMemoryMaxSize: parseInt(process.env.CACHE_MEMORY_MAX_SIZE || '1000', 10),
  cacheMemoryDefaultTtl: parseInt(process.env.CACHE_MEMORY_DEFAULT_TTL || '300000', 10),
  // Redis configuration
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD || '',
  redisDb: parseInt(process.env.REDIS_DB || '0', 10),
  redisKeyPrefix: process.env.REDIS_KEY_PREFIX || 'multiship:cache:'
};