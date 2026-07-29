# Pull Request

## 📝 Description

A clear and concise description of what this PR implements or fixes.

**Related Issue:** [Link to issue or use case reference]

**PRD Section:** [e.g. Section 8.3 - Time representation]

**Milestone:** [e.g. Milestone 5 - Scheduling engine]

## 🎯 Changes Made

- [ ] **Database:** Schema changes, migrations, or RLS policies
- [ ] **API:** New or modified endpoints
- [ ] **Domain:** Business logic or services
- [ ] **Infrastructure:** External integrations or adapters
- [ ] **Tests:** Unit, integration, or concurrency tests
- [ ] **Documentation:** Updated docs or examples
- [ ] **Configuration:** Environment or build changes
- [ ] **Security:** Authentication, authorization, or security fixes
- [ ] **Performance:** Optimization or scaling improvements

### Detailed Changes

| Area | Change | Impact |
|------|--------|--------|
| | | |

## ✅ Checklist

### Code Quality
- [ ] Code follows repository style and architecture patterns
- [ ] No secrets or sensitive data committed
- [ ] No unrelated changes included
- [ ] TypeScript types are correct and complete
- [ ] Error handling is implemented
- [ ] Logging is appropriate and secure

### Testing
- [ ] Unit tests added for new functionality
- [ ] Integration tests added where applicable
- [ ] Existing tests still pass
- [ ] Concurrency tests added for critical paths
- [ ] Tenant isolation tests added for database changes

### Documentation
- [ ] Code is well-commented (where necessary)
- [ ] API changes documented in OpenAPI spec
- [ ] Database changes documented in migrations
- [ ] PRD updated if behavior changes
- [ ] Changelog updated (if applicable)

### Security & Compliance
- [ ] No privileged keys exposed in frontend
- [ ] RLS policies updated for new tables
- [ ] Authentication/authorization verified
- [ ] Input validation implemented
- [ ] Rate limiting considered for public endpoints
- [ ] Audit logging for sensitive operations

### Database
- [ ] Migrations are idempotent and reversible where possible
- [ ] Migrations tested against clean database
- [ ] Indexes added for performance-critical queries
- [ ] RLS policies prevent cross-tenant access

### API Contract
- [ ] OpenAPI specification updated
- [ ] Error codes follow standard format
- [ ] Response schemas are versioned
- [ ] Backward compatibility maintained

## 🔍 Testing Evidence

### Local Testing
```bash
# Commands run and results
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
```

### Test Results
- Unit tests: [✅/❌] [passed/failed]
- Integration tests: [✅/❌] [passed/failed]
- Type checking: [✅/❌] [passed/failed]
- Linting: [✅/❌] [passed/failed]

## 📊 Performance Impact

- Expected performance impact: [None/Minor/Significant]
- Performance tests added: [Yes/No]
- Benchmarks: [if applicable]

## 🚨 Breaking Changes

- [ ] This PR contains breaking changes
- [ ] Database migrations require downtime
- [ ] API changes are backward-incompatible
- [ ] Configuration changes required

If breaking changes are included, describe migration path:

## 📋 Deployment Notes

- [ ] Requires database migration
- [ ] Requires environment variable changes
- [ ] Requires configuration updates
- [ ] Requires manual intervention
- [ ] Can be deployed during business hours

### Rollback Plan
In case of issues, rollback by:
1. 
2. 

## 🤖 Automated Checks

- [ ] CI pipeline passes
- [ ] All required status checks pass
- [ ] Code coverage maintained/increased
- [ ] Dependency scan passes
- [ ] Secret scan passes

## 👥 Reviewers

@repository-owner @maintainers

---

**Important:** Do not merge until all checks pass and at least one approval is received (when available).

**For emergency fixes:** Use the emergency bypass only with documented justification.