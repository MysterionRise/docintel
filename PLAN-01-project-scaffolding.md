# Plan: Turborepo Monorepo Scaffolding (REVISED)

## Goal
Set up the docintel monorepo using Turborepo + pnpm with properly separated packages for the PWA, AI engine, document parser, billing worker, and fine-tuning code.

## Prerequisites
- Node.js 20+
- pnpm 9+ installed globally (`npm install -g pnpm`)

## Monorepo Rationale
Split into packages that have clear boundaries:
- **apps/web**: The PWA — React UI, routing, state, domain UIs. Consumes packages.
- **packages/ai-engine**: Model loading, inference worker, embedding worker, RAG pipeline, vector store. The most complex and independently testable piece.
- **packages/document-parser**: PDF.js integration, Tesseract OCR, smart chunking. Can be tested without AI models.
- **packages/tsconfig**: Shared TypeScript configurations.
- **services/billing-worker**: Cloudflare Worker for Stripe/auth. Deploys independently.
- **fine-tuning/**: Python code. Outside the Turbo pipeline entirely.

## Tasks

### 1. Create monorepo root
```bash
mkdir docintel && cd docintel
pnpm init
```

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "services/*"
```

Create `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:coverage": {
      "dependsOn": ["^build"]
    }
  }
}
```

Root `package.json`:
```json
{
  "name": "docintel",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "test": "turbo test",
    "test:coverage": "turbo test:coverage",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "clean": "turbo clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2",
    "prettier": "^3"
  },
  "packageManager": "pnpm@9.15.0"
}
```

### 2. Create shared TypeScript config (`packages/tsconfig/`)

`packages/tsconfig/package.json`:
```json
{
  "name": "@docintel/tsconfig",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "files": ["base.json", "react.json", "worker.json"]
}
```

`packages/tsconfig/base.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "exclude": ["node_modules", "dist"]
}
```

`packages/tsconfig/react.json`:
```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  }
}
```

`packages/tsconfig/worker.json`:
```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ESNext", "WebWorker"]
  }
}
```

### 3. Create ai-engine package (`packages/ai-engine/`)

`packages/ai-engine/package.json`:
```json
{
  "name": "@docintel/ai-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "lint": "eslint src/",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@huggingface/transformers": "^3",
    "onnxruntime-web": "^1.20",
    "dexie": "^4"
  },
  "devDependencies": {
    "@docintel/tsconfig": "workspace:*",
    "tsup": "^8",
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

Directory structure:
```
packages/ai-engine/
├── src/
│   ├── index.ts                    # Public API exports
│   ├── model-manager.ts            # Model loading, caching, switching
│   ├── gpu-monitor.ts              # WebGPU detection + VRAM estimation
│   ├── rag-pipeline.ts             # Retrieval-augmented generation
│   ├── vector-store.ts             # IndexedDB vector storage + cosine search
│   ├── prompt-templates.ts         # Base prompt templates
│   ├── context-manager.ts          # Context window fitting
│   ├── constants.ts                # Model IDs, configs
│   ├── types.ts                    # Shared TypeScript types
│   ├── workers/
│   │   ├── inference.worker.ts     # LLM text generation worker
│   │   └── embedding.worker.ts     # Embedding computation worker
│   ├── prompts/
│   │   ├── contracts.ts
│   │   ├── medical.ts
│   │   ├── financial.ts
│   │   └── legal.ts
│   └── __tests__/
│       ├── vector-store.test.ts
│       ├── context-manager.test.ts
│       ├── rag-pipeline.test.ts
│       └── gpu-monitor.test.ts
├── tsconfig.json
└── package.json
```

`packages/ai-engine/tsconfig.json`:
```json
{
  "extends": "@docintel/tsconfig/base.json",
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "WebWorker"],
    "outDir": "dist"
  },
  "include": ["src"]
}
```

### 4. Create document-parser package (`packages/document-parser/`)

`packages/document-parser/package.json`:
```json
{
  "name": "@docintel/document-parser",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "lint": "eslint src/",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "pdfjs-dist": "^4",
    "tesseract.js": "^5"
  },
  "devDependencies": {
    "@docintel/tsconfig": "workspace:*",
    "tsup": "^8",
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

Directory structure:
```
packages/document-parser/
├── src/
│   ├── index.ts                # Public API exports
│   ├── document-parser.ts      # Main orchestrator
│   ├── pdf-parser.ts           # PDF.js integration
│   ├── ocr-engine.ts           # Tesseract.js integration
│   ├── chunker.ts              # Smart text chunking
│   ├── types.ts                # ParsedDocument, ParsedPage, TextChunk types
│   ├── workers/
│   │   └── pdf.worker.ts       # PDF parsing web worker
│   └── __tests__/
│       ├── chunker.test.ts
│       ├── pdf-parser.test.ts
│       └── document-parser.test.ts
├── tsconfig.json
└── package.json
```

### 5. Create main web app (`apps/web/`)

```bash
cd apps
pnpm create vite web --template react-ts
cd web
```

`apps/web/package.json` (merge with Vite template):
```json
{
  "name": "@docintel/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src/",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@docintel/ai-engine": "workspace:*",
    "@docintel/document-parser": "workspace:*",
    "react": "^19",
    "react-dom": "^19",
    "zustand": "^5",
    "lucide-react": "^0.460",
    "docx": "^9",
    "sheetjs-ce": "^0.20",
    "jspdf": "^2"
  },
  "devDependencies": {
    "@docintel/tsconfig": "workspace:*",
    "@vitejs/plugin-react": "^4",
    "@tailwindcss/vite": "^4",
    "tailwindcss": "^4",
    "vite": "^6",
    "vite-plugin-pwa": "^0.21",
    "typescript": "^5",
    "vitest": "^2",
    "@testing-library/react": "^16",
    "@testing-library/jest-dom": "^6",
    "@testing-library/user-event": "^14"
  }
}
```

`apps/web/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'DocIntel - On-Device Document Intelligence',
        short_name: 'DocIntel',
        description: 'AI-powered document analysis that never leaves your device',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/huggingface\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hf-model-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  build: {
    target: 'esnext',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

Web app directory structure:
```
apps/web/
├── public/
│   ├── manifest.json
│   ├── _headers              # Cloudflare Pages headers
│   └── icons/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/
│   │   ├── ui/               # Button, Badge, Card, Modal, Tooltip
│   │   ├── layout/           # AppShell, Sidebar, Header, StatusBar
│   │   ├── document/         # DocumentUploader, DocumentViewer, DocumentLibrary
│   │   ├── chat/             # ChatInterface, MessageBubble, StreamingText, CitationPanel
│   │   ├── analysis/         # AnalysisPanel, RiskBadge, ExtractionTable
│   │   ├── domains/          # ContractAnalyzer, MedicalSummarizer, FinancialExtractor, LegalDiscovery
│   │   ├── model/            # ModelLoader, ModelBadge, ModelSettings
│   │   ├── monetization/     # UpgradePrompt, PricingPage, UsageDashboard
│   │   └── settings/         # SettingsPage, PrivacyVerification
│   ├── hooks/
│   │   ├── useModel.ts       # Model lifecycle hook
│   │   ├── useInference.ts   # Text generation hook
│   │   ├── useEmbedding.ts   # Embedding hook
│   │   ├── useDocuments.ts   # Document CRUD hook
│   │   └── useRAG.ts         # RAG query hook
│   ├── store/
│   │   ├── app-store.ts
│   │   ├── document-store.ts
│   │   ├── model-store.ts
│   │   └── chat-store.ts
│   └── lib/
│       ├── license.ts        # Client-side license management
│       ├── export.ts         # DOCX/CSV/PDF export helpers
│       └── pricing.ts        # Tier definitions
├── tsconfig.json
├── vite.config.ts
└── package.json
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "@docintel/tsconfig/react.json",
  "compilerOptions": {
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/ai-engine" },
    { "path": "../../packages/document-parser" }
  ]
}
```

### 6. Create billing worker (`services/billing-worker/`)

`services/billing-worker/package.json`:
```json
{
  "name": "@docintel/billing-worker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "deploy:staging": "wrangler deploy --env staging",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4",
    "wrangler": "^3",
    "typescript": "^5"
  }
}
```

Minimal structure:
```
services/billing-worker/
├── src/
│   ├── index.ts           # Worker entry point
│   ├── routes/
│   │   ├── auth.ts        # /auth/validate-license
│   │   └── billing.ts     # /billing/create-checkout, /billing/webhook
│   └── lib/
│       ├── stripe.ts      # Stripe API helpers
│       └── jwt.ts         # License JWT signing/verification
├── wrangler.toml
├── tsconfig.json
└── package.json
```

### 7. Create fine-tuning directory (outside Turbo)

```
fine-tuning/
├── requirements.txt
├── schemas/
│   ├── contract_schema.json
│   ├── medical_schema.json
│   ├── financial_schema.json
│   └── legal_schema.json
├── datasets/
│   ├── contracts/
│   ├── medical/
│   ├── financial/
│   └── legal/
├── scripts/
│   ├── train_base.py
│   ├── train_contracts.py
│   ├── train_medical.py
│   ├── train_financial.py
│   ├── train_legal.py
│   ├── export_onnx.py
│   ├── validate_onnx.py
│   ├── prepare_contracts.py
│   ├── prepare_medical.py
│   ├── prepare_financial.py
│   ├── prepare_legal.py
│   └── validate_dataset.py
├── configs/
│   ├── contracts.yaml
│   ├── medical.yaml
│   ├── financial.yaml
│   └── legal.yaml
├── golden_tests/
│   ├── contracts/
│   ├── medical/
│   ├── financial/
│   └── legal/
└── models/            # .gitignore'd — too large for git
```

### 8. Root-level config files

`.gitignore`:
```gitignore
node_modules/
dist/
.turbo/
*.local
.env
.env.*

# Fine-tuning models (too large)
fine-tuning/models/
fine-tuning/.venv/

# OS
.DS_Store
Thumbs.db
```

`.npmrc`:
```
auto-install-peers=true
strict-peer-dependencies=false
```

`prettier.config.js`:
```javascript
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
};
```

### 9. Install all dependencies
```bash
# From monorepo root
pnpm install

# Verify turbo works
pnpm turbo build
pnpm turbo dev --filter=@docintel/web
```

### 10. Verify the full monorepo
```bash
pnpm build          # All packages build
pnpm lint           # All packages lint
pnpm type-check     # All packages type-check
pnpm test           # All packages test
pnpm dev --filter=@docintel/web  # Web app starts
```

## Full Directory Tree
```
docintel/
├── apps/
│   └── web/                        # Main PWA
│       ├── public/
│       ├── src/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── store/
│       │   ├── lib/
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   ├── ai-engine/                  # Model loading, inference, RAG
│   │   ├── src/
│   │   │   ├── workers/
│   │   │   ├── prompts/
│   │   │   ├── __tests__/
│   │   │   └── *.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── document-parser/            # PDF, OCR, chunking
│   │   ├── src/
│   │   │   ├── workers/
│   │   │   ├── __tests__/
│   │   │   └── *.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── tsconfig/                   # Shared TS configs
│       ├── base.json
│       ├── react.json
│       ├── worker.json
│       └── package.json
├── services/
│   └── billing-worker/             # Cloudflare Worker
│       ├── src/
│       ├── wrangler.toml
│       ├── tsconfig.json
│       └── package.json
├── fine-tuning/                    # Python (outside Turbo)
│   ├── schemas/
│   ├── datasets/
│   ├── scripts/
│   ├── configs/
│   ├── golden_tests/
│   └── requirements.txt
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── prettier.config.js
├── .gitignore
├── .npmrc
└── README.md
```

## Acceptance Criteria
- [ ] `pnpm install` resolves all workspace dependencies
- [ ] `pnpm build` builds all packages in correct dependency order
- [ ] `pnpm dev --filter=@docintel/web` starts the web app
- [ ] `@docintel/web` can import from `@docintel/ai-engine` and `@docintel/document-parser`
- [ ] TypeScript project references work across packages
- [ ] `pnpm test` runs tests in all packages
- [ ] Web Worker files compile in both ai-engine and document-parser
- [ ] COOP/COEP headers are set in Vite dev server
- [ ] PWA manifest is served
- [ ] Tailwind classes work in the web app
- [ ] `fine-tuning/` directory exists but is not part of Turbo pipeline
