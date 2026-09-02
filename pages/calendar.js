import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import styles from '../styles/Calendar.module.css';

const SCHOOL_YEAR = '2026-2027';
const DAYS = [
  { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' },
];
const COURSE_IDS = { Mousy: 'mousy', Linda: 'linda', Sam: 'sam', Emma: 'emma', Oliver: 'oliver', Marcia: 'marcia', 'Pam & Paul': 'pam' };

function addMinutes(time, minutes) {
  const [h, m] = String(time).slice(0, 5).split(':').map(Number);
  const total = h * 60 + m + Number(minutes || 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function localTime(value) {
  return new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
function dayBounds(day) {
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start, end };
}
function eventOnDay(event, day) {
  const { start, end } = dayBounds(day);
  return new Date(event.start_at) < end && new Date(event.end_at) > start;
}
function eventSortMinutes(event) {
  if (event.all_day) return -1;
  const d = new Date(event.start_at);
  return d.getHours() * 60 + d.getMinutes();
}

export default function CalendarPage() {
  const [classes, setClasses] = useState([]);
  const [externalEvents, setExternalEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showPrimary, setShowPrimary] = useState(true);
  const [showDirector, setShowDirector] = useState(true);

  async function loadClasses() {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('classes')
      .select('*')
      .eq('school_year', SCHOOL_YEAR)
      .eq('active', true)
      .order('weekday')
      .order('start_time');
    if (loadError) setError(loadError.message);
    setClasses(data || []);
    setLoading(false);
  }

  useEffect(() => { loadClasses(); }, []);

  const week = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
    return DAYS.map((d, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return { ...d, date };
    });
  }, [weekOffset]);

  useEffect(() => {
    async function loadExternal() {
      if (!week.length) return;
      setLoadingExternal(true);
      const start = new Date(week[0].date); start.setHours(0, 0, 0, 0);
      const end = new Date(week[5].date); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1);
      const { data, error: externalError } = await supabase
        .from('external_calendar_events')
        .select('*')
        .lt('start_at', end.toISOString())
        .gt('end_at', start.toISOString())
        .order('start_at');
      if (externalError) setError(externalError.message);
      setExternalEvents(data || []);
      setLoadingExternal(false);
    }
    loadExternal();
  }, [week]);

  function startEdit(item) {
    setEditing({
      id: item.id,
      name: item.name,
      weekday: item.weekday,
      start_time: String(item.start_time).slice(0, 5),
      story_number: item.story_number || 1,
      day_number: item.day_number || 1,
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase.from('classes').update({
      name: editing.name.trim(),
      weekday: Number(editing.weekday),
      start_time: editing.start_time,
      story_number: Number(editing.story_number) || 1,
      day_number: Number(editing.day_number) || 1,
    }).eq('id', editing.id);
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setEditing(null);
    await loadClasses();
  }

  return (
    <Layout>
      <div className="page-eyebrow">2026/27 · Classes + Apple Calendar</div>
      <h1 className="page-title">📅 Teaching week</h1>
      <p className="page-desc">Le classi dell’Hub e gli impegni Exchange che il tuo dispositivo vede in Apple Calendar, nello stesso posto.</p>

      <div className={styles.toolbar}>
        <button className="btn secondary" onClick={() => setWeekOffset((v) => v - 1)}>←</button>
        <div className={styles.weekTitle}>{week[0].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {week[5].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
        <button className="btn secondary" onClick={() => setWeekOffset((v) => v + 1)}>→</button>
        {weekOffset !== 0 && <button className="btn secondary" onClick={() => setWeekOffset(0)}>This week</button>}
        <a className="btn" href="/classes" style={{ textDecoration: 'none' }}>＋ New class</a>
        <a className="btn secondary" href="/calendar-sync" style={{ textDecoration: 'none' }}>🍎 Apple sync</a>
      </div>

      <div className={styles.sourceFilters}>
        <label><input type="checkbox" checked={showPrimary} onChange={(e) => setShowPrimary(e.target.checked)} /> <span className={styles.primaryDot} /> <strong>Calendario</strong> · aziendale personale</label>
        <label><input type="checkbox" checked={showDirector} onChange={(e) => setShowDirector(e.target.checked)} /> <span className={styles.secondaryDot} /> Giorgia Fini · direzione</label>
        {loadingExternal && <span className={styles.syncing}>Sync view…</span>}
      </div>

      {editing && <div className={`section-block ${styles.editor}`}>
        <div className={styles.editorTitle}>Edit class slot</div>
        <label>Class<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
        <label>Day<select value={editing.weekday} onChange={(e) => setEditing({ ...editing, weekday: Number(e.target.value) })}>{DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
        <label>Start<input type="time" value={editing.start_time} onChange={(e) => setEditing({ ...editing, start_time: e.target.value })} /></label>
        <label>Story<input type="number" min="1" max="6" value={editing.story_number} onChange={(e) => setEditing({ ...editing, story_number: Number(e.target.value) || 1 })} /></label>
        <label>Day<input type="number" min="1" value={editing.day_number} onChange={(e) => setEditing({ ...editing, day_number: Number(e.target.value) || 1 })} /></label>
        <button className="btn" disabled={saving} onClick={saveEdit}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
      </div>}

      {error && <div className="error-text">{error}</div>}

      {loading ? <div className="section-block">Loading…</div> : <div className={styles.weekList}>
        {week.map((day) => {
          const dayClasses = classes.filter((item) => item.weekday === day.value);
          const dayExternal = externalEvents
            .filter((event) => eventOnDay(event, day.date))
            .filter((event) => event.source_calendar === 'Calendario' ? showPrimary : showDirector);

          const items = [
            ...dayClasses.map((item) => ({ kind: 'class', sort: (() => { const [h, m] = String(item.start_time).slice(0, 5).split(':').map(Number); return h * 60 + m; })(), item })),
            ...dayExternal.map((item) => ({ kind: 'external', sort: eventSortMinutes(item), item })),
          ].sort((a, b) => a.sort - b.sort || (a.kind === 'external' ? (a.item.source_priority || 2) : 3) - (b.kind === 'external' ? (b.item.source_priority || 2) : 3));

          const today = weekOffset === 0 && new Date().toDateString() === day.date.toDateString();
          return <section className={`${styles.dayRow} ${today ? styles.today : ''}`} key={day.value}>
            <div className={styles.dayHeader}>
              <div><span className={styles.dayName}>{day.label}</span><span className={styles.date}>{day.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>
              <a className={styles.addDay} href="/classes" title="Create class">＋</a>
            </div>
            <div className={styles.lessons}>
              {items.length === 0 ? <div className={styles.empty}>No classes or work events</div> : items.map(({ kind, item }) => {
                if (kind === 'external') {
                  const spansDay = (new Date(item.end_at) - new Date(item.start_at)) >= 24 * 60 * 60 * 1000;
                  return <article className={`${styles.lesson} ${styles.externalEvent} ${item.source_priority === 1 ? styles.externalPrimary : styles.externalSecondary}`} key={`ext-${item.id}-${day.value}`}>
                    <div className={styles.timeBlock}>{item.all_day || spansDay ? <strong className={styles.allDay}>ALL DAY</strong> : <><strong>{localTime(item.start_at)}</strong><span>{localTime(item.end_at)}</span></>}</div>
                    <div className={styles.lessonMain}>
                      <div className={styles.course}>{item.title || '(untitled event)'}</div>
                      <div className={styles.groupLabel}>{item.location || 'Exchange calendar'}</div>
                      <div className={styles.plan}><span className={item.source_priority === 1 ? styles.primaryBadge : styles.secondaryBadge}>{item.source_calendar}</span> · read-only</div>
                    </div>
                    <div className={styles.readOnly}>🔒 Work event</div>
                  </article>;
                }

                const start = String(item.start_time).slice(0, 5);
                const end = addMinutes(start, item.duration_minutes);
                const courseId = COURSE_IDS[item.course] || item.course.toLowerCase();
                return <article className={styles.lesson} key={item.id}>
                  <div className={styles.timeBlock}><strong>{start}</strong><span>{end}</span></div>
                  <div className={styles.lessonMain}>
                    <div className={styles.course}>{item.course}</div>
                    <div className={styles.groupLabel}>{item.name} · {item.location}</div>
                    <div className={styles.plan}>Story {item.story_number || 1} · Day {item.day_number || 1} <span>· {item.duration_minutes} min</span></div>
                  </div>
                  <div className={styles.actions}>
                    <a className={styles.open} href={`/planner?course=${encodeURIComponent(courseId)}&story=${item.story_number || 1}&day=${item.day_number || 1}&start=${encodeURIComponent(start)}`}>Open Planner →</a>
                    <button onClick={() => startEdit(item)}>Edit</button>
                  </div>
                </article>;
              })}
            </div>
          </section>;
        })}
      </div>}

      <div className={styles.note}>🍎 <strong>Calendario</strong> ha priorità 1. <strong>Giorgia Fini</strong> è una sorgente secondaria perché contiene anche eventi di altre colleghe. Gli eventi Exchange sono solo letti: l’Hub non prova a modificarli.</div>
    </Layout>
  );
}
