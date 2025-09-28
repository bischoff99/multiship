# Troubleshooting Guide

This guide provides solutions to common issues encountered with the Multiship platform.

## 🚨 Quick Reference

### Emergency Contacts
- **DevOps On-call**: Check PagerDuty schedule
- **Security Issues**: security@multiship.com
- **Critical Outages**: emergency@multiship.com

### Status Pages
- **Multiship Status**: [status.multiship.com](https://status.multiship.com)
- **Provider Status**: [easypost.com/status](https://easypost.com/status), [goshippo.com/status](https://goshippo.com/status)

## 🔍 Common Issues

### API Issues

#### "Invalid API Key" Error
**Symptoms**: `401 Unauthorized` responses
**Possible Causes**:
- Incorrect API key
- Account suspended
- Key expired
- Wrong environment (test vs production)

**Solutions**:
```bash
# Verify API key format
echo "sk_test_..." | grep -E "^sk_(test|live)_[a-zA-Z0-9]{32}$"

# Check account status
curl https://api.multiship.com/api/account/status \
  -H "Authorization: Bearer YOUR_API_KEY"

# Test with different key
curl https://api.multiship.com/health \
  -H "Authorization: Bearer YOUR_NEW_API_KEY"
```

#### Rate Limiting
**Symptoms**: `429 Too Many Requests`
**Solutions**:
```bash
# Check rate limit headers
curl -v https://api.multiship.com/api/orders \
  -H "Authorization: Bearer YOUR_API_KEY" \
  2>&1 | grep -i "x-ratelimit"

# Implement exponential backoff
const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
await new Promise(resolve => setTimeout(resolve, delay));
```

#### Timeout Errors
**Symptoms**: `504 Gateway Timeout` or `408 Request Timeout`
**Solutions**:
```bash
# Check provider response times
curl https://api.multiship.com/api/providers/health

# Increase timeout settings
curl https://api.multiship.com/api/shipments \
  -H "Authorization: Bearer YOUR_API_KEY" \
  --max-time 60 \
  --connect-timeout 10
```

### Provider Issues

#### EasyPost Connection Failures
**Symptoms**: EasyPost API calls failing
**Diagnosis**:
```bash
# Check EasyPost health
curl https://api.multiship.com/api/providers/easypost/health

# Test direct API call
curl https://api.easypost.com/v2/addresses \
  -H "Authorization: Bearer YOUR_EASYPOST_KEY"
```

**Solutions**:
1. Verify EasyPost API key is active
2. Check EasyPost account balance
3. Review EasyPost rate limits
4. Enable fallback providers

#### Shippo Integration Issues
**Symptoms**: Shippo rate requests failing
**Solutions**:
1. Verify Shippo credentials in environment
2. Check Shippo account status
3. Review Shippo API documentation
4. Test with Shippo sandbox

### Database Issues

#### Connection Pool Exhaustion
**Symptoms**: `Connection timeout` errors
**Diagnosis**:
```sql
-- Check active connections
SELECT count(*) from pg_stat_activity;

-- Check connection pool status
SELECT * FROM pg_stat_database WHERE datname = 'multiship';
```

**Solutions**:
```bash
# Restart database connections
kubectl rollout restart deployment/api

# Scale database resources
kubectl scale deployment/database --replicas=2
```

#### Slow Queries
**Symptoms**: API responses > 2 seconds
**Diagnosis**:
```sql
-- Find slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

**Solutions**:
1. Add database indexes
2. Optimize query patterns
3. Implement query result caching
4. Scale database resources

### Cache Issues

#### Redis Connection Failures
**Symptoms**: Cache operations timing out
**Diagnosis**:
```bash
# Test Redis connectivity
redis-cli ping

# Check Redis memory usage
redis-cli info memory
```

**Solutions**:
```bash
# Restart Redis
docker-compose restart redis

# Clear cache if corrupted
redis-cli flushall
```

#### Cache Invalidation Issues
**Symptoms**: Stale data being returned
**Solutions**:
```typescript
// Manual cache invalidation
await cacheManager.invalidate('shipment', shipmentId);

// Clear entire namespace
await cacheManager.clearNamespace('orders');

// Force cache refresh
await cacheManager.refresh('provider', 'easypost');
```

### Frontend Issues

#### Build Failures
**Symptoms**: `pnpm build` fails
**Solutions**:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
pnpm install

# Clear Next.js cache
rm -rf .next
pnpm build

# Check for TypeScript errors
pnpm type-check
```

#### Runtime Errors
**Symptoms**: Application crashes or white screens
**Solutions**:
```bash
# Check browser console for errors
# Verify API endpoints are accessible
curl https://api.multiship.com/health

# Check for CORS issues
curl -H "Origin: http://localhost:3000" \
  -X OPTIONS \
  https://api.multiship.com/api/shipments
```

## 🛠️ Debugging Tools

### Log Analysis
```bash
# Check application logs
kubectl logs -l app=api --tail=100

# Filter by correlation ID
kubectl logs -l app=api | grep "correlation-id-123"

# Check specific time range
kubectl logs -l app=api --since=1h --until=30m
```

### Database Debugging
```bash
# Connect to database
kubectl exec deployment/database -- psql -U multiship multiship

# Check for deadlocks
SELECT * FROM pg_stat_activity WHERE state = 'active';

# Analyze query performance
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 123;
```

### Network Debugging
```bash
# Test API endpoint connectivity
curl -v https://api.multiship.com/api/shipments/123

# Check DNS resolution
nslookup api.multiship.com

# Test SSL certificate
openssl s_client -connect api.multiship.com:443
```

## 📊 Performance Issues

### High Response Times
**Symptoms**: API calls taking > 2 seconds
**Diagnosis**:
1. Check provider response times
2. Monitor database query performance
3. Review cache hit rates
4. Check system resource usage

**Solutions**:
```bash
# Check system resources
kubectl top pods

# Monitor cache performance
curl https://api.multiship.com/api/metrics/cache

# Check database performance
curl https://api.multiship.com/api/metrics/database
```

### Memory Leaks
**Symptoms**: Increasing memory usage over time
**Diagnosis**:
```bash
# Check memory usage
kubectl top pods --sort-by=memory

# Analyze heap usage
curl https://api.multiship.com/api/metrics/memory
```

**Solutions**:
1. Restart affected pods
2. Review code for memory leaks
3. Optimize database queries
4. Implement proper garbage collection

### CPU Spikes
**Symptoms**: High CPU usage causing slow responses
**Diagnosis**:
```bash
# Check CPU usage by pod
kubectl top pods --sort-by=cpu

# Monitor CPU over time
kubectl top pods --use-protocol-buffers
```

**Solutions**:
1. Scale horizontally
2. Optimize expensive operations
3. Implement caching
4. Review and optimize database queries

## 🔒 Security Issues

### Unauthorized Access
**Symptoms**: Authentication failures or suspicious activity
**Response**:
1. **Immediate**: Revoke compromised credentials
2. **Investigation**: Review access logs
3. **Notification**: Alert security team
4. **Recovery**: Issue new credentials

### Data Exposure
**Symptoms**: Sensitive data appearing in logs or responses
**Response**:
1. **Immediate**: Remove exposed data
2. **Investigation**: Trace source of exposure
3. **Fix**: Implement proper data sanitization
4. **Prevention**: Add data classification

## 🌐 Infrastructure Issues

### Kubernetes Issues
**Symptoms**: Pods failing to start or crashing
**Diagnosis**:
```bash
# Check pod status
kubectl get pods

# Describe pod issues
kubectl describe pod problematic-pod-name

# Check pod logs
kubectl logs problematic-pod-name
```

**Solutions**:
```bash
# Restart deployment
kubectl rollout restart deployment/api

# Scale deployment
kubectl scale deployment/api --replicas=3

# Update deployment image
kubectl set image deployment/api api=multiship-api:v2.1.0
```

### Docker Issues
**Symptoms**: Container build or runtime failures
**Solutions**:
```bash
# Clean up Docker resources
docker system prune -a

# Rebuild containers
docker-compose build --no-cache

# Restart all services
docker-compose down && docker-compose up -d
```

## 📝 Issue Reporting Template

When reporting issues, please include:

### Technical Issues
```markdown
## Issue Description
Brief description of the problem

## Environment
- Environment: [production/staging/development]
- Version: [API version]
- Browser: [if applicable]
- OS: [if applicable]

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Error Messages
```
Paste any error messages here
```

## Additional Context
- Frequency: How often does this occur?
- Impact: How severe is the issue?
- Workarounds: Any temporary solutions?
```

### Feature Requests
```markdown
## Feature Description
Describe the feature and its benefits

## Use Case
How would this feature be used?

## Implementation Suggestions
Any ideas on how to implement?

## Alternatives Considered
Other solutions you've considered

## Priority
- [ ] Low
- [ ] Medium
- [ ] High
- [ ] Critical
```

## 🚀 Escalation Procedures

### Severity Levels

#### Critical (P0)
- **Examples**: Complete service outage, data loss, security breach
- **Response Time**: < 15 minutes
- **Escalation**: All team members, emergency contacts

#### High (P1)
- **Examples**: Major functionality broken, performance severely degraded
- **Response Time**: < 1 hour
- **Escalation**: On-call engineer, team leads

#### Medium (P2)
- **Examples**: Minor functionality broken, performance issues
- **Response Time**: < 4 hours
- **Escalation**: On-call engineer

#### Low (P3)
- **Examples**: Cosmetic issues, minor improvements
- **Response Time**: < 24 hours
- **Escalation**: Development team

## 📞 Support Resources

### Internal Resources
- **Runbooks**: [Internal Wiki](https://wiki.multiship.com/runbooks)
- **Monitoring**: [Grafana Dashboard](https://monitoring.multiship.com)
- **Logs**: [ELK Stack](https://logs.multiship.com)

### External Resources
- **Provider Documentation**:
  - [EasyPost Docs](https://docs.easypost.com)
  - [Shippo Docs](https://docs.goshippo.com)
  - [Veeqo Docs](https://docs.veeqo.com)
- **Community**: [Stack Overflow](https://stackoverflow.com/questions/tagged/multiship)

## 🔧 Maintenance Windows

### Scheduled Maintenance
- **Time**: Sundays 2:00-4:00 AM UTC
- **Duration**: < 2 hours
- **Notification**: 48 hours advance notice
- **Communication**: Status page and email notifications

### Emergency Maintenance
- **Trigger**: Critical security issues or data loss
- **Duration**: As needed
- **Notification**: Immediate via all channels
- **Approval**: On-call engineer or above

---

*This troubleshooting guide is continuously updated based on common issues and their resolutions.*