# Development Setup Guide

This guide provides step-by-step instructions for setting up a development environment for the Multiship project.

## 🏗️ Prerequisites

Before starting, ensure you have the following installed:

### Required Software
- **Node.js**: Version 18.x or higher
- **PNPM**: Version 8.x or higher
- **Docker**: Version 20.x or higher
- **Docker Compose**: Version 2.x or higher
- **Git**: Version 2.x or higher

### Optional but Recommended
- **Visual Studio Code**: With recommended extensions
- **Postman** or **Insomnia**: For API testing
- **Redis CLI**: For cache debugging

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/multiship.git
cd multiship
```

### 2. Install Dependencies
```bash
# Install all dependencies in the monorepo
pnpm install

# Install dependencies for all workspaces
pnpm install --recursive
```

### 3. Set Up Environment Variables
```bash
# Copy environment template
cp .env.example .env

# Edit the .env file with your configuration
vim .env
```

### 4. Start Infrastructure Services
```bash
# Start PostgreSQL and Redis using Docker Compose
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 5. Set Up the Database
```bash
# Generate Prisma client
pnpm --filter @multiship/db db:generate

# Run database migrations
pnpm --filter @multiship/db db:push

# (Optional) Seed the database with test data
pnpm --filter @multiship/db db:seed
```

### 6. Start Development Servers
```bash
# Start API server (Terminal 1)
pnpm --filter @multiship/api dev

# Start frontend application (Terminal 2)
pnpm --filter @multiship/web dev
```

### 7. Verify Setup
- **API**: http://localhost:3001/health
- **Frontend**: http://localhost:3000
- **Database**: PostgreSQL on localhost:5432
- **Cache**: Redis on localhost:6379

## ⚙️ Detailed Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database
DATABASE_URL="postgresql://multiship:multiship@localhost:5432/multiship"

# Redis
REDIS_URL="redis://localhost:6379"

# API Configuration
API_PORT=3001
API_HOST="localhost"

# Frontend Configuration
NEXT_PUBLIC_API_URL="http://localhost:3001"

# Provider API Keys (get these from provider dashboards)
EASYPOST_API_KEY="your-easypost-api-key"
SHIPPO_API_KEY="your-shippo-api-key"
VEEQO_API_KEY="your-veeqo-api-key"

# JWT Secret (generate a secure random string)
JWT_SECRET="your-jwt-secret-key"

# Application Environment
NODE_ENV="development"
```

### Provider Setup

#### EasyPost
1. Sign up at [easypost.com](https://easypost.com)
2. Get your API key from the dashboard
3. Add to `.env` as `EASYPOST_API_KEY`

#### Shippo
1. Sign up at [goshippo.com](https://goshippo.com)
2. Get your API key from settings
3. Add to `.env` as `SHIPPO_API_KEY`

#### Veeqo
1. Sign up at [veeqo.com](https://veeqo.com)
2. Get your API key from integrations
3. Add to `.env` as `VEEQO_API_KEY`

## 🛠️ Development Workflow

### Code Organization

The project uses a monorepo structure:

```
multiship/
├── apps/                 # Applications
│   ├── api/             # Backend API (Fastify)
│   └── web/             # Frontend (Next.js)
├── packages/            # Shared packages
│   ├── db/              # Database package (Prisma)
│   └── providers/       # Provider integrations
└── docs/                # Documentation
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @multiship/providers test

# Run tests in watch mode
pnpm --filter @multiship/api test:watch

# Run tests with coverage
pnpm test:coverage
```

### Code Quality

```bash
# Lint all packages
pnpm lint

# Format code
pnpm format

# Type checking
pnpm type-check
```

## 🔧 Development Tools

### VS Code Extensions

Install these recommended extensions:
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Prisma**: Database schema support
- **Docker**: Container support
- **REST Client**: API testing

### Debugging

#### API Debugging
- Use `console.log` with structured logging
- Check API logs: `docker-compose logs api`
- Debug database queries with Prisma Studio: `pnpm prisma:studio`

#### Frontend Debugging
- React DevTools browser extension
- Next.js development tools
- Network tab for API request debugging

### Database Management

#### Prisma Studio
```bash
# Launch Prisma Studio for database inspection
pnpm --filter @multiship/db prisma:studio
```

#### Database Migrations
```bash
# Create new migration
pnpm --filter @multiship/db prisma:migrate:dev --name "add-user-table"

# Reset database (development only)
pnpm --filter @multiship/db prisma:migrate:reset
```

## 🚨 Common Issues and Solutions

### Port Conflicts
**Problem**: Port already in use
```bash
# Check what's using the port
lsof -i :3001

# Kill process or change port in .env
API_PORT=3002
```

### Permission Issues
**Problem**: Docker permission denied
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Or run with sudo
sudo docker-compose up -d
```

### Provider API Issues
**Problem**: Provider API keys not working
- Verify keys are correct in `.env`
- Check provider dashboard quotas
- Ensure test mode vs live mode settings

### Database Connection Issues
**Problem**: Cannot connect to database
```bash
# Check if database is running
docker-compose ps

# Check database logs
docker-compose logs db

# Reset database if needed
pnpm --filter @multiship/db prisma:migrate:reset
```

## 🔍 Health Checks

### API Health Check
```bash
curl http://localhost:3001/health
```

### Database Health Check
```bash
# Check database connectivity
pnpm --filter @multiship/db db:health

# Or use psql directly
psql postgresql://multiship:multiship@localhost:5432/multiship -c "SELECT 1;"
```

### Provider Health Checks
```bash
# Check provider status programmatically
curl http://localhost:3001/api/providers/health
```

## 📚 Additional Resources

### Documentation
- **[Architecture Overview](../architecture/overview.md)** - System design details
- **[API Documentation](../api/endpoints.md)** - Complete API reference
- **[Provider Guides](../providers/)** - Provider-specific setup guides

### Development Scripts

Check `package.json` files in each package for available scripts:

```bash
# API scripts
pnpm --filter @multiship/api run

# Database scripts
pnpm --filter @multiship/db run

# Provider scripts
pnpm --filter @multiship/providers run
```

### Getting Help

1. Check this setup guide first
2. Review existing issues on GitHub
3. Ask in the development team chat
4. Create a new issue with detailed information

---

*This setup guide is regularly updated. Last modified: $(date)*