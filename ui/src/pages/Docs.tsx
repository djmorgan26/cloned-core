import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { api, type DocEntry } from '../api/client.ts';

export function Docs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const path = searchParams.get('path') ?? '';
  const [list, setList] = useState<{ docs: import('../api/client').DocEntry[] } | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.docs
      .list('all')
      .then((data) => {
        if (!cancelled) setList(data);
      })
      .catch(() => {
        if (!cancelled) setList({ docs: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    api.docs
      .getContent(path)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setContent(null);
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const byCategory = React.useMemo(() => {
    if (!list || !list.docs.length) return new Map<string, DocEntry[]>();
    const map = new Map<string, DocEntry[]>();
    for (const doc of list.docs) {
      const cat = doc.category || 'other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(doc);
    }
    return map;
  }, [list]);

  return (
    <div style={{ padding: 24, display: 'flex', gap: 24, minHeight: '100%' }}>
      <aside style={{ width: 260, flexShrink: 0 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Docs</h2>
        {loading ? (
          <p style={{ color: 'var(--text-dim)' }}>Loading…</p>
        ) : (
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from(byCategory.entries()).map(([category, docs]) => (
              <div key={category}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4 }}>
                  {category}
                </div>
                {docs.map((doc) => (
                  <button
                    key={doc.path}
                    type="button"
                    onClick={() => setSearchParams({ path: doc.path })}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 8px',
                      marginBottom: 2,
                      border: 'none',
                      borderRadius: 4,
                      background: path === doc.path ? 'var(--bg-hover)' : 'transparent',
                      color: path === doc.path ? 'var(--text)' : 'var(--text-dim)',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    {doc.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}
      </aside>
      <main style={{ flex: 1, maxWidth: 720 }}>
        {!path && (
          <p style={{ color: 'var(--text-dim)' }}>Select a doc from the sidebar.</p>
        )}
        {path && contentLoading && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}
        {path && !contentLoading && content === null && (
          <p style={{ color: 'var(--text-dim)' }}>Failed to load doc.</p>
        )}
        {path && !contentLoading && content !== null && (
          <div className="doc-content" style={{ lineHeight: 1.6 }}>
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{content}</ReactMarkdown>
          </div>
        )}
      </main>
    </div>
  );
}
