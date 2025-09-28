# Deployment Guide

This guide covers deployment strategies and procedures for the Multiship platform across different environments.

## 🌍 Deployment Environments

### Development Environment
- **URL**: `dev.multiship.internal`
- **Purpose**: Feature development and testing
- **Data**: Ephemeral, can be reset
- **Monitoring**: Basic logging and error tracking
- **Backups**: Not required

### Staging Environment
- **URL**: `staging.multiship.internal`
- **Purpose**: Pre-production testing and validation
- **Data**: Production-like data, refreshed weekly
- **Monitoring**: Full monitoring stack
- **Backups**: Daily snapshots

### Production Environment
- **URL**: `api.multiship.com`
- **Purpose**: Live customer traffic
- **Data**: Real customer data
- **Monitoring**: Full observability and alerting
- **Backups**: Real-time replication and daily backups

## 🚀 Deployment Strategies

### Blue-Green Deployment
```mermaid
graph TB
    A[Load Balancer] --> B[Blue Environment]
    A --> C[Green Environment]

    B --> D[Database]
    C --> D

    E[Deploy to Green] --> F[Health Checks]
    F --> G[Switch Traffic]
    G --> H[Blue Environment]
```

**Process:**
1. Deploy new version to inactive environment (Green)
2. Run comprehensive health checks
3. Switch load balancer traffic to Green
4. Keep Blue environment as instant rollback option
5. Remove old version after successful deployment

### Canary Deployment
```mermaid
graph TB
    A[Load Balancer] --> B[Route 90% to Stable]
    A --> C[Route 10% to Canary]

    B --> D[Production API v2.1]
    C --> E[Production API v2.2]

    F[Monitor Metrics] --> G{Success?}
    G -->|Yes| H[Increase Canary Traffic]
    G -->|No| I[Rollback Canary]
```

**Process:**
1. Deploy new version with minimal traffic (5-10%)
2. Monitor error rates and performance metrics
3. Gradually increase traffic if metrics are good
4. Rollback immediately if issues detected

## 🛠️ Deployment Tools

### CI/CD Pipeline
- **Platform**: GitHub Actions
- **Configuration**: `.github/workflows/`
- **Triggers**: Push to main, pull request merges, manual dispatch

### Container Registry
- **Primary**: AWS ECR (Elastic Container Registry)
- **Backup**: Docker Hub
- **Security**: Image scanning and vulnerability assessment

### Infrastructure as Code
- **Tool**: Terraform
- **State**: Stored in AWS S3 with DynamoDB locking
- **Modules**: Reusable infrastructure components

## 📋 Pre-deployment Checklist

### Code Quality
- [ ] All tests pass
- [ ] Code coverage >90%
- [ ] No linting errors
- [ ] Security scan passed
- [ ] Dependencies updated

### Documentation
- [ ] API documentation updated
- [ ] Migration guide created (for breaking changes)
- [ ] Release notes written
- [ ] Runbooks updated

### Database Changes
- [ ] Database migrations tested
- [ ] Backup strategy verified
- [ ] Rollback plan documented
- [ ] Data migration scripts ready

### Infrastructure Changes
- [ ] Infrastructure changes tested in staging
- [ ] Resource limits reviewed
- [ ] Scaling policies updated
- [ ] Monitoring alerts configured

## 🚀 Deployment Process

### Automated Deployment

#### 1. Version Tagging
```bash
# Create release branch
git checkout -b release/v2.2.0

# Update version numbers
# Commit changes
git add .
git commit -m "chore: bump version to v2.2.0"

# Create git tag
git tag -a v2.2.0 -m "Release version 2.2.0"

# Push changes
git push origin release/v2.2.0 --tags
```

