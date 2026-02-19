# Plan: Contract Analyzer Domain UI

## Goal
Build a specialized contract analysis interface that auto-detects contract types, extracts key clauses with risk ratings, identifies obligations and deadlines, and supports contract comparison.

## Packages
`packages/ai-engine` (contract prompts) + `apps/web` (domain UI)

## Dependencies
- Plan 06 (RAG) and Plan 09 (ONNX models) complete — or using base SmolLM3 with contract-specific prompts

## Tasks

### 1. Build contract-specific prompt templates (`packages/ai-engine/src/prompts/contracts.ts`)
```typescript
export const CONTRACT_PROMPTS = {
  classify: {
    system: "You are DocIntel, a contract analysis AI. Classify the contract type based on its content.",
    user: (text: string) => `Classify this contract. Return JSON: {"type": "NDA|MSA|SaaS|Employment|Lease|Other", "confidence": 0.0-1.0}\n\n${text}`,
  },
  extractClauses: {
    system: "You are DocIntel. Extract and analyze key clauses from this contract.",
    user: (text: string) => `Extract key clauses. Return JSON array:\n[{"clause_type": "...", "text": "...", "risk_level": "high|medium|low", "risk_reason": "...", "page": N}]\n\n${text}`,
  },
  extractObligations: {
    system: "You are DocIntel. Identify all obligations, deadlines, and commitments.",
    user: (text: string) => `List obligations. Return JSON: [{"party": "...", "obligation": "...", "deadline": "...", "consequence": "..."}]\n\n${text}`,
  },
  riskSummary: {
    system: "You are DocIntel. Provide a risk assessment summary.",
    user: (text: string) => `Analyze for risks. Return JSON: {"overall_risk": "high|medium|low", "critical_issues": [...], "missing_protections": [...], "recommendations": [...]}\n\n${text}`,
  },
  compare: {
    system: "You are DocIntel. Compare two contract excerpts and identify differences.",
    user: (textA: string, textB: string) => `Compare:\n\nContract A:\n${textA}\n\nContract B:\n${textB}\n\nReturn JSON: {"differences": [{"topic": "...", "contract_a": "...", "contract_b": "...", "significance": "high|medium|low"}]}`,
  },
};
```

### 2. Build ContractAnalyzer component (`apps/web/src/components/domains/ContractAnalyzer.tsx`)
Main analysis view with tabs:
- **Overview**: Contract type, parties, dates, 1-paragraph summary
- **Risk Analysis**: Clause-by-clause risk assessment with color coding
- **Obligations**: Table of obligations with deadlines
- **Q&A**: Domain-specific chat
- **Compare**: Side-by-side comparison with another contract

### 3. Build RiskClauseCard component (`apps/web/src/components/domains/contract/RiskClauseCard.tsx`)
- Risk badge (Red/Yellow/Green)
- Clause type label
- Expandable clause text
- Risk reason explanation
- "View in document" link

### 4. Build ObligationsTable component (`apps/web/src/components/domains/contract/ObligationsTable.tsx`)
Sortable table: Party | Obligation | Deadline | Consequence | Page
- Filter by party, sort by deadline
- Export to CSV
- Highlight overdue deadlines in red

### 5. Build ContractComparison component (`apps/web/src/components/domains/contract/ContractComparison.tsx`)
- Upload two contracts side-by-side
- Run comparison prompt
- Display differences with significance ratings

### 6. Build auto-analysis pipeline (`apps/web/src/hooks/useContractAnalysis.ts`)
```typescript
import { CONTRACT_PROMPTS } from '@docintel/ai-engine';

// Orchestrates: classify → extract clauses → extract obligations → risk summary
// Caches results in IndexedDB
// Returns: { analyze, results, isAnalyzing, progress }
```

### 7. Build contract analysis export (`apps/web/src/lib/export.ts`)
- **DOCX report**: Risk assessment with summary, clause table, recommendations
- **JSON**: Raw structured data
- **CSV**: Obligations and deadlines

## Acceptance Criteria
- [ ] Contract type auto-detection works (>80% accuracy on common types)
- [ ] Risk clauses extracted with color-coded risk levels
- [ ] Obligations table populated with deadlines
- [ ] Contract comparison shows meaningful differences
- [ ] Analysis results persist across sessions
- [ ] Export to DOCX/JSON/CSV works
- [ ] "View in document" links scroll to correct page
