# Plan: PWA Optimization & Offline Support

## Goal
Make DocIntel a fully installable, offline-capable Progressive Web App. After initial model download, everything works without internet.

## Package
`apps/web` (primary)

## Dependencies
- Plan 06 (RAG) complete

## Tasks

### 1. Configure comprehensive service worker
Already set up in Plan 01 via vite-plugin-pwa. Verify and extend runtime caching in `apps/web/vite.config.ts`:
- Cache HuggingFace model files (CacheFirst, 30-day expiry)
- Cache CDN assets for ONNX Runtime WASM (CacheFirst)
- Precache all app shell assets

### 2. Implement model caching layer (`apps/web/src/lib/model-cache.ts`)
Track which models are downloaded and their cache status:
```typescript
export class ModelCache {
  async isModelCached(modelId: string): Promise<boolean>;
  async getCacheSize(): Promise<number>;
  async clearModelCache(modelId: string): Promise<void>;
  async clearAllCache(): Promise<void>;
  async listCachedModels(): Promise<Array<{modelId: string, sizeBytes: number, cachedAt: Date}>>;
}
```

### 3. Build offline indicator component (`apps/web/src/components/ui/OfflineIndicator.tsx`)
- Green dot: "Online"
- Yellow dot: "Offline — all features available"
- Red dot: "Offline — some models not downloaded"

### 4. Build Settings page (`apps/web/src/components/settings/SettingsPage.tsx`)
- **Models**: Available/downloaded models with size, download/delete buttons
- **Storage**: Total usage (models + documents + vectors), clear data
- **Device**: GPU info, WebGPU status, recommended settings
- **About**: Version, privacy, licenses

### 5. Implement install prompt (`apps/web/src/hooks/useInstallPrompt.ts`)
Custom install banner after 2nd visit. Uses `beforeinstallprompt` event.

### 6. Handle app updates
"New version available" toast with update button. Auto-update via `registerType: 'autoUpdate'`.

### 7. Optimize initial load performance
- Code split by domain (lazy load domain UIs via `React.lazy`)
- Preload critical path: app shell → GPU detection → model status
- Skeleton loading states
- Target: interactive in < 2 seconds

### 8. Implement background model download
User can browse documents while model downloads. Small progress indicator in header. Resume interrupted downloads.

### 9. Add keyboard shortcuts (`apps/web/src/hooks/useKeyboardShortcuts.ts`)
- `Ctrl/Cmd + O`: Open file picker
- `Ctrl/Cmd + Enter`: Send message
- `Ctrl/Cmd + K`: Command palette
- `Escape`: Stop generation / close modal
- `Ctrl/Cmd + E`: Export analysis

### 10. Create privacy verification page (`apps/web/src/components/settings/PrivacyVerification.tsx`)
Instructions to open Network tab. "Run test analysis" button. Shows zero requests made.

## Acceptance Criteria
- [ ] App installs as PWA on Chrome, Edge, Safari
- [ ] App works fully offline after model download
- [ ] Model cache persists across browser restarts
- [ ] Settings page shows accurate storage usage
- [ ] App loads to interactive state in < 2s
- [ ] Domain code is lazy-loaded
- [ ] Keyboard shortcuts work
- [ ] Network tab is empty during analysis