#### 2. CI/CD Pipeline Execution
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production
on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build and test
        run: |
          pnpm install
          pnpm test
          pnpm build

      - name: Build Docker image
        run: docker build -t multiship-api:${{ github.ref_name }}

      - name: Push to registry
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin ${{ secrets.ECR_REPO }}
          docker tag multiship-api:${{ github.ref_name }} ${{ secrets.ECR_REPO }}/multiship-api:${{ github.ref_name }}
          docker push ${{ secrets.ECR_REPO }}/multiship-api:${{ github.ref_name }}

      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/api api=${{ secrets.ECR_REPO }}/multiship-api:${{ github.ref_name }}
          kubectl rollout status deployment/api
```

#### 3. Health Verification
```bash
# Check deployment status
kubectl rollout status deployment/api

# Verify health endpoint
curl -f https://api.multiship.com/health

# Check logs for errors
kubectl logs -l app=api --tail=100
```

### Manual Deployment

#### Database Migrations
```bash
# Deploy database changes
kubectl exec deployment/database-migrator -- \
  pnpm db:migrate:deploy

# Verify migration success
kubectl exec deployment/api -- \
  curl -f https://api.multiship.com/health/database
```

#### Feature Flags
```bash
# Enable new feature
curl -X POST https://api.multiship.com/admin/features \
  -H "Authorization: Bearer ${{ secrets.ADMIN_TOKEN }}" \
  -d '{"feature": "new-shipment-tracking", "enabled": true}'

# Monitor feature usage
curl https://api.multiship.com/admin/features/analytics
```

## 🔍 Post-deployment Verification

### Application Health
```bash
# Basic health check
curl -f https://api.multiship.com/health

# Detailed health check
curl -f https://api.multiship.com/api/health/detailed

# Database connectivity
curl -f https://api.multiship.com/api/health/database

# Provider connectivity
curl -f https://api.multiship.com/api/providers/health
```

### Performance Metrics
```bash
# Response time check
curl -w "@curl-format.txt" -o /dev/null -s \
  https://api.multiship.com/api/orders

# Load testing
artillery run load-test.yml

# Database performance
kubectl exec deployment/database -- \
  pnpm db:performance:check
```

### Business Metrics
- Order creation rate
- Provider API response times
- Error rates by endpoint
- Cache hit rates

## 🔄 Rollback Procedures

### Immediate Rollback (Critical Issues)
```bash
# Rollback to previous version
kubectl rollout undo deployment/api

# Verify rollback
kubectl rollout status deployment/api
curl -f https://api.multiship.com/health
```

### Gradual Rollback (Performance Issues)
```bash
# Scale down problematic version
kubectl scale deployment api --replicas=0

# Scale up stable version
kubectl scale deployment api-stable --replicas=5

# Update load balancer
kubectl patch service api-service -p '{"spec":{"selector":{"version":"stable"}}}'
```

### Database Rollback
```bash
# ⚠️ WARNING: This is destructive and should be used carefully
kubectl exec deployment/database-rollback -- \
  pnpm db:migrate:rollback --to-version=20240101_120000
```

## 📊 Monitoring and Alerting

### Key Metrics to Monitor

#### Application Metrics
- **Response Time**: P95 < 500ms
- **Error Rate**: < 0.1%
- **Throughput**: Orders per minute
- **CPU Usage**: < 70%
- **Memory Usage**: < 80%

#### Provider Metrics
- **EasyPost Success Rate**: > 99.5%
- **Shippo Response Time**: < 1000ms
- **Veeqo Error Rate**: < 0.5%

#### Database Metrics
- **Query Performance**: Slow queries < 5%
- **Connection Pool**: Utilization < 80%
- **Replication Lag**: < 100ms

### Alert Configuration

#### Critical Alerts
- API unavailable for > 2 minutes
- Database connection failures
- Provider API failures
- Error rate > 1%

#### Warning Alerts
- Response time > 1000ms
- CPU usage > 80%
- Memory usage > 85%
- Disk usage > 75%

## 🔧 Environment Configuration

### Environment Variables by Environment

#### Development
```env
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=postgresql://dev:dev@localhost:5432/multiship_dev
REDIS_URL=redis://localhost:6379/1
```

#### Staging
```env
NODE_ENV=staging
LOG_LEVEL=info
DATABASE_URL=postgresql://staging:***@db-staging:5432/multiship_staging
REDIS_URL=redis://redis-staging:6379/2
```

#### Production
```env
NODE_ENV=production
LOG_LEVEL=warn
DATABASE_URL=postgresql://prod:***@db-prod:5432/multiship_prod
REDIS_URL=redis://redis-prod:6379/3
```

### Secrets Management
- **Tool**: AWS Secrets Manager
- **Rotation**: Automatic key rotation
- **Access**: IAM role-based access
- **Encryption**: AES-256 encryption at rest

## 🗄️ Database Deployment

### Schema Changes
```bash
# 1. Create migration file
pnpm prisma:migrate:dev --name "add_user_preferences"

