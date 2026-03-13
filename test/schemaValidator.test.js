// @ts-check
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { SchemaValidator } = require('../out/schemaValidator');

function validReview(overrides = {}) {
  return {
    $schema: 'https://redline-mark.devenollc.com/schemas/v1',
    schemaVersion: 1,
    file: '.claude/plans/plan.md',
    fileHash: 'sha256:abc',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'in_review',
    comments: [],
    claudeFeedback: { sentAt: null, mode: null, responseFile: null, status: null },
    ...overrides
  };
}

// --- validate ---

test('valid empty review passes', () => {
  const r = SchemaValidator.validate(validReview());
  assert.equal(r.valid, true);
});

test('missing file field fails', () => {
  const r = SchemaValidator.validate(validReview({ file: undefined }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('file')));
});

test('invalid status fails', () => {
  const r = SchemaValidator.validate(validReview({ status: 'unknown' }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('status')));
});

test('non-array comments fails', () => {
  const r = SchemaValidator.validate(validReview({ comments: 'bad' }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('comments')));
});

test('comment with invalid severity fails', () => {
  const review = validReview({
    comments: [{ id: 'c_1', line: 1, body: 'text', author: 'user', severity: 'critical' }]
  });
  const r = SchemaValidator.validate(review);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('severity')));
});

test('all valid severities pass', () => {
  for (const severity of ['info', 'question', 'warning', 'blocker']) {
    const review = validReview({
      comments: [{ id: 'c_1', line: 1, body: 'text', author: 'user', severity }]
    });
    const r = SchemaValidator.validate(review);
    assert.equal(r.valid, true, `severity '${severity}' should be valid`);
  }
});

// --- repair ---

test('repair adds missing fields with defaults', () => {
  const r = SchemaValidator.repair({});
  assert.equal(r.file, 'unknown');
  assert.equal(r.status, 'in_review');
  assert.ok(Array.isArray(r.comments));
  assert.ok(r.claudeFeedback);
});

test('repair preserves existing values', () => {
  const r = SchemaValidator.repair({ file: '.claude/plans/x.md', status: 'sent', comments: [] });
  assert.equal(r.file, '.claude/plans/x.md');
  assert.equal(r.status, 'sent');
});

// --- migrate ---

test('v0 to v1 migration adds schema fields', async () => {
  const v0 = {
    file: '.claude/plans/plan.md',
    status: 'in_review',
    comments: [{ id: 'c_1', line: 1, body: 'x', author: 'user', severity: 'info', resolvedAt: null }],
    claudeFeedback: { sentAt: null, mode: null, responseFile: null }
  };
  const r = await SchemaValidator.migrate(v0, 0);
  assert.equal(r.schemaVersion, 1);
  assert.ok(r.$schema.includes('v1'));
  assert.equal(r.comments[0].authorEmail, null);
  assert.equal(r.comments[0].resolvedBy, null);
  assert.equal(r.claudeFeedback.status, null);
});
