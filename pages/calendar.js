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

export default function CalendarPage() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

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
      <div className="page-eyebrow">2026/27 · Classes</div>
      <h1 className="page-title">📅 Teaching week</h1>
      <p className="page-desc">Le classi sono la fonte del calendario: creale una volta, assegna gli studenti e aggiorna qui Story/Day mentre procedi.</p>

      <div className={styles.toolbar}>
        <button className="btn secondary" onClick={() => setWeekOffset((v) => v - 1)}>←</button>
        <div className={styles.weekTitle}>{week[0].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {week[5].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
        <button className="btn secondary" onClick={() => setWeekOffset((v) => v + 1)}>→</button>
        {weekOffset !== 0 && <button className="btn secondary" onClick={() => setWeekOffset(0)}>This week</button>}
        <a className="btn" href="/classes" style={{ textDecoration: 'none' }}>＋ New class</a>
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
          const today = weekOffset === 0 && new Date().toDateString() === day.date.toDateString();
          return <section className={`${styles.dayRow} ${today ? styles.today : ''}`} key={day.value}>
            <div className={styles.dayHeader}>
              <div><span className={styles.dayName}>{day.label}</span><span className={styles.date}>{day.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>
              <a className={styles.addDay} href="/classes" title="Create class">＋</a>
            </div>
            <div className={styles.lessons}>
              {dayClasses.length === 0 ? <div className={styles.empty}>No classes</div> : dayClasses.map((item) => {
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

      <div className={styles.note}>📌 Classes è ora la fonte unica degli slot didattici. Il prossimo livello sarà sovrapporre qui anche riunioni, demo, recuperi ed eventi Outlook, senza duplicare il calendario di lavoro.</div>
    </Layout>
  );
}
