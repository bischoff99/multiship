# Security Policy

## Supported Versions

| Version | Supported          | Security Updates |
|---------|--------------------|------------------|
| 2.x     | ✅ Yes            | ✅ Yes          |
| 1.x     | ❌ No             | ⚠️ Critical Only |
| < 1.0   | ❌ No             | ❌ No           |

**Security Update Policy:**
- Critical security fixes may be backported to the latest patch version of the previous minor version
- Security updates are provided for a minimum of 12 months after the release of the next major version
- End-of-life versions receive no security updates

## Reporting Security Vulnerabilities

### How to Report

**For security researchers and external contributors:**

1. **Do NOT create public GitHub issues** for security vulnerabilities
2. **Email the security team directly:** security@multiship.example.com
3. **Include "SECURITY VULNERABILITY"** in the subject line
4. **Provide detailed information** about the vulnerability:
   - Description of the vulnerability
   - Steps to reproduce
   - Affected versions
   - Potential impact
   - Suggested remediation (if known)

### Response Times

- **Acknowledgment:** Within 2 business days
- **Initial assessment:** Within 5 business days
- **Fix timeline:** Provided within 10 business days (varies by severity)

### Disclosure Policy

- We follow a **90-day disclosure timeline** for all vulnerabilities
- Security researchers will be credited in release notes (with permission)
- No public disclosure until after the fix is released
- Coordinated vulnerability disclosure is preferred

## Security Considerations for Contributors

### Code Security Requirements

- **Input validation:** All user inputs must be properly validated and sanitized
- **Authentication:** Use established authentication patterns only
- **Authorization:** Implement proper access controls for all endpoints
- **Error handling:** Do not leak sensitive information in error messages
- **Dependencies:** Keep dependencies updated and audit for vulnerabilities

### API Security

- **Rate limiting:** Implement appropriate rate limiting for all endpoints
- **CORS:** Configure CORS appropriately for web applications
- **HTTPS:** All communications must use HTTPS in production
- **API keys:** Rotate API keys regularly and use strong key management

### Database Security

- **SQL injection:** Use parameterized queries or ORMs
- **Connection security:** Use strong database credentials
- **Data encryption:** Encrypt sensitive data at rest
- **Access logging:** Log all database access for audit trails

### Provider Security (EasyPost, Shippo, Veeqo)

- **API credentials:** Store securely using environment variables or secret management
- **Rate limiting:** Implement provider-specific rate limiting
- **Error handling:** Handle provider API errors gracefully
- **Data sanitization:** Sanitize all data before sending to providers

## Security Best Practices

### Development Environment

- Use `.env` files for local development (never commit to version control)
- Implement proper logging without exposing sensitive information
- Use security linters and static analysis tools
- Regular dependency updates and security audits

### Production Deployment

- Use security headers (HSTS, CSP, X-Frame-Options)
- Implement proper secret management (vault, key management service)
- Regular security patching and updates
- Monitor for suspicious activities

### Incident Response

1. **Identify:** Detect and assess the security incident
2. **Contain:** Isolate affected systems and prevent spread
3. **Eradicate:** Remove root cause and malware
4. **Recover:** Restore systems to normal operations
5. **Lessons Learned:** Document and improve processes

## Contact

- **Security Email:** security@multiship.example.com
- **Emergency Contact:** Available for critical vulnerabilities requiring immediate attention
- **PGP Key:** Available upon request for encrypted communications

## Hall of Fame

We would like to thank the following researchers for their responsible disclosure of security vulnerabilities:

- *Hall of fame will be maintained here as contributors are recognized*

---

*This security policy is adapted from industry best practices and will be updated as the project evolves.*