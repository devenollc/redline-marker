import * as path from 'path';

export class PathValidator {
  /**
   * Validates that a file path is safe for review operations.
   * Prevents path traversal and ensures file is within .claude/ directory.
   */
  static validateReviewPath(filePath: string, workspaceRoot: string): {
    valid: boolean;
    error?: string;
    normalized?: string;
  } {
    try {
      // Remove any URL encoding
      const decoded = decodeURIComponent(filePath);

      // Normalize to prevent traversal
      const normalized = path.normalize(decoded);

      // Must not contain path traversal sequences
      if (normalized.includes('..')) {
        return { valid: false, error: 'Path contains invalid traversal sequence (..)' };
      }

      // Must not be absolute
      if (path.isAbsolute(normalized)) {
        return { valid: false, error: 'Path must be relative to workspace' };
      }

      // Construct full path and verify it's within workspace
      const fullPath = path.join(workspaceRoot, normalized);
      const relativePath = path.relative(workspaceRoot, fullPath);

      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return { valid: false, error: 'Path escapes workspace boundary' };
      }

      return { valid: true, normalized };
    } catch (error: any) {
      return { valid: false, error: `Path validation failed: ${error.message}` };
    }
  }

  /**
   * Sanitizes a file path for safe use in shell commands.
   */
  static sanitizeForShell(filePath: string): string {
    // Remove or escape dangerous characters
    return filePath
      .replace(/[;&|`$()]/g, '') // Remove shell metacharacters
      .replace(/\s+/g, ' ')       // Normalize whitespace
      .trim();
  }

  /**
   * Generates review JSON path from source file path.
   */
  static getReviewJsonPath(workspaceRoot: string, sourceFile: string): string {
    // Preserve full relative path to avoid collisions (e.g. src/README.md vs docs/README.md)
    const noExt = sourceFile.replace(/\\/g, '/').replace(/\.md$/i, '');
    const safe = noExt.replace(/\//g, '__');
    return path.join(workspaceRoot, '.redline', `${safe}.review.json`);
  }
}
