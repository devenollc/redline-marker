// @ts-check
(function() {
  const vscode = acquireVsCodeApi();

  window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
      case 'updateReviews':
        renderReviews(message.data);
        break;
    }
  });

  function renderReviews(reviews) {
    const app = document.getElementById('app');

    if (reviews.length === 0) {
      app.innerHTML = `
        <div class="empty-state">
          <p>No active reviews</p>
          <p class="hint">Open a file with <code>Cmd+Shift+P → Claude Review: Open in Review Mode</code></p>
        </div>
      `;
      return;
    }

    app.innerHTML = reviews.map(review => `
      <div class="review-card">
        <div class="review-header">
          <h3>${escapeHtml(review.fileName)}</h3>
          <span class="status-badge status-${review.status}">${review.status}</span>
        </div>

        <div class="review-stats">
          <span class="stat">● ${review.openComments} open</span>
          <span class="stat">✓ ${review.resolvedComments} resolved</span>
        </div>

        <div class="comments-list">
          ${review.comments.map(comment => `
            <div class="comment ${comment.resolved ? 'resolved' : ''}"
                 onclick="jumpToComment('${review.filePath}', ${comment.line})">
              <div class="comment-header">
                <span class="severity severity-${comment.severity}">${comment.severity}</span>
                <span class="line-number">Line ${comment.line}</span>
                ${comment.resolved ? '<span class="resolved-badge">✓</span>' : ''}
              </div>
              <div class="comment-body">${escapeHtml(truncate(comment.body, 80))}</div>
              ${comment.replyCount > 0 ? `<div class="reply-count">${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}</div>` : ''}
            </div>
          `).join('')}
        </div>

        <div class="actions">
          <select id="mode-${escapeHtml(review.filePath)}" class="mode-select">
            <option value="revise">Revise Plan</option>
            <option value="converse">Converse</option>
            <option value="new_version">New Version</option>
          </select>
          <button onclick="sendToClaude('${escapeHtml(review.filePath)}')" class="primary-button">
            Send to Claude
          </button>
        </div>

        ${review.claudeFeedback.status ? `
          <div class="feedback-status status-${review.claudeFeedback.status}">
            Status: ${review.claudeFeedback.status}
            ${review.claudeFeedback.responseFile ? `<br>Response: ${escapeHtml(review.claudeFeedback.responseFile)}` : ''}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  window.sendToClaude = function(filePath) {
    const modeSelect = document.getElementById(`mode-${filePath}`);
    const mode = modeSelect.value;

    vscode.postMessage({
      command: 'sendToClaude',
      filePath,
      mode
    });
  };

  window.jumpToComment = function(filePath, line) {
    vscode.postMessage({
      command: 'jumpToComment',
      filePath,
      line
    });
  };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
})();
