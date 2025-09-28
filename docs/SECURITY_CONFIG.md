# Security Configuration Guide

## Overview

This document provides comprehensive security configuration guidelines for the Multiship project, covering infrastructure security, dependency management, container security, and API security considerations.

## Infrastructure Security

### Environment Variables

**Required Security Environment Variables:**

```bash
# Database
DATABASE_URL="postgresql://user:secure_password@localhost:5432/multiship"

# Redis (for caching)
REDIS_URL="redis://:secure_password@localhost:6379"

# Provider API Keys (store securely)
EASYPOST_API_KEY="ep_..."
SHIPPO_API_KEY="shippo_..."
VEEQO_API_KEY="vq_..."

# JWT Secrets
JWT_SECRET="your-super-secure-jwt-secret-here"
JWT_REFRESH_SECRET="your-super-secure-refresh-secret-here"

# Encryption Keys
ENCRYPTION_KEY="32-character-encryption-key"
```

### Secret Management

**Recommended Secret Management Solutions:**
- **AWS Secrets Manager** (recommended for production)
- **Azure Key Vault**
- **HashiCorp Vault**
- **Kubernetes Secrets** (for container deployments)

**Secret Rotation Policy:**
- API keys: Rotate every 90 days
- JWT secrets: Rotate every 180 days
- Database passwords: Rotate every 90 days
- Encryption keys: Rotate annually

## Dependency Security

### Package Management Security

**pnpm Configuration:**

```json
{
  "pnpm": {
    "audit": true,
    "auditLevel": "high",
    "strictPeerDependencies": true
  }
}
```

**Security Audit Commands:**
```bash
# Run security audit
pnpm audit

# Fix vulnerabilities automatically
pnpm audit fix

# Only show high/critical vulnerabilities
pnpm audit --audit-level high
```

### Dependency Scanning

**Automated Tools:**
- **npm audit** - Built-in vulnerability scanning
- **Snyk** - Comprehensive vulnerability management
- **OWASP Dependency-Check** - Static analysis
- **Trivy** - Container image scanning

**CI/CD Integration:**
```yaml
# .github/workflows/security.yml
- name: Security Scan
  run: |
    npm audit --audit-level=high
    npx @snyk/cli test
```

## Container Security

### Docker Security Best Practices

**Base Image Security:**
```dockerfile
# Use official, minimal base images
FROM node:18-alpine AS base

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S multiship -u 1001

# Install security updates
RUN apk upgrade --no-cache

# Remove unnecessary packages
RUN apk add --no-cache dumb-init
```

**Multi-stage Build:**
```dockerfile
# Development stage
FROM base AS development
USER multiship
COPY --chown=multiship:nodejs package*.json ./
RUN npm ci --only=development
COPY --chown=multiship:nodejs . .
CMD ["npm", "run", "dev"]

# Production stage
FROM base AS production
USER multiship
ENV NODE_ENV=production
COPY --chown=multiship:nodejs package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --chown=multiship:nodejs . .
CMD ["dumb-init", "node", "dist/index.js"]
```

### Docker Compose Security

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=100m
    cap_drop:
      - ALL
    user: "1001:1001"

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - db_data:/var/lib/postgresql/data
    command: postgres -c log_statement=all -c log_min_duration_statement=1000

secrets:
  db_password:
    external: true

volumes:
  db_data:
    driver_opts:
      type: none
      o: bind
      device: /secure/path/postgres/data
```

## API Security Configuration

### Rate Limiting

**Global Rate Limiting:**
```typescript
// src/middleware/security.ts
import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
```

**Provider-Specific Rate Limiting:**
```typescript
// packages/providers/src/config/rate-limit-config.ts
export const providerRateLimits = {
  easypost: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
  shippo: {
    requestsPerMinute: 300,
    burstLimit: 50,
  },
  veeqo: {
    requestsPerHour: 1000,
    burstLimit: 100,
  },
};
```

### CORS Configuration

```typescript
// src/middleware/security.ts
import cors from 'cors';

