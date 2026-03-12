/**
 * anchorValidator.ts
 *
 * Validates and repairs comment anchors when source files change.
 * Prevents stale line-number references by storing content context
 * and intelligently searching for moved code.
 */

import * as crypto from 'crypto';
import { Comment, CommentAnchor, AnchorValidationResult, FileValidationResult } from './types';

export class AnchorValidator {
  /**
   * Creates an anchor for a new comment.
   * Captures surrounding context to enable future validation.
   */
  static createAnchor(
    fileLines: string[],
    line: number,
    endLine: number
  ): CommentAnchor {
    const contextLines = this.getContextLines(fileLines, line, endLine);
    const contentHash = this.hashContext(contextLines);

    return {
      line,
      endLine,
      contextBefore: contextLines.before,
      contextLine: contextLines.target,
      contextAfter: contextLines.after,
      contentHash,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Validates all comments in a session against current file state.
   * Returns detailed results and updates comment anchor validity.
   */
  static async validateAllAnchors(
    comments: Comment[],
    fileLines: string[]
  ): Promise<FileValidationResult> {
    const results = new Map<string, AnchorValidationResult>();
    let validCount = 0;
    let staleCount = 0;
    let repairedCount = 0;
    let lostCount = 0;

    for (const comment of comments) {
      const result = this.validateAnchor(comment, fileLines);
      results.set(comment.id, result);

      if (result.valid) {
        validCount++;
      } else if (result.currentLine !== null) {
        staleCount++;
        if (result.confidence === 'high' || result.confidence === 'exact') {
          repairedCount++;
        }
      } else {
        lostCount++;
      }

      // Update comment with validation result
      comment.anchorValid = result.valid;
      comment.anchorLastChecked = new Date().toISOString();
      if (result.currentLine && result.currentLine !== comment.line) {
        comment.anchorSuggestedLine = result.currentLine;
      }
    }

    return {
      totalComments: comments.length,
      validAnchors: validCount,
      staleAnchors: staleCount,
      repairedAnchors: repairedCount,
      lostAnchors: lostCount,
      results
    };
  }

  /**
   * Validates a single comment anchor against current file state.
   */
  static validateAnchor(
    comment: Comment,
    fileLines: string[]
  ): AnchorValidationResult {
    const { anchor } = comment;

    // Fast path: Check if original line still matches
    const exactMatch = this.checkExactMatch(comment, fileLines);
    if (exactMatch) {
      return {
        valid: true,
        originalLine: anchor.line,
        currentLine: anchor.line,
        confidence: 'exact'
      };
    }

    // Content has changed - search for new location
    const searchResult = this.searchForAnchor(comment, fileLines);

    if (searchResult) {
      return {
        valid: false,
        originalLine: anchor.line,
        currentLine: searchResult.line,
        confidence: searchResult.confidence,
        reason: `Content moved from line ${anchor.line} to ${searchResult.line}`
      };
    }

    // Content not found - mark as lost
    return {
      valid: false,
      originalLine: anchor.line,
      currentLine: null,
      confidence: 'lost',
      reason: 'Original content no longer exists in file'
    };
  }

  /**
   * Checks if the anchor still matches at its original line.
   */
  private static checkExactMatch(
    comment: Comment,
    fileLines: string[]
  ): boolean {
    const { anchor } = comment;
    const line = anchor.line - 1; // Convert to 0-based

    if (line < 0 || line >= fileLines.length) {
      return false;
    }

    // Check if the main line still matches
    const currentLine = fileLines[line];
    if (this.normalizeForComparison(currentLine) !==
        this.normalizeForComparison(anchor.contextLine.split('\n')[0])) {
      return false;
    }

    // For multi-line comments, check the range
    if (anchor.endLine > anchor.line) {
      const endLine = anchor.endLine - 1;
      if (endLine >= fileLines.length) {
        return false;
      }

      // Verify the context hash to ensure surrounding code hasn't changed
      const currentContext = this.getContextLines(fileLines, anchor.line, anchor.endLine);
      const currentHash = this.hashContext(currentContext);

      return currentHash === anchor.contentHash;
    }

    // For single-line comments, check before/after context
    const beforeLine = line - 1;
    const afterLine = line + 1;

    if (beforeLine >= 0 && anchor.contextBefore) {
      const currentBefore = fileLines[beforeLine];
      if (this.normalizeForComparison(currentBefore) !==
          this.normalizeForComparison(anchor.contextBefore)) {
        return false;
      }
    }

    if (afterLine < fileLines.length && anchor.contextAfter) {
      const currentAfter = fileLines[afterLine];
      if (this.normalizeForComparison(currentAfter) !==
          this.normalizeForComparison(anchor.contextAfter)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Searches for the anchor content in the file using multiple strategies.
   */
  private static searchForAnchor(
    comment: Comment,
    fileLines: string[]
  ): { line: number; confidence: 'high' | 'medium' | 'low' } | null {
    const { anchor } = comment;

    // Strategy 1: Exact content hash match (best)
    const exactMatch = this.findByContentHash(anchor, fileLines);
    if (exactMatch) {
      return { line: exactMatch, confidence: 'high' };
    }

    // Strategy 2: Find by context line + surrounding lines
    const contextMatch = this.findByContext(anchor, fileLines);
    if (contextMatch) {
      return { line: contextMatch, confidence: 'high' };
    }

    // Strategy 3: Find by context line only (medium confidence)
    const lineMatch = this.findByLineContent(anchor, fileLines);
    if (lineMatch) {
      return { line: lineMatch, confidence: 'medium' };
    }

    // Strategy 4: Fuzzy search within reasonable range (low confidence)
    const fuzzyMatch = this.findByFuzzyMatch(anchor, fileLines);
    if (fuzzyMatch) {
      return { line: fuzzyMatch, confidence: 'low' };
    }

    return null;
  }

  /**
   * Strategy 1: Find by exact content hash match.
   */
  private static findByContentHash(
    anchor: CommentAnchor,
    fileLines: string[]
  ): number | null {
    for (let i = 0; i < fileLines.length; i++) {
      const line = i + 1; // Convert to 1-based
      const context = this.getContextLines(fileLines, line, anchor.endLine - anchor.line + line);
      const hash = this.hashContext(context);

      if (hash === anchor.contentHash) {
        return line;
      }
    }
    return null;
  }

  /**
   * Strategy 2: Find by matching context (before + target + after).
   */
  private static findByContext(
    anchor: CommentAnchor,
    fileLines: string[]
  ): number | null {
    const targetNorm = this.normalizeForComparison(anchor.contextLine.split('\n')[0]);
    const beforeNorm = this.normalizeForComparison(anchor.contextBefore);
    const afterNorm = this.normalizeForComparison(anchor.contextAfter);

    for (let i = 0; i < fileLines.length; i++) {
      const lineNorm = this.normalizeForComparison(fileLines[i]);

      if (lineNorm === targetNorm) {
        // Found target line, check context
        const before = i > 0 ? this.normalizeForComparison(fileLines[i - 1]) : '';
        const after = i < fileLines.length - 1 ? this.normalizeForComparison(fileLines[i + 1]) : '';

        if (before === beforeNorm && after === afterNorm) {
          return i + 1; // Convert to 1-based
        }
      }
    }
    return null;
  }

  /**
   * Strategy 3: Find by matching just the target line.
   */
  private static findByLineContent(
    anchor: CommentAnchor,
    fileLines: string[]
  ): number | null {
    const targetNorm = this.normalizeForComparison(anchor.contextLine.split('\n')[0]);

    // Search within ±50 lines of original location first
    const searchRadius = 50;
    const center = anchor.line - 1;
    const start = Math.max(0, center - searchRadius);
    const end = Math.min(fileLines.length, center + searchRadius);

    for (let i = start; i < end; i++) {
      if (this.normalizeForComparison(fileLines[i]) === targetNorm) {
        return i + 1; // Convert to 1-based
      }
    }

    // If not found nearby, search entire file
    for (let i = 0; i < fileLines.length; i++) {
      if (i >= start && i < end) continue; // Skip already searched area

      if (this.normalizeForComparison(fileLines[i]) === targetNorm) {
        return i + 1; // Convert to 1-based
      }
    }

    return null;
  }

  /**
   * Strategy 4: Fuzzy match using token similarity.
   */
  private static findByFuzzyMatch(
    anchor: CommentAnchor,
    fileLines: string[]
  ): number | null {
    const targetTokens = this.tokenize(anchor.contextLine);
    let bestMatch: { line: number; score: number } | null = null;

    // Only search within ±30 lines of original (fuzzy search is expensive)
    const searchRadius = 30;
    const center = anchor.line - 1;
    const start = Math.max(0, center - searchRadius);
    const end = Math.min(fileLines.length, center + searchRadius);

    for (let i = start; i < end; i++) {
      const lineTokens = this.tokenize(fileLines[i]);
      const score = this.calculateTokenSimilarity(targetTokens, lineTokens);

      if (score > 0.7 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { line: i + 1, score };
      }
    }

    return bestMatch ? bestMatch.line : null;
  }

  /**
   * Generates a system message for a stale anchor.
   */
  static createStaleAnchorMessage(
    comment: Comment,
    result: AnchorValidationResult
  ): string {
    if (result.currentLine !== null) {
      return `⚠️ **Comment moved**: Originally line ${result.originalLine}, now line ${result.currentLine} (${result.confidence} confidence)\n\n` +
             `Click to update anchor.`;
    } else {
      return `⚠️ **Content not found**: This comment referenced line ${result.originalLine}, but that code no longer exists.\n\n` +
             `Original context:\n\`\`\`\n${comment.anchor.contextLine}\n\`\`\``;
    }
  }

  /**
   * Repairs a comment anchor by updating to new line number.
   */
  static repairAnchor(
    comment: Comment,
    newLine: number,
    fileLines: string[]
  ): void {
    const newAnchor = this.createAnchor(
      fileLines,
      newLine,
      newLine + (comment.anchor.endLine - comment.anchor.line)
    );

    comment.anchor = newAnchor;
    comment.line = newLine;
    comment.endLine = newLine + (comment.anchor.endLine - comment.anchor.line);
    comment.anchorValid = true;
    comment.anchorSuggestedLine = undefined;
    comment.anchorLastChecked = new Date().toISOString();
  }

  // ==================== Helper Functions ====================

  /**
   * Extracts context lines around target line(s).
   */
  private static getContextLines(
    fileLines: string[],
    line: number,
    endLine: number
  ): { before: string; target: string; after: string } {
    const idx = line - 1; // Convert to 0-based
    const endIdx = endLine - 1;

    const before = idx > 0 ? fileLines[idx - 1] || '' : '';
    const target = fileLines.slice(idx, endIdx + 1).join('\n');
    const after = endIdx < fileLines.length - 1 ? fileLines[endIdx + 1] || '' : '';

    return { before, target, after };
  }

  /**
   * Creates a hash of context for quick comparison.
   */
  private static hashContext(context: { before: string; target: string; after: string }): string {
    const combined = `${context.before}\n${context.target}\n${context.after}`;
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
  }

  /**
   * Normalizes text for comparison (trim, lowercase, collapse whitespace).
   */
  private static normalizeForComparison(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * Tokenizes text into meaningful words.
   */
  private static tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2) // Ignore short tokens
    );
  }

  /**
   * Calculates similarity between two token sets (Jaccard similarity).
   */
  private static calculateTokenSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    const intersection = new Set([...tokensA].filter(t => tokensB.has(t)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }
}
