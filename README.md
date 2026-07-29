# Multi-Tenant Booking Platform

A backend-first, multi-tenant booking management platform for service businesses, starting with salons, barbershops, and nail studios.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+
- PostgreSQL 15+ (Supabase compatible)
- GitHub account with access to the repository

### Installation

```bash
# Clone the repository
git clone https://github.com/junnaid-4/Multi-Tenant-Booking-Platform.git
cd Multi-Tenant-Booking-Platform

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:migrate

# Seed demo data
npm run db:seed

# Start development server
npm run dev
```

### Local Development

- API server runs on `http://localhost:3000`
- Database connection configured via environment variables
- Health endpoint: `GET /api/v1/health`

## 🏗️ Architecture

### Technology Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| Framework | Next.js App Router |
| Database | Supabase PostgreSQL |
| ORM | Drizzle ORM |
| Validation | Zod |
| Authentication | Clerk |
| Billing | Stripe Billing |
| Payments | Stripe Connect |
| Email | Resend/Postmark |
| Background Jobs | Inngest/Trigger.dev |
| Caching | Redis |
| Hosting | Vercel |
| Monitoring | Sentry |

### Project Structure

```
src/
  app/api/v1/           # REST API endpoints
  domains/             # Domain services and business logic
    businesses/
    services/
    staff/
    availability/
    bookings/
    customers/
    subscriptions/
    admin/
  infrastructure/      # External integrations and adapters
    db/
    auth/
    email/
    jobs/
    payments/
    observability/
  shared/              # Shared utilities and types
    errors/
    validation/
    idempotency/
    time/
tests/                # Test suites
migrations/            # Database migrations
docs/                  # Documentation
  adr/                 # Architecture Decision Records
  api/                 # API documentation
  product/             # Product requirements
.github/               # GitHub configuration
  workflows/
  ISSUE_TEMPLATE/
```

## 📋 Implementation Milestones

### Milestone 1: Repository and Quality Foundation ✅
- [x] Repository structure and governance files
- [x] PRD documentation
- [x] Development environment setup
- [x] Linting, formatting, and type checking
- [x] CI pipeline configuration
- [x] Health endpoint

### Milestone 2: Database and Tenant Isolation 🟡
- [ ] Database schema and migrations
- [ ] Row-Level Security policies
- [ ] Tenant isolation tests
- [ ] Seed data for demo businesses

### Milestone 3: Auth and Onboarding 🟡
- [ ] Clerk integration
- [ ] Business provisioning
- [ ] Onboarding state management
- [ ] Publish requirements validation

### Milestone 4: Business Configuration 🟡
- [ ] Locations management
- [ ] Staff profiles management
- [ ] Services and categories
- [ ] Availability rules and exceptions
- [ ] Entitlements system

### Milestone 5: Scheduling Engine 🟡
- [ ] Availability computation
- [ ] Conflict prevention
- [ ] Staff selection algorithms
- [ ] Resource allocation
- [ ] DST handling

### Milestone 6: Booking Lifecycle 🟡
- [ ] Customer management
- [ ] Booking creation and management
- [ ] Status state machine
- [ ] Management tokens
- [ ] Cancel/reschedule functionality
- [ ] Calendar integration (.ics)

### Milestone 7: Notifications and Jobs 🟡
- [ ] Outbox pattern implementation
- [ ] Email notification system
- [ ] Background job processing
- [ ] Retry and failure handling

### Milestone 8: Admin and Commercial Foundation 🟡
- [ ] Platform admin portal
- [ ] Tenant directory and management
- [ ] Suspension and reactivation
- [ ] Entitlement overrides
- [ ] Audit logging
- [ ] Stripe Billing integration

### Milestone 9: Documentation and Handoff 🟡
- [ ] Complete OpenAPI specification
- [ ] API documentation
- [ ] Demo data and credentials
- [ ] Antigravity handoff document

## 🔧 Configuration

### Environment Variables

See `.env.example` for required configuration.

### Database Setup

```bash
# Create database
createdb booking_platform

# Apply migrations
npm run db:migrate

# Seed demo data
npm run db:seed
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run type checking
npm run typecheck

# Run linting
npm run lint
```

## 📄 Documentation

- [Product Requirements Document](docs/product/booking-platform-prd.md)
- [API Documentation](docs/api/README.md)
- [Architecture Decision Records](docs/adr/README.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `security:` - Security fix
- `perf:` - Performance improvement
- `refactor:` - Code refactoring
- `test:` - Test changes
- `docs:` - Documentation
- `build:` - Build system changes
- `ci:` - CI configuration
- `chore:` - Other changes

### Pull Request Requirements

- Clear description of the problem and solution
- Reference to relevant PRD sections or use cases
- Tests for new functionality
- Updated documentation
- No secrets or sensitive data

## 📜 License

Private repository - All rights reserved.

## 📞 Support

For issues and questions, please open a GitHub issue or contact the repository maintainers.

---

**Repository:** [junnaid-4/Multi-Tenant-Booking-Platform](https://github.com/junnaid-4/Multi-Tenant-Booking-Platform)
**Status:** Backend Implementation in Progress
**Current Milestone:** Milestone 1 - Repository and Quality Foundation