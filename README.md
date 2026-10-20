:root {
  font-family: Inter, 'Segoe UI', sans-serif;
  line-height: 1.6;
  font-weight: 400;
  color: #0f172a;
  background: #f1f5f9;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html, body, #root {
  margin: 0;
  min-height: 100%;
  height: 100%;
}

body {
  min-height: 100vh;
}

button, input, textarea {
  font: inherit;
}

* {
  box-sizing: border-box;
}

.app {
  display: flex;
  min-height: 100vh;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
  color: #111827;
}

.sidebar {
  width: 330px;
  border-right: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  padding: 24px 18px;
  display: flex;
  flex-direction: column;
}

.brand-row h1 {
  margin: 0 0 18px;
  font-size: 1.9rem;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  font-weight: 600;
}

.mini-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.link-button,
.upload-button,
.reset-button,
.filter-chip {
  border: none;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.link-button:hover,
.upload-button:hover,
.reset-button:hover,
.filter-chip:hover {
  transform: translateY(-1px);
}

.link-button {
  background: #e2e8f0;
  color: #0f172a;
  padding: 8px 10px;
  border-radius: 8px;
}

.upload-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  color: white;
  font-size: 0.8rem;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.2);
}

.upload-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.filter-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.filter-chip {
  padding: 6px 10px;
  background: #e2e8f0;
  color: #334155;
  border-radius: 999px;
}

.filter-chip.active {
  background: #dbeafe;
  color: #1d4ed8;
}

.search-box {
  margin-bottom: 18px;
}

.search-box input {
  width: 100%;
  border: 1px solid #dbe1ea;
  border-radius: 10px;
  background: #f8fafc;
  padding: 10px 12px;
  outline: none;
}

.book-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow: auto;
}

.book-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.book-item:hover,
.book-item.active {
  background: #dbeafe;
  border-color: #bfdbfe;
}

.book-item .cover {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  background: white;
  border-radius: 12px;
  font-size: 1.5rem;
}

.book-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.book-meta strong,
.book-meta small,
.book-progress {
  display: block;
}

.book-meta small {
  color: #6b7280;
}

.book-progress {
  color: #2563eb;
  font-size: 0.72rem;
  font-weight: 600;
}

.reset-button {
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f1f5f9;
  color: #0f172a;
}

.reader-panel {
  flex: 1;
  padding: 28px 28px 36px;
}

.reader-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.reader-toolbar h2 {
  margin: 0;
  font-size: 2rem;
}

.reader-toolbar p {
  margin: 6px 0 0;
  color: #475569;
}

.controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.controls button {
  border: 0;
  background: #e2e8f0;
  color: #0f172a;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.controls button:hover {
  transform: translateY(-1px);
}

.controls button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr));
  gap: 14px;
  margin: 20px 0;
}

.stat-card {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-card span {
  color: #475569;
  font-size: 0.82rem;
}

.stat-card strong {
  font-size: 1.5rem;
}

.chapter-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 0 14px;
}

.chapter-pill {
  background: white;
  border: 1px solid #e2e8f0;
  color: #334155;
  border-radius: 999px;
  padding: 8px 12px;
  white-space: nowrap;
  cursor: pointer;
}

.chapter-pill.active {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1d4ed8;
}

.progress-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.progress-bar {
  flex: 1;
  height: 10px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.progress-bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #60a5fa);
  border-radius: inherit;
}

.pdf-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0 18px;
}

.pdf-controls button {
  border: 0;
  background: #e2e8f0;
  color: #0f172a;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(260px, 0.8fr);
  gap: 18px;
}

.book-article {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 28px;
  min-height: 420px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
}

.article-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.article-header h3 {
  margin: 0;
  font-size: 1.8rem;
}

.article-header span {
  display: inline-block;
  background: #eff6ff;
  color: #2563eb;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.8rem;
  font-weight: 600;
}

.book-article p {
  margin: 0 0 18px;
  color: #1f2937;
}

.note-panel {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 18px;
  min-height: 420px;
}

.note-panel h4 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}

.note-panel textarea {
  width: 100%;
  min-height: 330px;
  resize: vertical;
  border: 1px solid #dbe1ea;
  border-radius: 12px;
  background: #f8fafc;
  color: inherit;
  padding: 12px;
  outline: none;
}

.pdf-preview {
  margin-bottom: 12px;
  border-radius: 14px;
  overflow: auto;
  background: #f8fafc;
  padding: 10px;
  border: 1px solid #e2e8f0;
}

.pdf-preview canvas {
  display: block;
  max-width: 100%;
  margin: 0 auto;
  border-radius: 8px;
  background: white;
}

.app.dark {
  background: linear-gradient(180deg, #020817 0%, #0f172a 100%);
  color: #e2e8f0;
}

.app.dark .sidebar,
.app.dark .book-article,
.app.dark .chapter-pill,
.app.dark .controls button,
.app.dark .search-box input,
.app.dark .note-panel,
.app.dark .stat-card,
.app.dark .reset-button,
.app.dark .pdf-preview,
.app.dark .filter-chip {
  background: #0f172a;
  border-color: #334155;
  color: #e2e8f0;
}

.app.dark .book-item,
.app.dark .progress-bar,
.app.dark .note-panel textarea,
.app.dark .pdf-preview canvas {
  background: #111827;
  color: #e2e8f0;
}

.app.dark .reader-toolbar p,
.app.dark .book-item small,
.app.dark .book-article p,
.app.dark .stat-card span,
.app.dark .book-progress {
  color: #cbd5e1;
}

.app.dark .article-header span {
  background: rgba(59, 130, 246, 0.18);
  color: #bfdbfe;
}

@media (max-width: 900px) {
  .app {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
  }

  .reader-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }

  .book-article,
  .note-panel {
    min-height: 0;
  }
}
