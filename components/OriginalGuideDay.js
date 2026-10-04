import { useEffect, useState } from 'react';

export default function OriginalGuideDay({ source }) {
  const [document, setDocument] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(source.url, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Guide unavailable'); return response.json(); })
      .then(setDocument)
      .catch(error => { if (error.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [source.url]);
  if (error) return <p role="alert">Unable to load the original guide. Please reload this page.</p>;
  if (!document) return <p role="status">Loading…</p>;
  return <div className="original-guide-day">{document.columns.map(column =>
    <figure className="original-guide-column" key={`${column.page}-${column.side}`}>
      <img src={column.src} width={column.width} height={column.height} alt={column.text} />
    </figure>
  )}</div>;
}
