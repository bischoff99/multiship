# Multiship Documentation

This directory contains comprehensive documentation for the Multiship project, a multi-carrier shipping platform that integrates with various shipping providers including EasyPost, Shippo, and Veeqo.

## 📚 Documentation Structure

```
docs/
├── README.md                    # This file - documentation overview
├── wiki/                        # Wiki-style documentation
│   ├── architecture/           # System architecture and design
│   ├── development/            # Development guides and setup
│   ├── operations/             # Deployment and operations
│   ├── api/                    # API documentation and references
│   ├── providers/              # Provider-specific integration guides
│   └── security/               # Security documentation and guidelines
├── guides/                      # User guides and tutorials
├── reference/                   # Technical reference materials
├── contributing/               # Contributing guidelines and processes
├── standards/                  # Documentation standards and templates
└── team/                       # Team-specific documentation
```

## 🚀 Quick Start

### For New Users
- **[Getting Started Guide](./guides/getting-started.md)** - Complete setup and first steps
- **[API Integration Guide](./guides/api-integration.md)** - How to integrate with the Multiship API
- **[Provider Setup](./guides/provider-setup.md)** - Configure shipping provider integrations

### For Developers
- **[Development Setup](./wiki/development/setup.md)** - Environment configuration and dependencies
- **[Architecture Overview](./wiki/architecture/overview.md)** - System design and component relationships
- **[Contributing Guidelines](./contributing/README.md)** - How to contribute to the project

### For DevOps
- **[Deployment Guide](./wiki/operations/deployment.md)** - Deploy to production environments
- **[Monitoring Guide](./wiki/operations/monitoring.md)** - Health checks and metrics
- **[Troubleshooting](./wiki/operations/troubleshooting.md)** - Common issues and solutions

## 🏗️ Architecture

The Multiship platform consists of:

- **Backend API**: Fastify-based REST API with TypeScript
- **Frontend**: Next.js web application
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis for performance optimization
- **Providers**: EasyPost, Shippo, and Veeqo integrations
- **Infrastructure**: Docker Compose for local development

## 🔌 Provider Integrations

- **[EasyPost Integration](./wiki/providers/easypost.md)** - USPS, FedEx, UPS, DHL integration
- **[Shippo Integration](./wiki/providers/shippo.md)** - Multi-carrier shipping API
- **[Veeqo Integration](./wiki/providers/veeqo.md)** - E-commerce and warehouse management

## 🔒 Security

- **[Security Overview](./wiki/security/overview.md)** - Security architecture and practices
- **[Authentication Guide](./wiki/security/authentication.md)** - API authentication methods
- **[Compliance](./wiki/security/compliance.md)** - Security standards and compliance

## 🤝 Contributing

We welcome contributions from the community! Please see our:
- **[Contributing Guidelines](./contributing/README.md)** - How to contribute
- **[Code of Conduct](./contributing/code-of-conduct.md)** - Community standards
- **[Development Workflow](./contributing/workflow.md)** - Git workflow and processes

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/multiship/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/multiship/discussions)
- **Documentation Issues**: Report problems with this documentation

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

*This documentation is continuously updated. Last modified: $(date)*