# 🚀 Implementation Action Plan
## Critical Issues - Priority Queue

**Created**: May 31, 2026  
**Status**: Ready for Implementation  

---

## 🔴 PHASE 1: CRITICAL FIXES (Must Complete Before Next Deploy)

### Task 1.1: Remove Console.log Statements
**Priority**: 🔴 CRITICAL  
**Estimated Time**: 2-3 hours  
**Owner**: Backend Team  
**Complexity**: Low

**Steps**:
1. Search all console.log in API:
   ```bash
   grep -r "console\." apps/api/src --include="*.ts" | grep -v node_modules
   ```

2. Files to update:
   - `apps/api/src/app.module.ts` - 5 statements
   - `apps/api/src/whatsapp-channel/services/whatsapp-instance.service.ts` - 6 statements  
   - `apps/api/src/whatsapp-channel/providers/evolution-go.provider.ts` - 5 statements
   - `apps/api/src/common/logging/session-logger.ts` - 8 statements
   - `apps/api/src/campaigns/campaigns.module.ts` - 2 statements
   - `apps/api/src/admin/modules/admin-modules.controller.ts` - 1 statement
   - `apps/api/src/admin/services/system-config.service.ts` - 1 statement
   - `apps/api/src/orders/orders.service.ts` - 1 statement (REMOVE)

3. Update frontend (`apps/web-tenant/src`):
   - `hooks/useNotificationAudio.ts` - 10 statements
   - `features/whatsapp/hooks/useChatSocket.ts` - 2 statements
   - `features/orders/hooks/useOrderNotifications.ts` - 6 statements
   - `features/management/employees/hooks/useEmployees.ts` - 1 statement

4. Add ESLint rule to prevent regression:
   ```json
   {
     "rules": {
       "no-console": ["error", { "allow": [] }]
     }
   }
   ```

5. Test: `npm run lint` should fail on any console.*

**Done Criteria**:
- [ ] All console.log replaced with logger
- [ ] ESLint rule added
- [ ] Lint passes
- [ ] Tested in staging

---

### Task 1.2: Fix Fire-and-Forget Promises
**Priority**: 🔴 CRITICAL  
**Estimated Time**: 4-6 hours  
**Owner**: Backend Team  
**Complexity**: Medium

**Problem Files**:
1. `apps/api/src/orders/orders.service.ts` - 5 locations
2. `apps/api/src/pos/pos.service.ts` - 2 locations

**Strategy**: Choose per operation:
- **Critical path** (inventory, payment): ❌ Don't catch - throw error
- **Non-critical** (notifications): ✅ Catch + log + retry

**Implementation**:

```typescript
// Before (WRONG)
await this.inventoryService.processOrderDepletion(tenantId, order.id).catch(e => {
  this.logger.error(`Error processing inventory: ${e.message}`);
});

// After (CORRECT) - Critical operations should fail
try {
  await this.inventoryService.processOrderDepletion(tenantId, order.id);
} catch (error) {
  this.logger.error('inventory_depletion_failed', { 
    orderId: order.id, 
    tenantId,
    error: error instanceof Error ? error.message : String(error)
  });
  throw new BadRequestException('Failed to reserve inventory');
}

// Non-critical: Catch and retry
const maxRetries = 3;
for (let i = 0; i < maxRetries; i++) {
  try {
    await this.whatsappService.notifyOrderStatus(...);
    break;
  } catch (error) {
    if (i === maxRetries - 1) {
      this.logger.warn('whatsapp_notification_failed', { orderId: order.id });
    } else {
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

**Test Checklist**:
- [ ] Order creation fails if inventory depletion fails
- [ ] Payment fails if payment processing fails  
- [ ] Notifications retry 3 times then log warning
- [ ] Database stays consistent after failure

---

### Task 1.3: Fix Notification System Cache/Defaults
**Priority**: 🔴 CRITICAL  
**Estimated Time**: 2-3 hours  
**Owner**: Full Stack Team  
**Complexity**: Low

**Changes Required**:

1. **Prisma schema** (`apps/api/prisma/schema.prisma`):
```prisma
model TenantSettings {
  // ... existing fields
  newOrderSound         String   @default("notification.mp3") @map("new_order_sound")
  cancellationSound     String   @default("notification.mp3") @map("cancellation_sound")
  // ... rest
}
```

2. **Seed data** (`apps/api/prisma/seed.ts`):
```typescript
const settings = await prisma.tenantSettings.create({
  data: {
    tenantId: tenant.id,
    audioNotificationEnabled: true,
    notificationVolume: 1.0,
    newOrderSound: 'notification.mp3',
    cancellationSound: 'notification.mp3',
    whatsappNotificationsEnabled: false,
    // ... other fields
  },
});
```

3. **Frontend cache alignment** (`apps/web-tenant/src`):
```typescript
// AppLayout.tsx - Fix queryKey
const { data: tenantData } = useQuery({
  queryKey: ['tenant-settings'],  // Unified key
  queryFn: async () => await api.get(`/tenant/me`),
  staleTime: 1000 * 60 * 5,
});

// NotificationSettings.tsx - Use same key
const queryClient = useQueryClient();
const { data: settings } = useQuery({
  queryKey: ['tenant-settings'],  // Same key
});

