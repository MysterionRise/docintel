# Plan: CI/CD & Deployment (REVISED for Turborepo)

## Goal
Automated build, test, and deploy pipeline for the Turborepo monorepo. Turbo's caching makes CI fast — only rebuild/retest what changed.

## Tasks

### 1. Set up GitHub Actions CI
`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # Needed for turbo to detect changes

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # Turbo handles dependency ordering and caching
      - name: Lint
        run: pnpm turbo lint

      - name: Type Check
        run: pnpm turbo type-check

      - name: Test
        run: pnpm turbo test:coverage

      - name: Build
        run: pnpm turbo build

      # Upload web app build for deployment
      - uses: actions/upload-artifact@v4
        with:
          name: web-dist
          path: apps/web/dist/

      # Upload coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: |
            packages/ai-engine/coverage/
            packages/document-parser/coverage/
            apps/web/coverage/
```

### 2. Set up Remote Caching (optional but very helpful)
Turbo Remote Caching speeds up CI by sharing build cache across runs:
```bash
# Login to Vercel (Turbo's remote cache provider)
npx turbo login
npx turbo link
```

Or self-host with `turbo-remote-cache-cloudflare`.

### 3. Deploy web app to Cloudflare Pages
`.github/workflows/deploy-web.yml`:
```yaml
name: Deploy Web
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build --filter=@docintel/web

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy apps/web/dist --project-name=docintel
```

### 4. Deploy billing worker
`.github/workflows/deploy-billing.yml`:
```yaml
name: Deploy Billing Worker
on:
  push:
    branches: [main]
    paths:
      - 'services/billing-worker/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Deploy Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy --config services/billing-worker/wrangler.toml
```

Note: `paths` filter means this only runs when billing worker code changes.

### 5. PR preview deployments
Add to Cloudflare Pages settings or use:
```yaml
# In ci.yml, add:
- name: Deploy Preview
  if: github.event_name == 'pull_request'
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    command: pages deploy apps/web/dist --project-name=docintel --branch=${{ github.head_ref }}
```

This gives every PR a unique URL like `pr-123.docintel.pages.dev`.

### 6. Configure required headers for production
`apps/web/public/_headers`:
```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: interest-cohort=()
```

### 7. Set up ESLint for monorepo
Root `eslint.config.js` (flat config):
```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  { ignores: ['**/dist/', '**/node_modules/', 'fine-tuning/'] },
);
```

### 8. Set up pre-commit hooks
```bash
pnpm add -D husky lint-staged -w  # -w installs at workspace root
pnpm exec husky init
```

`.husky/pre-commit`:
```bash
pnpm lint-staged
```

Root `.lintstagedrc.json`:
```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,css,yml,yaml}": ["prettier --write"]
}
```

### 9. Add useful root scripts
Update root `package.json` scripts:
```json
{
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "dev:web": "turbo dev --filter=@docintel/web",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "test": "turbo test",
    "test:coverage": "turbo test:coverage",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "clean": "turbo clean && rm -rf node_modules",
    "deploy:web": "turbo build --filter=@docintel/web && wrangler pages deploy apps/web/dist --project-name=docintel",
    "deploy:billing": "wrangler deploy --config services/billing-worker/wrangler.toml"
  }
}
```

### 10. Dependabot for automated updates
`.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      production:
        patterns: ["*"]
        exclude-patterns: ["@types/*", "eslint*", "prettier*"]
      dev:
        patterns: ["@types/*", "eslint*", "prettier*"]
    open-pull-requests-limit: 5
```

### 11. Release workflow
Tag-based releases with changelog:
```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

## Acceptance Criteria
- [ ] `pnpm turbo build` builds everything in correct order
- [ ] CI runs lint, type-check, test, build on every PR
- [ ] Turbo caching skips unchanged packages
- [ ] Web app auto-deploys to Cloudflare Pages on merge to main
- [ ] Billing worker auto-deploys only when its files change
- [ ] PR preview deployments work
- [ ] COOP/COEP headers are set in production
- [ ] Pre-commit hooks catch lint/format errors
- [ ] Dependabot creates update PRs weekly
