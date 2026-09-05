import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const ENDPOINT = 'https://zuaalqhbesywmfvuvgho.supabase.co/functions/v1/apple-calendar-sync';
const FEED_ENDPOINT = 'https://zuaalqhbesywmfvuvgho.supabase.co/functions/v1/hub-calendar-feed';
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
      setError(`Hub → Calendar preparation failed: ${err.message}`);
    } finally {
      setPreparing(false);
    }
  }

  async function regenerateToken() {
    if (!window.confirm('Regenerate the sync token? The old Apple shortcut and subscribed calendar will stop working until you replace the token.')) return;
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
  const feedHttps = token ? `${FEED_ENDPOINT}?token=${encodeURIComponent(token)}` : '';
  const feedWebcal = feedHttps ? feedHttps.replace(/^https:/, 'webcal:') : '#';
  const outboundBody = `{
  "token": "<sync token>",
  "outbound_only": true,
  "window_start": "${SCHOOL_START}",
  "window_end": "${SCHOOL_END}"
}`;

  return (
    <Layout>
      <div className="page-eyebrow">Calendar · Apple / Exchange bridge</div>
      <h1 className="page-title">🍎 Apple Calendar Sync</h1>
      <p className="page-desc">
        Il modo più semplice per vedere automaticamente le lezioni dell’Hub nell’app Calendario di iPhone è l’abbonamento calendario qui sotto.
        Il vecchio Comando Rapido resta disponibile solo se vuoi anche importare nell’Hub gli eventi dei calendari Exchange.
      </p>

      {error && <div className="error-text">{error}</div>}

      <div className="section-block" style={{ border: '2px solid var(--green, #547c2f)' }}>
        <div className="page-eyebrow">Metodo consigliato · nessun blocco da modificare</div>
        <h2>1. Aggiungi Kids&Us Hub a Calendario</h2>
        <p>
          Tocca una sola volta il pulsante qui sotto da iPhone/iPad e conferma l’abbonamento. Comparirà un calendario separato chiamato <strong>Kids&Us Hub</strong> con tutte le lezioni 2026/27.
          Le modifiche fatte nell’Hub verranno recepite quando Apple aggiorna il calendario in abbonamento.
        </p>
        <a className="btn" href={feedWebcal} style={{ textDecoration: 'none', pointerEvents: token ? 'auto' : 'none', opacity: token ? 1 : .55 }}>
          📅 Subscribe to Kids&Us Hub
        </a>
        <p style={{ marginTop: 10, marginBottom: 0, color: 'var(--ink-soft)' }}>
          È read-only su iPhone: la fonte resta l’Hub. Così non rischiamo duplicati e non devi costruire il flusso Hub → Calendar in Comandi Rapidi.
        </p>
      </div>

      <div className="section-block">
        <h2>2. Prepara / verifica le lezioni Hub</h2>
        <p>
          Questo controllo crea/aggiorna anche le singole sessioni interne dal <strong>21 settembre 2026 al 12 giugno 2027</strong>, seguendo il planning Kids&Us e saltando festività e vacanze scolastiche.
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

      <div className="section-block">
        <h2>3. Calendar → Hub · opzionale</h2>
        <p>
          Il Comando Rapido <strong>{SHORTCUT_NAME}</strong> può continuare a leggere i calendari Exchange <strong>Calendario</strong> e <strong>Giorgia Fini</strong> e mostrarli nell’Hub come eventi read-only.
          Non serve più modificarlo per esportare le lezioni dell’Hub.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn secondary" href={runUrl} style={{ textDecoration: 'none' }}>Run existing sync</a>
          <a className="btn secondary" href="shortcuts://open-shortcut?name=Kids%26Us%20Calendar%20Sync" style={{ textDecoration: 'none' }}>Open Shortcut</a>
        </div>
      </div>

      <div className="section-block">
        <h2>Connection data</h2>
        <div className="field">
          <label>Subscribed calendar URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={loading ? 'Loading…' : feedHttps} style={{ flex: 1 }} />
            <button className="btn secondary" disabled={!feedHttps} onClick={() => copy(feedHttps, 'feed')}>{copied === 'feed' ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
        <div className="field">
          <label>Shortcut endpoint</label>
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

      <details className="section-block">
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Advanced: old Hub → Exchange Shortcut method</summary>
        <p style={{ marginTop: 12, color: 'var(--ink-soft)' }}>
          Non è più necessario per vedere le lezioni nell’app Calendario. Lo lasciamo documentato soltanto nel caso in cui in futuro tu voglia scrivere fisicamente gli eventi dentro il calendario Exchange <strong>Calendario</strong>.
        </p>
        <pre className="pre-text" style={{ background: '#f7f8fb', padding: 14, borderRadius: 10 }}>{outboundBody}</pre>
      </details>

      <a href="/calendar" className="btn secondary" style={{ textDecoration: 'none' }}>← Back to Calendar</a>
    </Layout>
  );
}
