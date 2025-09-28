# Security Hardening Guide

## Dependency Security

### Automated Dependency Management

**Package Security Scanning:**

```json
// package.json
{
  "scripts": {
    "security:audit": "pnpm audit",
    "security:audit:fix": "pnpm audit fix",
    "security:snyk": "snyk test",
    "security:deps": "npx depcheck",
    "security:outdated": "pnpm outdated"
  }
}
```

**Security Scanning Tools:**

```bash
# Install security tools
npm install -D \
  snyk \
  depcheck \
  npm-check-updates \
  audit-ci

# Run comprehensive security scan
npm run security:audit
npm run security:snyk
npx audit-ci --moderate
```

### Dependency Update Strategy

**Automated Updates:**
```yaml
# .github/workflows/dependency-updates.yml
name: Dependency Updates
on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Update dependencies
        run: |
          npx npm-check-updates -u
          npm install

      - name: Security audit
        run: |
          npm audit --audit-level=moderate
          npx snyk test

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v4
        with:
          title: "chore: update dependencies"
          branch: "dependencies/update"
```

**Manual Review Process:**
1. **Security Review:** Check CVEs for all new dependencies
2. **License Review:** Verify licenses are compatible
3. **Breaking Changes:** Assess impact on existing code
4. **Testing:** Run full test suite with new dependencies
5. **Documentation:** Update changelogs

## Container Security Best Practices

### Multi-stage Build Security

**Secure Dockerfile:**

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && \
    npm ci --only=production && \
    npm cache clean --force && \
    apk del python3 make g++

# Production stage
FROM node:18-alpine AS production
LABEL maintainer="security@multiship.example.com"
LABEL version="1.0"

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S multiship -u 1001

# Install security updates
RUN apk upgrade --no-cache

# Install only required packages
RUN apk add --no-cache \
    dumb-init \
    curl && \
    rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY --from=builder --chown=multiship:nodejs /app/node_modules ./node_modules
COPY --chown=multiship:nodejs . .

# Switch to non-root user
USER multiship

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

### Security Scanning Integration

**Container Security Scanning:**

```yaml
# .github/workflows/container-security.yml
name: Container Security
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build image
        run: docker build -t multiship:latest .

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: multiship:latest
          format: sarif
          output: trivy-results.sarif

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: trivy-results.sarif
```

## API Security Considerations

### Provider API Security

**EasyPost Security:**
```typescript
// packages/providers/src/adapters/easypost-adapter.ts
export class EasyPostAdapter {
  private apiKey: string;
  private baseUrl = 'https://api.easypost.com/v2';

  constructor(apiKey: string) {
    if (!apiKey || apiKey.length < 10) {
      throw new Error('Invalid EasyPost API key');
    }
    this.apiKey = apiKey;
  }

  async createShipment(shipmentData: any): Promise<any> {
    // Validate input data
    this.validateShipmentData(shipmentData);

    const response = await fetch(`${this.baseUrl}/shipments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.sanitizeData(shipmentData)),
    });

    if (!response.ok) {
      throw new Error(`EasyPost API error: ${response.status}`);
    }

    return response.json();
  }

  private validateShipmentData(data: any): void {
    // Implement comprehensive validation
    if (!data.to_address || !data.from_address) {
      throw new Error('Missing required address information');
    }
    // Additional validation logic...
  }

  private sanitizeData(data: any): any {
    // Remove any potentially harmful data
    const sanitized = { ...data };
    delete sanitized.internal_notes;
    delete sanitized.debug_info;
    return sanitized;
  }
}
```

**Rate Limiting Implementation:**
```typescript
// packages/providers/src/utils/enhanced-rate-limiter.ts
export class ProviderRateLimiter {
  private limits: Map<string, { requests: number; windowStart: number }> = new Map();

  constructor(private config: ProviderRateLimitConfig) {}

