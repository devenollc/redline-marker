import { ReviewFile } from './types';

export class SchemaValidator {
  static validate(data: any): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!data.file || typeof data.file !== 'string') {
      errors.push('Missing or invalid field: file');
    }
    if (!data.status || !['draft', 'in_review', 'sent', 'resolved'].includes(data.status)) {
      errors.push('Missing or invalid field: status');
    }
    if (!Array.isArray(data.comments)) {
      errors.push('Missing or invalid field: comments');
    }

    // Validate comments
    if (Array.isArray(data.comments)) {
      data.comments.forEach((c: any, i: number) => {
        if (!c.id || !c.line || !c.body || !c.author || !c.severity) {
          errors.push(`Comment ${i}: missing required fields`);
        }
        if (!['info', 'question', 'warning', 'blocker'].includes(c.severity)) {
          errors.push(`Comment ${i}: invalid severity '${c.severity}'`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  static repair(data: any): any {
    // Add missing required fields with defaults
    return {
      $schema: 'https://redline-mark.devenollc.com/schemas/v1',
      schemaVersion: data.schemaVersion || 1,
      file: data.file || 'unknown',
      fileHash: data.fileHash || '',
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
      status: data.status || 'in_review',
      comments: Array.isArray(data.comments) ? data.comments : [],
      claudeFeedback: data.claudeFeedback || {
        sentAt: null,
        mode: null,
        responseFile: null,
        status: null
      }
    };
  }

  static async migrate(data: any, fromVersion: number): Promise<ReviewFile> {
    let migrated = { ...data };

    // Migration from v0 (legacy) to v1
    if (fromVersion === 0) {
      migrated.schemaVersion = 1;
      migrated.$schema = 'https://redline-mark.devenollc.com/schemas/v1';
      migrated.fileHash = migrated.fileHash || '';

      // Add authorEmail to comments
      if (Array.isArray(migrated.comments)) {
        migrated.comments = migrated.comments.map((c: any) => ({
          ...c,
          authorEmail: c.authorEmail || null,
          resolvedBy: c.resolvedBy || null
        }));
      }

      // Add status to claudeFeedback
      if (migrated.claudeFeedback) {
        migrated.claudeFeedback.status = migrated.claudeFeedback.status || null;
      }
    }

    // Future migrations go here
    // if (fromVersion === 1) { ... }

    return migrated as ReviewFile;
  }
}
