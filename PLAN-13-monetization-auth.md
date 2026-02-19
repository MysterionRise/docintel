# Plan: Monetization, Auth & Freemium Gating

## Goal
Implement a freemium business model with client-side license enforcement. Minimal server footprint (auth + billing only). All document processing remains on-device.

## Packages
`apps/web` (license checking, UI) + `services/billing-worker` (Stripe, JWT)

## Dependencies
- Plan 11 (all domain UIs) complete

## Tasks

### 1. Build billing Cloudflare Worker (`services/billing-worker/src/`)

`services/billing-worker/src/index.ts`:
```typescript
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/auth/validate-license') return handleValidateLicense(request, env);
    if (url.pathname === '/billing/create-checkout') return handleCreateCheckout(request, env);
    if (url.pathname === '/billing/webhook') return handleStripeWebhook(request, env);
    if (url.pathname === '/billing/portal') return handleCustomerPortal(request, env);
    return new Response('Not found', { status: 404 });
  }
};
```

Routes:
- `/auth/validate-license` → Check subscription, return signed JWT
- `/billing/create-checkout` → Create Stripe Checkout session
- `/billing/webhook` → Handle Stripe events (subscription created/cancelled)
- `/billing/portal` → Create Stripe Customer Portal link

`services/billing-worker/wrangler.toml`:
```toml
name = "docintel-billing"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
STRIPE_PUBLISHABLE_KEY = "pk_live_..."

# Secrets (set via `wrangler secret put`):
# STRIPE_SECRET_KEY, JWT_SECRET, STRIPE_WEBHOOK_SECRET
```

### 2. Define tier limits (`apps/web/src/lib/pricing.ts`)
```typescript
export const TIERS = {
  free: {
    name: 'Free',
    price: 0,
    limits: {
      domainsAllowed: 1,
      documentsPerMonth: 5,
      maxPagesPerDocument: 20,
      batchProcessing: false,
      exportFormats: ['json'],
      comparison: false,
    },
  },
  professional: {
    name: 'Professional',
    price: 29, // EUR/month
    limits: {
      domainsAllowed: 4,
      documentsPerMonth: Infinity,
      maxPagesPerDocument: Infinity,
      batchProcessing: true,
      exportFormats: ['json', 'csv', 'xlsx', 'docx', 'pdf'],
      comparison: true,
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: 99,
    limits: { /* everything unlimited + priority updates + SLA */ },
  },
} as const;
```

### 3. Build license checker (`apps/web/src/lib/license.ts`)
Client-side enforcement with periodic server validation:
```typescript
export class LicenseManager {
  async checkLicense(): Promise<UserTier>;
  canProcessDocument(): { allowed: boolean; reason?: string };
  canExport(format: string): { allowed: boolean; reason?: string };
  canUseDomain(domain: string): { allowed: boolean; reason?: string };
  canBatchProcess(): { allowed: boolean; reason?: string };
  incrementUsage(type: 'document_processed'): void;
  getMonthlyUsage(): { documentsProcessed: number; month: string };
}
```

License is a signed JWT cached in localStorage. Validated on launch, every 7 days, and on plan change.

### 4. Build paywall UI components (`apps/web/src/components/monetization/`)
- `UpgradePrompt.tsx`: Shown when user hits a limit. Feature comparison + CTA.
- `PricingPage.tsx`: 3-column comparison, annual discount, Stripe Checkout.
- `UsageDashboard.tsx`: Documents processed, storage, plan details.

### 5. Integrate Stripe in web app
```typescript
// apps/web/src/lib/stripe.ts
export async function createCheckoutSession(priceId: string): Promise<string> {
  const response = await fetch(`${BILLING_WORKER_URL}/billing/create-checkout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getAuthToken()}` },
    body: JSON.stringify({ priceId }),
  });
  const { url } = await response.json();
  return url;
}
```

### 6. Graceful degradation
When license validation fails (offline, server down):
- Cached license not expired → full access
- Expired < 7 days → full access + "please go online" warning
- Expired > 7 days → fall back to free tier
- Never block completely

### 7. Privacy-first analytics (`apps/web/src/lib/analytics.ts`)
Client-side only. Counts: documents processed, domains used, model load times. No third-party scripts. Optional opt-in to send anonymous aggregate stats.

## Acceptance Criteria
- [ ] Free tier limits enforced client-side
- [ ] Stripe Checkout flow works end-to-end
- [ ] Billing worker deploys to Cloudflare Workers
- [ ] License JWT cached and validated periodically
- [ ] Upgrade prompts appear at appropriate moments
- [ ] Offline users can still use the app
- [ ] Usage tracking accurate (monthly reset)
- [ ] `services/billing-worker` deploys independently from web app
