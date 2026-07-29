# ADR-003: Tenant Isolation Strategy

**Status:** ✅ Accepted
**Date:** 2026-07-29
**Author:** @junnaid-4

## Context

The Multi-Tenant Booking Platform must provide strong tenant isolation to ensure that:
- Businesses can only access their own data
- No cross-tenant data leaks occur
- The system can scale to thousands of businesses
- Performance is maintained with many tenants

The PRD Section 2 specifies the approach:
> **Tenant isolation:** Shared schema with internal `business_id` and PostgreSQL RLS

Key requirements from PRD:
- Use internal `businesses.id` UUID as the tenant key (Section 11.1)
- Clerk Organization ID stored as external identity mapping
- RLS is mandatory for every tenant-owned table (Section 11.2)
- Server/service credentials must be server-only (Section 11.3)

## Decision

Implement tenant isolation using a **shared schema with PostgreSQL Row-Level Security (RLS)** approach:

### 1. Data Model

- All tenant-owned tables include a `business_id` column (UUID)
- Use internal `businesses.id` as the primary tenant identifier
- Store Clerk Organization ID in `businesses.external_auth_org_id` for mapping
- Never use external IDs as primary keys

### 2. Row-Level Security (RLS)

- Enable RLS on every tenant-owned table
- Create policies that:
  - Deny access when tenant context is absent
  - Permit authenticated business users only for their linked business
  - Prevent inserting records with a different `business_id`
  - Prevent cross-tenant joins/updates
  - Separate public booking reads from authenticated dashboard access
  - Never expose internal notes through public policies

### 3. Tenant Context

- Derive tenant context from verified authentication (Clerk)
- Never trust tenant context from request body
- Use database session context that preserves RLS defense in depth
- For public endpoints, use business slug to identify tenant

### 4. RLS Policy Patterns

#### For Authenticated Business Users:
```sql
CREATE POLICY business_user_policy ON table_name
  USING (business_id = current_setting('app.current_business_id')::uuid);
```

#### For Public Read Access:
```sql
CREATE POLICY public_read_policy ON table_name
  FOR SELECT
  USING (
    business_id = (SELECT id FROM businesses WHERE slug = current_setting('app.current_business_slug'))
    AND is_public = true
    AND is_active = true
  );
```

#### For Platform Admin:
```sql
CREATE POLICY platform_admin_policy ON table_name
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE external_auth_user_id = current_setting('app.current_user_id')
    )
  );
```

### 5. Application-Level Security

- Server-side authorization on every authenticated endpoint
- Tenant context derived from verified auth tokens
- Privileged database connections only used server-side
- Frontend bundles must never contain privileged keys

### 6. Public vs Authenticated Access

- **Public endpoints:** Use business slug, limited to public data only
- **Authenticated endpoints:** Use Clerk user context, full business access
- **Platform admin endpoints:** Require platform admin role, full access with audit

## Consequences

### Positive Consequences

1. **Strong Isolation:** RLS provides database-enforced tenant isolation
2. **Defense in Depth:** Multiple layers of security (RLS + application checks)
3. **Scalability:** Shared schema scales well for thousands of tenants
4. **Flexibility:** Can add schema-per-tenant later if needed
5. **Auditability:** Clear tenant boundaries in data model
6. **Performance:** Indexes on `business_id` enable efficient tenant-scoped queries

### Negative Consequences

1. **Complexity:** RLS policies add complexity to database schema
2. **Performance Overhead:** RLS checks add minimal overhead to queries
3. **Debugging:** Cross-tenant issues can be harder to debug
4. **Migration Complexity:** Schema changes must consider RLS implications

## Alternatives Considered

### Alternative 1: Schema-per-Tenant
- **Description:** Create separate schema for each tenant
- **Rejection Reason:** PRD explicitly specifies shared schema; schema-per-tenant doesn't scale as well for many small tenants

### Alternative 2: Application-Only Isolation
- **Description:** Rely only on application-level tenant filtering
- **Rejection Reason:** PRD mandates RLS; application-only is vulnerable to SQL injection or bugs

### Alternative 3: Separate Database per Tenant
- **Description:** Use separate database for each tenant
- **Rejection Reason:** Overkill for current scale; PRD specifies shared schema with RLS

### Alternative 4: Tenant ID in JWT
- **Description:** Store tenant ID in JWT tokens
- **Rejection Reason:** PRD specifies internal business_id; JWT can be tampered with

## Implementation Details

### Database Setup

1. Enable RLS on all tenant tables:
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

2. Create RLS policies for each access pattern

3. Set up PostgreSQL session variables for tenant context

### Application Setup

1. Middleware to extract and verify tenant context from Clerk tokens
2. Database connection management that sets session variables
3. Request validation to ensure tenant context is always present

### Testing

1. Tenant isolation tests for every tenant-owned domain
2. Cross-tenant access attempt tests
3. Public endpoint isolation tests
4. Platform admin access tests

## Related

- **PRD Section:** [Section 2 - Final Product Decisions](../product/booking-platform-prd.md#2-final-product-decisions)
- **PRD Section:** [Section 11 - Tenant Isolation and Authentication](../product/booking-platform-prd.md#11-tenant-isolation-and-authentication)
- **PRD Section:** [Section 11.2 - Row-Level Security](../product/booking-platform-prd.md#112-row-level-security)
- **ADR-001:** [Backend-First Development Approach](./adr-001-backend-first-approach.md)
- **ADR-002:** [Technology Stack Selection](./adr-002-technology-stack-selection.md)

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-07-29 | @junnaid-4 | Initial version based on PRD requirements |