# 2. Test migration
pnpm db:test:migration

# 3. Deploy to staging
kubectl exec deployment/api-staging -- \
  pnpm prisma:migrate:deploy

# 4. Verify in staging
curl -f https://staging.multiship.com/health/database

# 5. Deploy to production
kubectl exec deployment/api -- \
  pnpm prisma:migrate:deploy
```

### Data Migration Scripts
```typescript
// Example data migration script
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateUserPreferences() {
  // Migration logic
  const users = await prisma.user.findMany({
    where: { preferences: null }
  });

  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        preferences: {
          emailNotifications: true,
          smsNotifications: false
        }
      }
    });
  }
}
```

## 🌐 Frontend Deployment

### Build Process
```bash
# Build for production
pnpm --filter @multiship/web build

# Build for staging
NEXT_PUBLIC_API_URL=https://staging.multiship.com/api \
  pnpm --filter @multiship/web build
```

### CDN Deployment
```bash
# Sync static assets to CDN
aws s3 sync apps/web/.next/static s3://multiship-cdn/static --cache-control max-age=31536000

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id ${{ secrets.CDN_DISTRIBUTION_ID }} --paths "/*"
```

## 🧪 Testing in Production

### Smoke Tests
```bash
# Automated smoke tests
curl -f https://api.multiship.com/health
curl -f https://api.multiship.com/api/orders/test
curl -f https://multiship.com/
```

### Synthetic Monitoring
- **Tool**: Datadog Synthetic Tests
- **Frequency**: Every 5 minutes
- **Locations**: Global monitoring locations
- **Scenarios**: Key user journeys

## 📞 Emergency Procedures

### Service Outage
1. **Assess Impact**: Determine scope and severity
2. **Notify Team**: Alert on-call engineers
3. **Communicate**: Update status page and stakeholders
4. **Mitigate**: Implement immediate fixes
5. **Investigate**: Root cause analysis
6. **Restore**: Full service restoration

### Data Recovery
1. **Stop Writes**: Prevent further data corruption
2. **Assess Damage**: Identify affected data
3. **Restore from Backup**: Use most recent clean backup
4. **Verify Integrity**: Ensure data consistency
5. **Resume Operations**: Re-enable write operations

## 📚 Additional Resources

### Runbooks
- **[API Outage Runbook](./runbooks/api-outage.md)**
- **[Database Issue Runbook](./runbooks/database-issues.md)**
- **[Provider Failure Runbook](./runbooks/provider-failure.md)**

### Tools
- **Monitoring Dashboard**: Grafana at `https://monitoring.multiship.com`
- **Log Aggregation**: ELK stack at `https://logs.multiship.com`
- **Alert Management**: PagerDuty for incident response

### Contacts
- **DevOps Team**: devops@multiship.com
- **On-call**: Check PagerDuty schedule
- **Emergency**: emergency@multiship.com

---

*This deployment guide is continuously updated. Always verify procedures before executing in production environments.*