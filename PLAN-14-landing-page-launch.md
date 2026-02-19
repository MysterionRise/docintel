# Plan: Landing Page & Launch

## Goal
Build a high-converting landing page that communicates the privacy value proposition, and prepare for launch.

## Package
`apps/web` (integrated landing page route, or separate static build)

## Dependencies
- Plans 12 (PWA) and 13 (Monetization) complete

## Tasks

### 1. Build landing page (`apps/web/src/components/landing/LandingPage.tsx`)
Single-page with sections:
- **Hero**: "AI Document Analysis That Never Leaves Your Device" + demo GIF
- **Problem**: "Every time you upload a contract to ChatGPT..."
- **Solution**: "DocIntel runs entirely in your browser. Open Network tab — it's empty."
- **Demo**: Interactive embedded demo (load sample contract, show analysis)
- **Domains**: 4 cards for contract/medical/financial/legal
- **How It Works**: 3-step visual (Upload → AI Analyzes Locally → Export)
- **Pricing**: 3-tier comparison table
- **FAQ**: Speed, accuracy, device requirements
- **CTA**: "Try Free — No Sign-Up Required"

### 2. Interactive demo component (`apps/web/src/components/landing/InteractiveDemo.tsx`)
Pre-loaded sample NDA. "Analyze" button triggers on-device inference. Shows real extraction. Fallback: pre-recorded video/GIF.

### 3. Trust indicators
- "100% On-Device" badge with verification link
- "GDPR-friendly by design" badge
- Open-source model info
- "Verified: Zero network requests during analysis" screenshot

### 4. SEO optimization
Target: "private document analysis AI", "offline contract analyzer", "GDPR compliant document AI", "browser AI document analysis"

### 5. Prepare launch assets
- Product Hunt: 5 screenshots, 1 GIF, description
- Hacker News "Show HN" post
- Twitter thread
- LinkedIn article targeting legal ops / compliance
- Blog post: "Why Your Documents Should Never Leave Your Device"

### 6. Blog (`apps/web/src/components/blog/` or separate route)
- Launch announcement
- Technical deep-dive: "Running a 3B LLM in a Browser Tab"
- Privacy comparison: "DocIntel vs ChatGPT vs Claude for Document Analysis"

### 7. Legal pages (`apps/web/src/components/legal/`)
- Privacy Policy: "We don't collect your data. Period."
- Terms of Service
- Open-source licenses page

## Acceptance Criteria
- [ ] Landing page loads fast (Lighthouse > 90)
- [ ] Interactive demo works (or video fallback)
- [ ] Pricing section clear with CTA buttons
- [ ] SEO meta tags set
- [ ] Product Hunt assets prepared
- [ ] Legal pages complete
