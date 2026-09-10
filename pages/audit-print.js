import { useEffect, useState } from 'react';

function decodeBase64Url(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export default function AuditPrint() {
  const [sheetHtml, setSheetHtml] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const payload = window.location.hash.slice(1);
      if (!payload) {
        setError('No audit notes were received. Return to the Hub and try again.');
        return;
      }
      setSheetHtml(decodeBase64Url(payload));
    } catch (err) {
      setError('The audit notes could not be opened. Return to the Hub and try again.');
    }
  }, []);

  useEffect(() => {
    if (!sheetHtml) return;
    let cancelled = false;
    const markReady = async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!cancelled) setReady(true);
    };
    markReady();
    return () => { cancelled = true; };
  }, [sheetHtml]);

  return (
    <main>
      <div
        className="no-print"
        style={{
          maxWidth: 760,
          margin: '40px auto',
          padding: 24,
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          textAlign: 'center',
        }}
      >
        <h1 style={{ marginBottom: 8 }}>Audit notes ready</h1>
        <p style={{ marginTop: 0, marginBottom: 20 }}>
          This page is open in Safari. Tap the button below to use the iPad print dialog.
        </p>
        {error ? (
          <p style={{ fontWeight: 700 }}>{error}</p>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={!ready}
            onClick={() => window.print()}
            style={{ minWidth: 220 }}
          >
            {ready ? '🖨️ Print audit notes' : 'Preparing print…'}
          </button>
        )}
      </div>

      {sheetHtml && <div dangerouslySetInnerHTML={{ __html: sheetHtml }} />}
    </main>
  );
}
