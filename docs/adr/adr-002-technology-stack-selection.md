# ADR-002: Technology Stack Selection

**Status:** ✅ Accepted
**Date:** 2026-07-29
**Author:** @junnaid-4

## Context

The Multi-Tenant Booking Platform requires a modern, scalable technology stack that:
- Supports TypeScript for type safety
- Provides a robust backend framework
- Integrates with PostgreSQL/Supabase for data storage
- Handles authentication with Clerk
- Processes payments with Stripe
- Supports background jobs for notifications
- Enables deployment on Vercel

The PRD Section 18 specifies the approved stack, which we must follow.

## Decision

Adopt the technology stack as specified in PRD Section 18.1:

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Language** | TypeScript | Type safety, developer experience, industry standard |
| **Web/API Framework** | Next.js App Router | Full-stack capability, API routes, React integration |
| **Database** | Supabase PostgreSQL | Managed PostgreSQL, RLS support, scalability |
| **Schema/Migrations** | Drizzle ORM | Type-safe SQL, migration support, modern approach |
| **Validation** | Zod | Type-safe validation, schema inference |
| **Authentication** | Clerk | Managed auth, organizations, webhooks |
| **SaaS Billing** | Stripe Billing | Industry standard, robust API |
| **Customer Payments** | Stripe Connect | Marketplace payments, connected accounts |
| **Email** | Resend/Postmark | Reliable email delivery, good APIs |
| **Background Jobs** | Inngest/Trigger.dev | Managed job queues, retries, observability |
| **Rate Limiting/Cache** | Redis | High-performance caching and rate limiting |
| **Hosting** | Vercel | Optimized for Next.js, serverless functions |
| **Monitoring** | Sentry | Error tracking, performance monitoring |
| **Unit/Integration Tests** | Vitest | Fast, modern test runner |
| **API/E2E Tests** | Playwright | Browser testing, API client |
| **API Specification** | OpenAPI 3.1 | Standard API documentation |

### Architecture Boundaries

Organize code by domain as specified in PRD Section 18.2:

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
```

### Dependency Rules

1. **Domain services do not import UI components** - Maintain clean separation
2. **Scheduling logic does not call email/payment providers directly** - Use adapters
3. **Provider integrations use adapters** - Enable provider swapping
4. **Database transactions are controlled by application services** - Centralized transaction management
5. **Public API schemas are versioned and tested** - API stability
6. **No direct Supabase privileged write from Antigravity UI** - All writes through API

## Consequences

### Positive Consequences

1. **Type Safety:** TypeScript across the stack reduces runtime errors
2. **Developer Experience:** Modern tools with good developer experience
3. **Scalability:** Managed services (Supabase, Vercel) handle scaling
4. **Maintainability:** Clear architecture boundaries and dependency rules
5. **Flexibility:** Adapter pattern allows provider changes
6. **Testing:** Modern testing tools enable comprehensive test coverage

### Negative Consequences

1. **Learning Curve:** Team needs to be familiar with multiple modern tools
2. **Vendor Lock-in Risk:** Dependence on specific providers (mitigated by adapters)
3. **Complexity:** Full-stack TypeScript with Next.js has more moving parts
4. **Cost:** Managed services have ongoing costs (acceptable for SaaS)

## Alternatives Considered

### Alternative 1: Express.js + Prisma
- **Description:** Use Express.js with Prisma ORM
- **Rejection Reason:** PRD explicitly specifies Next.js App Router; Prisma doesn't support RLS as well as direct SQL

### Alternative 2: NestJS
- **Description:** Use NestJS framework
- **Rejection Reason:** PRD specifies Next.js; NestJS would be overkill for this use case

### Alternative 3: Raw SQL without ORM
- **Description:** Use raw SQL queries without ORM
- **Rejection Reason:** Drizzle provides type safety while still allowing raw SQL when needed

### Alternative 4: Firebase
- **Description:** Use Firebase for authentication and database
- **Rejection Reason:** PRD specifies Clerk and Supabase; Firebase doesn't support PostgreSQL RLS

## Related

- **PRD Section:** [Section 18 - Technology Stack](../product/booking-platform-prd.md#18-technology-stack)
- **PRD Section:** [Section 18.2 - Architecture boundaries](../product/booking-platform-prd.md#182-architecture-boundaries)
- **PRD Section:** [Section 18.3 - Dependency rules](../product/booking-platform-prd.md#183-dependency-rules)
- **ADR-001:** [Backend-First Development Approach](./adr-001-backend-first-approach.md)

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-07-29 | @junnaid-4 | Initial version based on PRD requirements |