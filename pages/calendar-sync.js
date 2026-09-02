import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const ENDPOINT = 'https://zuaalqhbesywmfvuvgho.supabase.co/functions/v1/apple-calendar-sync';
const SHORTCUT_NAME = 'Kids&Us Calendar Sync';

export default function CalendarSyncSetup() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  async function ensureToken() {
    setLoading(true); setError('');
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) { setError('Session not available.'); setLoading(false); return; }

    let { data, error: loadError } = await supabase
      .from('calendar_sync_settings')
      .select('sync_token, enabled')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!data && !loadError) {
      const result = await supabase
        .from('calendar_sync_settings')
        .insert({ user_id: user.id, enabled: true })
        .select('sync_token, enabled')
        .single();
      data = result.data; loadError = result.error;
    }

    if (loadError) setError(loadError.message);
    else setToken(data?.sync_token || '');
    setLoading(false);
  }

  useEffect(() => { ensureToken(); }, []);

  async function copy(value, which) {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(''), 1500);
  }

  async function regenerateToken() {
    if (!window.confirm('Regenerate the sync token? The old Apple shortcut will stop working until you replace the token.')) return;
    const { data: auth } = await supabase.auth.getUser();
    const next = crypto.randomUUID();
    const { error: updateError } = await supabase
      .from('calendar_sync_settings')
      .update({ sync_token: next, updated_at: new Date().toISOString() })
      .eq('user_id', auth?.user?.id);
    if (updateError) { setError(updateError.message); return; }
    setToken(next);
  }

  const runUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;

  return (
    <Layout>
      <div className="page-eyebrow">Calendar · Apple bridge</div>
      <h1 className="page-title">🍎 Apple Calendar Sync</h1>
      <p className="page-desc">Legge dal dispositivo soltanto i due calendari Exchange scelti: <strong>Calendario</strong> (priorità 1) e <strong>Giorgia Fini</strong> (priorità 2). Gli eventi importati restano read-only nell’Hub.</p>

      {error && <div className="error-text">{error}</div>}

      <div className="section-block">
        <h2>1. Crea il comando rapido</h2>
        <p>In Comandi Rapidi crea un comando chiamato <strong>{SHORTCUT_NAME}</strong>. Deve cercare gli eventi dei due calendari qui sotto e inviarli all’Hub.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn" href="shortcuts://create-shortcut" style={{ textDecoration: 'none' }}>Apri Comandi Rapidi</a>
          <a className="btn secondary" href={runUrl} style={{ textDecoration: 'none' }}>Esegui sync</a>
        </div>
      </div>

      <div className="section-block">
        <h2>2. Sorgenti da leggere</h2>
        <table className="simple-table">
          <thead><tr><th>Priorità</th><th>Calendario Apple</th><th>Uso nell’Hub</th></tr></thead>
          <tbody>
            <tr><td><strong>1</strong></td><td><strong>Calendario</strong></td><td>Calendario aziendale personale · evidenziato</td></tr>
            <tr><td>2</td><td>Giorgia Fini</td><td>Eventi/demos direzione · secondario</td></tr>
          </tbody>
        </table>
      </div>

      <div className="section-block">
        <h2>3. Dati per il POST</h2>
        <p style={{ color: 'var(--ink-soft)' }}>Il comando rapido invia solo titolo, inizio, fine, tutto il giorno, luogo e nome del calendario. Non servono partecipanti, email o note private.</p>
        <div className="field">
          <label>Endpoint</label>
          <div style={{ display: 'flex', gap: 8 }}><input readOnly value={ENDPOINT} style={{ flex: 1 }} /><button className="btn secondary" onClick={() => copy(ENDPOINT, 'endpoint')}>{copied === 'endpoint' ? 'Copied' : 'Copy'}</button></div>
        </div>
        <div className="field">
          <label>Sync token</label>
          <div style={{ display: 'flex', gap: 8 }}><input readOnly value={loading ? 'Loading…' : token} style={{ flex: 1 }} /><button className="btn secondary" disabled={!token} onClick={() => copy(token, 'token')}>{copied === 'token' ? 'Copied' : 'Copy'}</button></div>
        </div>
        <button className="link-btn danger" onClick={regenerateToken}>Regenerate token</button>
      </div>

      <div className="section-block">
        <h2>Formato che il comando rapido deve inviare</h2>
        <pre className="pre-text" style={{ background: '#f7f8fb', padding: 14, borderRadius: 10 }}>{`{
  "token": "<sync token>",
  "window_start": "<ISO date>",
  "window_end": "<ISO date>",
  "calendars": ["Calendario", "Giorgia Fini"],
  "events": [
    {
      "calendar": "Calendario",
      "title": "...",
      "start": "...",
      "end": "...",
      "all_day": false,
      "location": "..."
    }
  ]
}`}</pre>
      </div>

      <div className="section-block">
        <h2>Passi del comando rapido</h2>
        <ol style={{ lineHeight: 1.8, marginBottom: 0 }}>
          <li><strong>Trova eventi Calendario</strong> nel periodo desiderato, filtrando il calendario <strong>Calendario</strong>.</li>
          <li>Ripeti gli eventi e aggiungi a una lista: titolo, data inizio, data fine, tutto il giorno, luogo e calendario.</li>
          <li>Ripeti lo stesso per <strong>Giorgia Fini</strong>.</li>
          <li>Crea il dizionario JSON mostrato sopra.</li>
          <li>Usa <strong>Ottieni contenuti dell’URL</strong> → POST → JSON verso l’endpoint.</li>
        </ol>
      </div>

      <a href="/calendar" className="btn secondary" style={{ textDecoration: 'none' }}>← Back to Calendar</a>
    </Layout>
  );
}
