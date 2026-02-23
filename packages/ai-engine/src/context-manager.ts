export class ContextManager {
  private maxContextTokens: number;

  constructor(maxContextTokens: number = 3000) {
    this.maxContextTokens = maxContextTokens;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Fit document text into the context window.
   * Strategy: include pages sequentially until budget is exhausted.
   * Prioritizes earlier pages (usually most important in documents).
   */
  fitToContext(
    fullText: string,
    pageTexts: string[],
  ): {
    context: string;
    includedPages: number[];
    truncated: boolean;
    totalTokens: number;
  } {
    // If full text fits, include everything
    const fullTokens = this.estimateTokens(fullText);
    if (fullTokens <= this.maxContextTokens) {
      return {
        context: fullText,
        includedPages: pageTexts.map((_, i) => i + 1),
        truncated: false,
        totalTokens: fullTokens,
      };
    }

    // Otherwise, include pages until we run out of budget
    const includedPages: number[] = [];
    const parts: string[] = [];
    let usedTokens = 0;

    for (let i = 0; i < pageTexts.length; i++) {
      const pageTokens = this.estimateTokens(pageTexts[i]);
      if (usedTokens + pageTokens > this.maxContextTokens) {
        // Try to fit a partial page
        const remaining = this.maxContextTokens - usedTokens;
        if (remaining > 100) {
          // At least 100 tokens worth including
          const charBudget = Math.floor(remaining * 3.5);
          parts.push(pageTexts[i].slice(0, charBudget) + '...');
          includedPages.push(i + 1);
          usedTokens += remaining;
        }
        break;
      }
      parts.push(pageTexts[i]);
      includedPages.push(i + 1);
      usedTokens += pageTokens;
    }

    return {
      context: parts.join('\n\n'),
      includedPages,
      truncated: true,
      totalTokens: usedTokens,
    };
  }

  /**
   * Fit specific chunks into context with page annotations.
   */
  fitChunksToContext(
    chunks: Array<{ text: string; startPage: number; endPage: number }>,
  ): {
    context: string;
    includedChunks: number;
    truncated: boolean;
  } {
    const parts: string[] = [];
    let usedTokens = 0;
    let includedChunks = 0;

    for (const chunk of chunks) {
      const annotated = `[Pages ${chunk.startPage}-${chunk.endPage}]\n${chunk.text}`;
      const tokens = this.estimateTokens(annotated);

      if (usedTokens + tokens > this.maxContextTokens) {
        break;
      }

      parts.push(annotated);
      usedTokens += tokens;
      includedChunks++;
    }

    return {
      context: parts.join('\n\n---\n\n'),
      includedChunks,
      truncated: includedChunks < chunks.length,
    };
  }
}