export const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com', 'https://www.yourdomain.com']
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
```

### Security Headers

```typescript
// src/middleware/security.ts
import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.yourdomain.com"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});
```

## Database Security

### PostgreSQL Security

**Database Configuration:**
```sql
-- Create database user with minimal privileges
CREATE USER multiship_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE multiship TO multiship_user;
GRANT USAGE ON SCHEMA public TO multiship_user;

-- Grant specific table permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO multiship_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO multiship_user;

-- Enable row level security
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
```

**Connection Security:**
```typescript
// packages/db/src/client.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query', 'error', 'warn'],
    errorFormat: 'pretty',
    datasources: {
      db: {
        url: `${process.env.DATABASE_URL}?sslmode=require&sslcert=client.crt&sslkey=client.key&sslrootcert=ca.crt`,
      },
    },
  });
```

## Redis Security

### Redis Configuration

**redis.conf:**
```conf
# Require authentication
requirepass your_secure_redis_password

# Bind to localhost only
bind 127.0.0.1 ::1

# Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
rename-command EVAL ""

# Enable AOF persistence
appendonly yes
appendfilename "redis.aof"

# Set memory limit
maxmemory 256mb
maxmemory-policy allkeys-lru
```

**Client Configuration:**
```typescript
// packages/providers/src/cache/redis-cache.ts
import Redis from 'ioredis';

export class RedisCache {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
}
```

## Monitoring and Logging Security

### Secure Logging Configuration

```typescript
// packages/providers/src/config/logging-config.ts
export const loggingConfig = {
  level: process.env.LOG_LEVEL || 'info',
  sanitizeHeaders: true,
  sanitizeFields: [
    'password',
    'token',
    'authorization',
    'api_key',
    'secret',
    'credit_card',
    'ssn',
  ],
  maskPatterns: [
    /Bearer\s+[A-Za-z0-9\-._~+/]+/g,
    /api_key["\s]*:["\s]*[A-Za-z0-9\-_]+/g,
  ],
};
```

### Security Monitoring

**Key Security Metrics to Monitor:**
- Failed authentication attempts
- Rate limit violations
- Unusual API usage patterns
- Database connection anomalies
- File system access patterns
- Network connection attempts

## Compliance Considerations

### Data Protection

**GDPR Compliance:**
- Implement data retention policies
- Provide data export capabilities
- Enable data deletion requests
- Log all data access for audit trails

**PCI DSS (if handling payments):**
- Encrypt cardholder data
- Implement access controls
- Regular security testing
- Maintain audit trails

### Audit Logging

**Required Audit Events:**
- User authentication events
- Authorization failures
- Data modification events
- Configuration changes
- System access events

## Security Testing

### Automated Security Testing

**Security Test Categories:**
- **SAST** (Static Application Security Testing)
- **DAST** (Dynamic Application Security Testing)
- **Dependency Scanning**
- **Container Security Scanning**
- **Infrastructure as Code Security**

**Recommended Tools:**
```bash
# Install security testing tools
npm install -D \
  eslint-plugin-security \
  @types/node \
  jest \
  supertest

# Run security tests
npm run test:security
npm run test:integration
```

## Emergency Procedures

### Security Incident Response

1. **Immediate Actions:**
   - Isolate affected systems
   - Preserve evidence
   - Notify security team
   - Assess impact

2. **Communication:**
   - Internal notification
   - Customer communication (if needed)
   - Regulatory reporting (if required)

3. **Recovery:**
   - Restore from clean backups
   - Apply security patches
   - Monitor for reoccurrence

### Backup Security

**Secure Backup Strategy:**
- Encrypt all backups
- Store backups offsite
- Regular backup testing
- Access logging for backup systems
- Retention policy enforcement

---

*This security configuration guide should be reviewed and updated regularly to address new threats and compliance requirements.*