// After update
queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
```

4. **Migration**:
```bash
npx prisma migrate dev --name fix_notification_defaults
```

**Test**:
- [ ] New tenant gets correct sound defaults
- [ ] Sound files load correctly
- [ ] Settings changes sync across app

---

### Task 1.4: Add Unhandled Rejection Handlers
**Priority**: 🔴 CRITICAL  
**Estimated Time**: 1-2 hours  
**Owner**: DevOps/Backend  
**Complexity**: Low

**Implementation** (`apps/api/src/main.ts`):

```typescript
// Add before app.listen()
process.on('unhandledRejection', (reason, promise) => {
  logger.error('unhandled_rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Optionally: process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught_exception', {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.log('SIGTERM received, shutting down gracefully...');
  await app.close();
  process.exit(0);
});
```

**Test**:
- [ ] Unhandled rejection logged
- [ ] Process exits/restarts correctly

---

### Task 1.5: Add Missing Database Indexes
**Priority**: 🔴 CRITICAL  
**Estimated Time**: 1 hour + migration  
**Owner**: Database/Backend  
**Complexity**: Low

**Schema Update** (`apps/api/prisma/schema.prisma`):

```prisma
model Order {
  // ... existing fields
  @@index([tenantId])
  @@index([status])
  @@index([sourceChannel])
  @@index([paymentMethod])
  @@index([tenantId, status, createdAt])  // Composite
  @@index([publicTrackingToken])  // For tracking queries
}

model OrderItem {
  // ... existing fields
  @@index([orderId, tenantId])
}

model PaymentTransaction {
  // ... existing fields
  @@index([status])
  @@index([tenantId, status])
}

model ChatMessage {
  // ... existing fields
  @@index([sessionId])
}
```

**Migration**:
```bash
npx prisma migrate dev --name add_missing_indexes
```

**Test**:
- [ ] Indexes created in database
- [ ] Query plans updated (check EXPLAIN plans)
- [ ] Performance improved

---

## 🟠 PHASE 2: HIGH PRIORITY (Next Sprint)

### Task 2.1: Add Transaction Boundaries
**Priority**: 🟠 HIGH  
**Estimated Time**: 3-4 hours  
**Files**: `orders.service.ts`, `pos.service.ts`

**Example Pattern**:
```typescript
async createOrder(data: CreateOrderDto) {
  return this.prisma.$transaction(async (tx) => {
    // All operations atomic
    const order = await tx.order.create({ data: {...} });
    
    if (shouldDeployInventory) {
      await tx.inventory.update({...});
    }
    
    if (shouldApplyCashback) {
      await tx.cashback.create({...});
    }
    
    return order;
  });
}
```

---

### Task 2.2: Standardize Error Responses
**Priority**: 🟠 HIGH  
**Estimated Time**: 2-3 hours  
**Files**: All controllers

**Create Response Wrapper**:
```typescript
// apps/api/src/common/http/api.response.ts
export class ApiResponse<T = unknown> {
  static success<T>(data: T, statusCode = 200) {
    return { success: true, data, statusCode };
  }

  static error(code: string, message: string, statusCode = 400) {
    return { 
      success: false, 
      error: { code, message }, 
      statusCode 
    };
  }
}

// Usage in controllers
@Post()
async create(@Body() dto: CreateDto) {
  try {
    const result = await this.service.create(dto);
    return ApiResponse.success(result);
  } catch (error) {
    return ApiResponse.error('CREATE_FAILED', error.message, 400);
  }
}
```

---

## 🟡 PHASE 3: MEDIUM PRIORITY (Following Sprint)

### Task 3.1: Enhance Configuration Management
**Priority**: 🟡 MEDIUM  
**Estimated Time**: 2-3 hours

**Create Config File**:
```typescript
// apps/api/src/config/app.config.ts
export const appConfig = () => ({
  api: {
    port: parseInt(process.env.API_PORT || '3333'),
    environment: process.env.NODE_ENV as 'development' | 'production',
    prefix: '/api/v1',
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '300'),
    enabled: process.env.CACHE_ENABLED !== 'false',
  },
  timings: {
    campaignDispatchInterval: 60_000,
    aiOrchestratorTimeout: 1_000,
  },
  pagination: {
    defaultPageSize: 20,
    maxPageSize: 100,
  },
});
```

---

## 📊 Progress Tracking

### Status Board
```
Phase 1 (Critical): ░░░░░░░░░░ 0% (Not started)
Phase 2 (High):     ░░░░░░░░░░ 0% (Not started)
Phase 3 (Medium):   ░░░░░░░░░░ 0% (Not started)
```

### Checklist Template
```markdown
- [ ] Task assigned
- [ ] PR created
- [ ] Code review passed
- [ ] Tests passing
- [ ] Staging deployed
- [ ] Approved for production
- [ ] Production deployed
```

---

## 📞 Escalation Contacts

| Issue | Contact | Urgency |
|-------|---------|---------|
| Console logs in production | @backend-lead | 🔴 Critical |
| Fire-and-forget promises | @database-expert | 🔴 Critical |
| Notification bugs | @frontend-lead | 🔴 Critical |
| Error handling | @arch-lead | 🟠 High |
| Performance | @devops-lead | 🟠 High |

---

**Next Steps**:
1. ✅ Review this plan with team
2. ✅ Assign tasks by skill
3. ✅ Create GitHub issues
4. ✅ Update sprint board
5. ✅ Schedule code reviews
6. ✅ Plan testing strategy

---

Generated: May 31, 2026
