import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const ENDPOINT = 'https://zuaalqhbesywmfvuvgho.supabase.co/functions/v1/apple-calendar-sync';
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
    if (!window.confirm('Regenerate the sync token? The old Apple shortcut will stop working until you replace the token.')) return;
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
        Sync bidirezionale: gli impegni Exchange <strong>Calendario</strong> e <strong>Giorgia Fini</strong> possono essere letti nell’Hub;
        le lezioni create nell’Hub vengono invece rispecchiate nel calendario Exchange <strong>Calendario</strong> dell’iPhone.
        Per le lezioni Kids&Us, l’Hub è la fonte principale.
      </p>

      {error && <div className="error-text">{error}</div>}

      <div className="section-block">
        <h2>1. Prepara le lezioni Hub</h2>
        <p>
          Questo crea/aggiorna le singole sessioni dal <strong>21 settembre 2026 al 12 giugno 2027</strong>,
          seguendo il planning Kids&Us e saltando automaticamente festività e vacanze scolastiche.
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
        <h2>2. Hub → Calendario iPhone</h2>
        <p>
          Il comando rapido deve leggere la risposta del server dopo il POST. La chiave <strong>hub_events</strong> contiene tutte le lezioni da creare o aggiornare nel calendario Exchange <strong>Calendario</strong>.
        </p>
        <ol style={{ lineHeight: 1.8 }}>
          <li>Dopo <strong>Ottieni contenuti dell’URL</strong>, prendi il valore della chiave <strong>hub_events</strong>.</li>
          <li>Usa <strong>Ripeti con ogni elemento</strong>.</li>
          <li>Per ogni elemento, cerca in <strong>Calendario</strong> un evento le cui note contengano <strong>KIDSUS_SESSION:</strong> seguito da <strong>session_id</strong>.</li>
          <li>Se esiste, aggiorna titolo, inizio, fine, luogo e note. Se non esiste, usa <strong>Aggiungi nuovo evento</strong> nel calendario <strong>Calendario</strong>.</li>
          <li>Il titolo, gli orari, il luogo e le note vanno presi direttamente dall’elemento restituito dall’Hub.</li>
        </ol>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn" href={runUrl} style={{ textDecoration: 'none' }}>Run Kids&Us Calendar Sync</a>
          <a className="btn secondary" href="shortcuts://open-shortcut?name=Kids%26Us%20Calendar%20Sync" style={{ textDecoration: 'none' }}>Open Shortcut</a>
        </div>
      </div>

      <div className="section-block">
        <h2>3. Eliminazioni e modifiche</h2>
        <p>
          Ogni lezione Hub porta nelle note un identificatore <strong>KIDSUS_SESSION</strong>. In questo modo il comando rapido non crea duplicati:
          trova l’evento già esistente e lo aggiorna. Se una classe viene modificata nell’Hub, la successiva sincronizzazione aggiorna le lezioni future.
        </p>
        <p style={{ marginBottom: 0 }}>
          La risposta contiene anche <strong>delete_calendar_session_ids</strong>: gli eventuali eventi Kids&Us con quegli identificatori possono essere eliminati da <strong>Calendario</strong> perché non esistono più nell’Hub.
        </p>
      </div>

      <div className="section-block">
        <h2>4. Calendar → Hub</h2>
        <p style={{ marginBottom: 10 }}>
          La parte che avevamo già configurato resta valida: il comando rapido può leggere i due calendari Exchange e mostrarli nell’Hub come eventi read-only.
        </p>
        <table className="simple-table">
          <thead><tr><th>Priority</th><th>Apple calendar</th><th>Use in Hub</th></tr></thead>
          <tbody>
            <tr><td><strong>1</strong></td><td><strong>Calendario</strong></td><td>Personal work calendar + Hub lessons</td></tr>
            <tr><td>2</td><td>Giorgia Fini</td><td>Direction / demos · secondary</td></tr>
          </tbody>
        </table>
      </div>

      <div className="section-block">
        <h2>5. Connection data</h2>
        <div className="field">
          <label>Endpoint</label>
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

      <div className="section-block">
        <h2>Outbound-only request</h2>
        <p style={{ color: 'var(--ink-soft)' }}>Per un comando rapido dedicato solo a Hub → Calendar puoi usare questo body JSON.</p>
        <pre className="pre-text" style={{ background: '#f7f8fb', padding: 14, borderRadius: 10 }}>{outboundBody}</pre>
        <button className="btn secondary" onClick={() => copy(outboundBody, 'body')}>{copied === 'body' ? 'Copied' : 'Copy JSON'}</button>
      </div>

      <a href="/calendar" className="btn secondary" style={{ textDecoration: 'none' }}>← Back to Calendar</a>
    </Layout>
  );
}
