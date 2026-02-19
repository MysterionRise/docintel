# Plan: Security & Privacy Audit

## Goal
Verify and prove that DocIntel processes zero user data server-side. Build trust through transparency and verifiability.

## Scope
Cross-cutting across all packages.

## Dependencies
- Plan 06 (RAG) complete

## Tasks

### 1. Network audit test (`apps/web/src/__tests__/network-audit.test.ts`)
```typescript
test('no network requests during document analysis', async () => {
  const networkRequests: string[] = [];
  const originalFetch = window.fetch;
  window.fetch = (...args) => {
    networkRequests.push(String(args[0]));
    return originalFetch(...args);
  };

  // Process document, run analysis, generate answer
  // Assert: no requests except cached model loading

  const analysisRequests = networkRequests.filter(
    url => !url.includes('huggingface.co')
  );
  expect(analysisRequests).toHaveLength(0);
  window.fetch = originalFetch;
});
```

### 2. Content Security Policy (`apps/web/public/_headers`)
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.huggingface.co; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'
```

### 3. Data flow documentation
Visual diagram: Upload → IndexedDB (local) → Parse (local) → Chunk+Embed (local) → Query (local GPU) → Response (local). NO server step.

### 4. Dependency audit
```bash
pnpm audit                           # All packages
pnpm audit --filter=@docintel/web    # Web app only
```

Check for telemetry/phone-home in: onnxruntime-web, @huggingface/transformers, pdfjs-dist, tesseract.js.

### 5. Privacy verification page (`apps/web/src/components/settings/PrivacyVerification.tsx`)
- Live network monitor
- "Run privacy test" button
- Lists all IndexedDB databases and Cache API entries
- "Delete all my data" button
- Links to source code

### 6. WebGPU security documentation
Document: GPU fingerprinting (not transmitted), timing attacks (not a risk for on-device), shared GPU memory (standard behavior).

### 7. SECURITY.md (repo root)
```markdown
# Security Policy
## Data Handling
All documents processed on-device. Zero data transmitted.
## Network Requests
Only: (1) Model downloads from HuggingFace, (2) License validation (no document data), (3) Stripe checkout.
## Verification
Open Network tab during analysis. Zero requests.
## Reporting
security@docintel.com
```

### 8. GDPR compliance page (`apps/web/src/components/legal/GDPRPage.tsx`)
- Data controller: N/A
- Data processed: None
- Right to deletion: Clear via Settings
- Data transfers: None

### 9. Open-source licenses
Document: SmolLM3 (Apache 2.0), PDF.js (Apache 2.0), Tesseract.js (Apache 2.0), ONNX Runtime (MIT).

## Acceptance Criteria
- [ ] Network audit test passes (zero requests during analysis)
- [ ] CSP headers configured and tested
- [ ] Privacy verification page works
- [ ] "Delete all data" works completely
- [ ] SECURITY.md comprehensive
- [ ] Dependency audit: no critical vulnerabilities
- [ ] GDPR documentation complete
- [ ] Data flow diagram accurate