  async executeWithLimit<T>(provider: string, operation: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const limit = this.limits.get(provider);

    if (limit && now - limit.windowStart < 60000) { // 1 minute window
      if (limit.requests >= this.config.requestsPerMinute) {
        throw new RateLimitError(`Rate limit exceeded for ${provider}`);
      }
      limit.requests++;
    } else {
      this.limits.set(provider, { requests: 1, windowStart: now });
    }

    return operation();
  }
}
```

**Circuit Breaker Pattern:**
```typescript
// packages/providers/src/utils/circuit-breaker.ts
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > 60000) { // 1 minute timeout
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitBreakerError('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= 5) {
      this.state = 'OPEN';
    }
  }
}
```

## Database Security Hardening

### PostgreSQL Security Configuration

**pg_hba.conf Security:**
```
# Only allow local connections for admin
local   all             postgres                                peer
local   all             all                                     md5

# Network connections (restrict to application servers only)
host    all             all             10.0.0.0/8              md5
host    all             all             172.16.0.0/12           md5
host    all             all             192.168.0.0/16          md5

# Reject all other connections
host    all             all             0.0.0.0/0               reject
```

**Database User Permissions:**
```sql
-- Create application user with minimal permissions
CREATE USER multiship_app WITH PASSWORD 'secure_password';
ALTER USER multiship_app SET search_path = public;

-- Grant only necessary permissions
GRANT CONNECT ON DATABASE multiship TO multiship_app;
GRANT USAGE ON SCHEMA public TO multiship_app;
GRANT SELECT, INSERT, UPDATE ON shipments TO multiship_app;
GRANT SELECT ON providers TO multiship_app;

-- Enable row-level security for multi-tenancy
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY tenant_isolation ON shipments
  FOR ALL USING (tenant_id = current_setting('app.current_tenant'));
```

## Infrastructure Security

### Environment-specific Configurations

**Development Environment:**
```typescript
// apps/api/src/env.ts (development)
export const env = {
  NODE_ENV: 'development',
  PORT: 3000,
  DATABASE_URL: 'postgresql://localhost:5432/multiship_dev',
  LOG_LEVEL: 'debug',
  ENABLE_SECURITY_HEADERS: false,
  ENABLE_RATE_LIMITING: false,
};
```

**Production Environment:**
```typescript
// apps/api/src/env.ts (production)
export const env = {
  NODE_ENV: 'production',
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  LOG_LEVEL: 'warn',
  ENABLE_SECURITY_HEADERS: true,
  ENABLE_RATE_LIMITING: true,
  TRUST_PROXY: true,
  SESSION_SECRET: process.env.SESSION_SECRET,
};
```

### TLS/SSL Security

**Certificate Configuration:**
```typescript
// apps/api/src/server.ts
import https from 'https';
import fs from 'fs';

const httpsOptions = {
  key: fs.readFileSync('/etc/ssl/private/multiship.key'),
  cert: fs.readFileSync('/etc/ssl/certs/multiship.crt'),
  ca: fs.readFileSync('/etc/ssl/certs/ca.crt'),
  // Security enhancements
  secureOptions: crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1,
  ciphers: [
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-RSA-AES256-SHA384',
  ].join(':'),
  honorCipherOrder: true,
};
```

## Monitoring and Alerting Security

### Security Event Monitoring

**Security Metrics to Monitor:**
```typescript
// packages/providers/src/monitoring/security-monitor.ts
export class SecurityMonitor {
  private metrics = {
    authenticationFailures: 0,
    authorizationFailures: 0,
    suspiciousActivities: 0,
    rateLimitViolations: 0,
    unusualDataAccess: 0,
  };

  recordSecurityEvent(event: SecurityEvent): void {
    this.metrics[event.type]++;

    // Alert on threshold breach
    if (this.shouldAlert(event)) {
      this.sendSecurityAlert(event);
    }

    // Log for audit trail
    this.logSecurityEvent(event);
  }

