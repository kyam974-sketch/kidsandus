import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const ENDPOINT = 'https://zuaalqhbesywmfvuvgho.supabase.co/functions/v1/apple-calendar-sync';
const SHORTCUT_FEED_ENDPOINT = 'https://zuaalqhbesywmfvuvgho.supabase.co/functions/v1/hub-calendar-feed';
const SHORTCUT_NAME = 'Kids&Us Calendar Sync';
const SCHOOL_START = '2026-09-21';
const SCHOOL_END = '2027-06-12';

export default function CalendarSyncSetup() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState(null);
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

  async function prepareHubCalendar() {
    if (!token) return;
    setPreparing(true);
    setError('');
    setPreview(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          outbound_only: true,
          window_start: SCHOOL_START,
          window_end: SCHOOL_END,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setPreview(body);
    } catch (err) {
      setError(`Hub calendar preparation failed: ${err.message}`);
    } finally {
      setPreparing(false);
    }
  }

  async function regenerateToken() {
    if (!window.confirm('Regenerate the sync token? The existing Apple shortcut will stop working until you replace the token.')) return;
    const { data: auth } = await supabase.auth.getUser();
    const next = crypto.randomUUID();
    const { error: updateError } = await supabase
      .from('calendar_sync_settings')
      .update({ sync_token: next, updated_at: new Date().toISOString() })
      .eq('user_id', auth?.user?.id);
    if (updateError) { setError(updateError.message); return; }
    setToken(next);
    setPreview(null);
  }

  const runUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
  const shortcutFeedUrl = token
    ? `${SHORTCUT_FEED_ENDPOINT}?token=${encodeURIComponent(token)}&format=shortcut&days=60`
    : '';

  return (
    <Layout>
      <div className="page-eyebrow">Calendar · Exchange bridge</div>
      <h1 className="page-title">📅 Exchange Calendar Sync</h1>
      <p className="page-desc">
        Le lezioni dell’Hub devono finire nel vero calendario aziendale Microsoft 365 / Exchange <strong>Calendario</strong>, così sono visibili anche in Outlook e nell’app Calendario di iPhone.
      </p>

      {error && <div className="error-text">{error}</div>}

      <div className="section-block">
        <h2>1. Prepara / verifica le lezioni Hub</h2>
        <p>
          Crea o aggiorna le singole sessioni interne dal <strong>21 settembre 2026 al 12 giugno 2027</strong>, seguendo il planning Kids&Us e saltando festività e vacanze scolastiche.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" disabled={loading || preparing || !token} onClick={prepareHubCalendar}>
            {preparing ? 'Preparing…' : 'Prepare Hub lessons'}
          </button>
          {preview && (
            <strong style={{ color: 'var(--green, #547c2f)' }}>
              ✓ {preview.hub_event_count} lessons ready · {preview.window_start} → {preview.window_end}
            </strong>
          )}
        </div>
      </div>

      <div className="section-block" style={{ border: '2px solid var(--green, #547c2f)' }}>
        <div className="page-eyebrow">Metodo semplificato</div>
        <h2>2. Hub → Exchange con un piccolo Shortcut dedicato</h2>
        <p>
          Il server ora restituisce le lezioni dei prossimi 60 giorni già appiattite, una per riga, nel formato <strong>Titolo ### Inizio ### Fine</strong>. Non servono più dizionari annidati, chiavi <code>title/start/end</code> o quattro blocchi “Ottieni valore”.
        </p>
        <div className="field">
          <label>URL pronto per il nuovo Shortcut</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={loading ? 'Loading…' : shortcutFeedUrl} style={{ flex: 1 }} />
            <button className="btn" disabled={!shortcutFeedUrl} onClick={() => copy(shortcutFeedUrl, 'shortcut-feed')}>
              {copied === 'shortcut-feed' ? 'Copied' : 'Copy URL'}
            </button>
          </div>
        </div>
        <p style={{ marginBottom: 0, color: 'var(--ink-soft)' }}>
          Il nuovo Shortcut sarà separato da quello esistente: prima elimina dal calendario <strong>Calendario</strong> solo gli eventi futuri che iniziano con “Kids&Us ·”, poi ricrea il blocco dei prossimi 60 giorni dall’Hub. In questo modo modifiche e cancellazioni si riallineano senza gestire ID o duplicati.
        </p>
      </div>

      <div className="section-block">
        <h2>3. Calendar → Hub · resta separato</h2>
        <p>
          Il Comando Rapido <strong>{SHORTCUT_NAME}</strong> può continuare a leggere i calendari Exchange <strong>Calendario</strong> e <strong>Giorgia Fini</strong> e mostrarli nell’Hub come eventi read-only. Non dobbiamo più modificare quella parte fragile.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn secondary" href={runUrl} style={{ textDecoration: 'none' }}>Run existing sync</a>
          <a className="btn secondary" href="shortcuts://open-shortcut?name=Kids%26Us%20Calendar%20Sync" style={{ textDecoration: 'none' }}>Open existing Shortcut</a>
        </div>
      </div>

      <div className="section-block">
        <h2>Connection data</h2>
        <div className="field">
          <label>Inbound Shortcut endpoint</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={ENDPOINT} style={{ flex: 1 }} />
            <button className="btn secondary" onClick={() => copy(ENDPOINT, 'endpoint')}>{copied === 'endpoint' ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
        <div className="field">
          <label>Sync token</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={loading ? 'Loading…' : token} style={{ flex: 1 }} />
            <button className="btn secondary" disabled={!token} onClick={() => copy(token, 'token')}>{copied === 'token' ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
        <button className="link-btn danger" onClick={regenerateToken}>Regenerate token</button>
      </div>

      <a href="/calendar" className="btn secondary" style={{ textDecoration: 'none' }}>← Back to Calendar</a>
    </Layout>
  );
}
