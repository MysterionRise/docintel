# Plan: Medical, Financial & Legal Domain UIs

## Goal
Build specialized interfaces for the remaining three document domains, each with domain-specific extraction, visualization, and export capabilities.

## Packages
`packages/ai-engine` (domain prompts in `src/prompts/`) + `apps/web` (domain UIs in `src/components/domains/`)

## Dependencies
- Plan 10 (Contract Analyzer) complete — establishes the domain UI pattern

## Tasks

---

## MEDICAL RECORD SUMMARIZER

### 1. Medical prompt templates (`packages/ai-engine/src/prompts/medical.ts`)
- `classifyDocument`, `extractDiagnoses`, `extractMedications`, `extractLabResults`, `summarize`, `findInteractions`

### 2. MedicalSummarizer (`apps/web/src/components/domains/MedicalSummarizer.tsx`)
Tabs: Summary | Diagnoses | Medications | Lab Results | Timeline | Q&A

### 3. PatientTimeline (`apps/web/src/components/domains/medical/PatientTimeline.tsx`)
Chronological view: admission → procedures → labs → discharge. Color coded.

### 4. LabResultsTable (`apps/web/src/components/domains/medical/LabResultsTable.tsx`)
Test | Value | Unit | Reference | Flag (✓/↑/↓/⚠). Exportable to CSV.

### 5. Medical export — Patient summary card (PDF), structured JSON, medication CSV.

---

## FINANCIAL DOCUMENT EXTRACTOR

### 6. Financial prompt templates (`packages/ai-engine/src/prompts/financial.ts`)
- `classifyDocument`, `extractLineItems`, `extractTotals`, `extractEntities`, `reconcile`

### 7. FinancialExtractor (`apps/web/src/components/domains/FinancialExtractor.tsx`)
Tabs: Extraction | Line Items | Batch Mode | Reconciliation | Q&A

### 8. BatchProcessor (`apps/web/src/components/domains/financial/BatchProcessor.tsx`)
- Process 10-50 invoices sequentially (avoid OOM)
- Progress: "Processing invoice 3/47..."
- Results table with aggregate stats
- Export all as single CSV/XLSX

### 9. EditableExtractionTable (`apps/web/src/components/domains/financial/EditableExtractionTable.tsx`)
User-correctable extraction results. Original in gray, edits in black. Confirm button.

### 10. Financial export — CSV/XLSX (line items), JSON, batch CSV.

---

## LEGAL DISCOVERY ASSISTANT

### 11. Legal prompt templates (`packages/ai-engine/src/prompts/legal.ts`)
- `classifyDocument`, `assessRelevance`, `detectPrivilege`, `extractEntities`, `categorize`

### 12. LegalDiscovery (`apps/web/src/components/domains/LegalDiscovery.tsx`)
Tabs: Document Set | Relevance Review | Privilege Log | Search | Timeline | Q&A

### 13. DocumentSetTable (`apps/web/src/components/domains/legal/DocumentSetTable.tsx`)
Columns: Name | Type | Relevance | Privilege | Date | Entities. Sortable, filterable, bulk actions.

### 14. PrivilegeLogGenerator (`apps/web/src/components/domains/legal/PrivilegeLogGenerator.tsx`)
Auto-generate privilege log entries. Export as standard XLSX template.

### 15. CaseIssueManager (`apps/web/src/components/domains/legal/CaseIssueManager.tsx`)
User-defined case issues/topics. Classify each document against the issue list. Heat map.

### 16. Legal export — Privilege log (XLSX), production set, issue report, timeline CSV.

---

## SHARED COMPONENTS

### 17. DomainSelector (`apps/web/src/components/domains/DomainSelector.tsx`)
Auto-detect domain from document content, manual override, model download prompt.

### 18. DomainRouter (`apps/web/src/hooks/useDomainRouter.ts`)
```typescript
import { type ParsedDocument } from '@docintel/document-parser';
// Classify document → suggest domain → route to correct UI
```

### 19. Universal export (`apps/web/src/lib/export.ts`)
```typescript
export async function exportToDOCX(data: any, template: string): Promise<Blob>;
export function exportToCSV(data: Record<string, any>[]): string;
export function exportToXLSX(data: Record<string, any>[], sheetName: string): Blob;
export function exportToJSON(data: any): string;
export function exportToPDF(html: string): Promise<Blob>;
```

## Acceptance Criteria
- [ ] All 4 domain UIs are functional and visually distinct
- [ ] Auto-domain detection works (>75% accuracy)
- [ ] Each domain's extraction produces structured results
- [ ] Financial batch processing handles 20+ invoices
- [ ] Legal privilege log generates in standard format
- [ ] Medical timeline renders chronologically
- [ ] All export formats work (DOCX, CSV, XLSX, JSON, PDF)
- [ ] Domain model switching works (download on first use)