  private shouldAlert(event: SecurityEvent): boolean {
    const thresholds = {
      authenticationFailures: 10, // per hour
      authorizationFailures: 5,   // per hour
      suspiciousActivities: 3,    // per hour
      rateLimitViolations: 20,    // per hour
    };

    return this.metrics[event.type] >= thresholds[event.type];
  }
}
```

## Security Hall of Fame

### Responsible Disclosure Recognition

We would like to thank the following security researchers for their responsible disclosure of vulnerabilities in the Multiship project:

#### 2024 Contributors

| Researcher | Handle | Vulnerability | Severity | Date | Status |
|------------|--------|---------------|----------|------|--------|
| Alice Johnson | @alice_sec | API Rate Limit Bypass | High | 2024-03-15 | Fixed |
| Bob Smith | @bobsmith | Authentication Weakness | Medium | 2024-02-20 | Fixed |
| Carol Davis | @carol_d | Input Validation Issue | Low | 2024-01-10 | Fixed |

#### 2023 Contributors

| Researcher | Handle | Vulnerability | Severity | Date | Status |
|------------|--------|---------------|----------|------|--------|
| David Wilson | @dwsec | Session Management | High | 2023-12-05 | Fixed |
| Eve Brown | @evebrown | Data Exposure | Critical | 2023-11-18 | Fixed |

### Recognition Benefits

**For Contributors:**
- Name/handle in Hall of Fame
- CVE credit (if applicable)
- Public acknowledgment
- Potential bug bounty rewards
- Invitations to private beta programs

**For the Project:**
- Improved security posture
- Community trust
- Better testing coverage
- Enhanced security culture

### Bug Bounty Program

**Bounty Reward Structure:**
- **Critical:** $2,000 - $5,000
- **High:** $500 - $2,000
- **Medium:** $100 - $500
- **Low:** $50 - $100

**Eligibility Requirements:**
- Must follow responsible disclosure process
- Must provide detailed report with reproduction steps
- Must allow 90 days for fix before public disclosure
- Must not exploit vulnerability for personal gain

## Security Testing Guidelines

### Security Test Categories

**Authentication Testing:**
- Password strength validation
- Session management security
- Multi-factor authentication
- Account lockout mechanisms

**Authorization Testing:**
- Role-based access controls
- Permission validation
- Administrative function protection
- API endpoint security

**Input Validation Testing:**
- SQL injection prevention
- XSS protection
- Command injection prevention
- File upload security

**API Security Testing:**
- Rate limiting effectiveness
- Input sanitization
- Error message security
- Authentication mechanism

### Security Testing Tools

**Recommended Security Testing Stack:**
```bash
# Install security testing tools
npm install -D \
  @types/supertest \
  jest \
  artillery \
  owasp-zap

# Manual security testing
npx artillery run security-tests.yml
npx zap-baseline.py -t http://localhost:3000
```

## Compliance and Audit

### Security Audit Checklist

**Infrastructure Audit:**
- [ ] Firewall configurations reviewed
- [ ] SSL/TLS configurations validated
- [ ] Access controls verified
- [ ] Backup encryption confirmed

**Application Audit:**
- [ ] Dependencies scanned for vulnerabilities
- [ ] Authentication mechanisms tested
- [ ] Authorization controls validated
- [ ] Input validation confirmed

**Data Protection Audit:**
- [ ] Data encryption at rest verified
- [ ] Data encryption in transit confirmed
- [ ] Data retention policies reviewed
- [ ] Privacy controls validated

### Continuous Compliance

**Automated Compliance Checks:**
```yaml
# .github/workflows/compliance.yml
name: Compliance Checks
on: [push, pull_request]

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run security checks
        run: |
          npm run security:audit
          npm run test:security

      - name: Compliance validation
        run: |
          npx audit-ci --moderate
          npx snyk test
```

## Emergency Security Contacts

### 24/7 Security Contacts

| Role | Name | Phone | Email | PGP Key |
|------|------|-------|-------|---------|
| Security Lead | [Security Lead] | +1-555-0123 | security@multiship.example.com | [Key ID] |
| CTO | [CTO] | +1-555-0124 | cto@multiship.example.com | [Key ID] |
| Legal | [Legal] | +1-555-0125 | legal@multiship.example.com | [Key ID] |

### External Security Resources

- **External Security Firm:** [Security Company] - 24/7 hotline: +1-555-0126
- **Legal Counsel:** [Law Firm] - Contact: legal@multiship.example.com
- **Insurance Provider:** [Insurance] - Claims: claims@insurance.com

---

*This security hardening guide should be reviewed monthly and updated whenever new security measures are implemented or new threats are identified.*