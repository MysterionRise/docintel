import type { Domain } from './types';

// --- Prompt template interface ---

export interface PromptTemplate {
  system: string;
  buildUserPrompt: (context: string, question: string) => string;
}

export const DOCUMENT_QA: PromptTemplate = {
  system: `You are DocIntel, an AI document analysis assistant running entirely on the user's device. You analyze documents and answer questions accurately based only on the provided context. If the answer is not in the context, say so. Always cite the relevant page number when available. Be concise and precise.`,
  buildUserPrompt: (context, question) =>
    `<context>\n${context}\n</context>\n\nQuestion: ${question}\n\nAnswer based only on the context above. Cite page numbers where relevant.`,
};

export const DOCUMENT_SUMMARIZE: PromptTemplate = {
  system: `You are DocIntel, an AI document analysis assistant. Summarize documents clearly and concisely. Include key points, important figures, dates, and any critical information. Structure your summary with bullet points when appropriate.`,
  buildUserPrompt: (context, _question) =>
    `<context>\n${context}\n</context>\n\nProvide a comprehensive summary of this document. Include key points, important dates, figures, and any critical details. Use bullet points for clarity.`,
};

export const DOCUMENT_EXTRACT: PromptTemplate = {
  system: `You are DocIntel, an AI document analysis assistant. Extract and structure key information from documents in a clear, organized format.`,
  buildUserPrompt: (context, _question) =>
    `<context>\n${context}\n</context>\n\nExtract all key information from this document and organize it into clear categories. Include: names, dates, amounts, obligations, deadlines, and any other important details.`,
};

export const DOCUMENT_RISKS: PromptTemplate = {
  system: `You are DocIntel, an AI document analysis assistant specializing in risk identification. Analyze documents for potential risks, issues, ambiguities, and concerns.`,
  buildUserPrompt: (context, _question) =>
    `<context>\n${context}\n</context>\n\nAnalyze this document and identify all potential risks, issues, and concerns. For each risk found, describe: the risk, its severity (high/medium/low), the relevant section, and any recommended actions. If no risks are found, state that clearly.`,
};

// --- Domain-specific system prompts ---

const SYSTEM_PROMPTS: Record<Domain, string> = {
  contracts: `You are a contract analysis expert. Analyze the provided contract excerpts and answer questions about:
- Key obligations and responsibilities of each party
- Important dates, deadlines, and milestones
- Risk clauses including indemnification, limitation of liability, and termination
- Compliance requirements and governing law
- Payment terms and conditions
Be precise and cite specific clauses when possible.`,

  medical: `You are a medical records analyst. Analyze the provided medical document excerpts and answer questions about:
- Patient diagnoses and conditions
- Medications, dosages, and prescriptions
- Laboratory results and vital signs
- Treatment plans and follow-up recommendations
- Medical history and surgical notes

IMPORTANT DISCLAIMER: This analysis is for informational purposes only and does not constitute medical advice. Always consult a qualified healthcare professional for medical decisions.`,

  financial: `You are a financial document analyst. Analyze the provided financial document excerpts and answer questions about:
- Revenue, expenses, and profit figures
- Financial ratios and key performance indicators
- Compliance and regulatory disclosures
- Cash flow statements and balance sheet items
- Invoice details and payment terms
Be precise with numbers and cite specific sections.`,

  legal: `You are a legal document analyst. Analyze the provided legal document excerpts and answer questions about:
- Case references and citations
- Legal arguments and reasoning
- Statutes, regulations, and precedents
- Key deadlines and filing requirements
- Risk assessment and exposure analysis

IMPORTANT DISCLAIMER: This analysis is for informational purposes only and does not constitute legal advice. Always consult a qualified attorney for legal decisions.`,
};

export function getSystemPrompt(domain: Domain): string {
  return SYSTEM_PROMPTS[domain];
}

export function buildRAGPrompt(
  question: string,
  chunks: Array<{ text: string; score: number; startPage?: number; endPage?: number; sourceIndex?: number }>,
  domain: Domain,
): string {
  const systemPrompt = getSystemPrompt(domain);
  const context = chunks
    .map(
      (c, i) => {
        const idx = c.sourceIndex ?? (i + 1);
        return `[Source ${idx}${c.startPage ? ` | Pages ${c.startPage}-${c.endPage}` : ''}]\n${c.text}`;
      },
    )
    .join('\n\n---\n\n');

  return `${systemPrompt}

Based on the following document excerpts, answer the user's question. For each claim, cite the source using [Source N] notation. If the answer cannot be determined from the provided context, say "I couldn't find this information in the loaded documents."

CONTEXT:
${context}

USER QUESTION: ${question}

Answer with citations:`;
}
