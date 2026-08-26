import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import styles from '../styles/Calendar.module.css';

const SCHOOL_YEAR = '2026-2027';
const DAYS = [
  { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' },
];
const COURSES = ['Mousy', 'Linda', 'Sam', 'Emma', 'Oliver', 'Marcia', 'Pam & Paul'];
const COURSE_IDS = { Mousy: 'mousy', Linda: 'linda', Sam: 'sam', Emma: 'emma', Oliver: 'oliver', Marcia: 'marcia', 'Pam & Paul': 'pam' };
const COURSE_MINUTES = { Mousy: 45, Linda: 45, Sam: 60, Emma: 60, Oliver: 60, Marcia: 60, 'Pam & Paul': 60 };

function durationLabel(course) { const mins = COURSE_MINUTES[course] || 60; return mins === 60 ? '1 h' : `${mins} min`; }
function addMinutes(time, minutes) {
  const [h, m] = String(time).slice(0,5).split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}
function emptyDraft() { return { weekday: 1, start_time: '16:00', course: 'Sam', story_number: 1, day_number: 1, label: '' }; }

export default function CalendarPage() {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  async function loadLessons() {
    setLoading(true); setError('');
    const { data, error: loadError } = await supabase.from('teaching_schedule').select('*').eq('school_year', SCHOOL_YEAR).eq('is_active', true).is('specific_date', null).order('weekday').order('start_time');
    if (loadError) setError(loadError.message);
    setLessons(data || []); setLoading(false);
  }
  useEffect(() => { loadLessons(); }, []);

  const week = useMemo(() => {
    const now = new Date();
    const monday = new Date(now); monday.setHours(0,0,0,0);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
    return DAYS.map((d, i) => { const date = new Date(monday); date.setDate(monday.getDate() + i); return { ...d, date }; });
  }, [weekOffset]);

  function startAdd(weekday = 1) { setEditingId(null); setDraft({ ...emptyDraft(), weekday }); setShowAdd(true); }
  function startEdit(lesson) {
    setEditingId(lesson.id);
    setDraft({ weekday: lesson.weekday, start_time: String(lesson.start_time).slice(0,5), course: lesson.course, story_number: lesson.story_number, day_number: lesson.day_number, label: lesson.label || '' });
    setShowAdd(true);
  }
  function cancelEdit() { setShowAdd(false); setEditingId(null); setDraft(emptyDraft()); setError(''); }

  async function saveLesson() {
    setSaving(true); setError('');
    const payload = { ...draft, school_year: SCHOOL_YEAR, specific_date: null, is_active: true };
    const result = editingId ? await supabase.from('teaching_schedule').update(payload).eq('id', editingId) : await supabase.from('teaching_schedule').insert(payload);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    cancelEdit(); await loadLessons();
  }
  async function deleteLesson(id) {
    if (!window.confirm('Remove this recurring lesson from the weekly schedule?')) return;
    const { error: deleteError } = await supabase.from('teaching_schedule').delete().eq('id', id);
    if (deleteError) { setError(deleteError.message); return; }
    await loadLessons();
  }

  return (
    <Layout>
      <div className="page-eyebrow">2026/27</div>
      <h1 className="page-title">📅 Teaching week</h1>
      <p className="page-desc">Your lessons in one glance. Story and Day are remembered here, so the Planner can open on the right lesson.</p>

      <div className={styles.toolbar}>
        <button className="btn secondary" onClick={() => setWeekOffset((v) => v - 1)}>←</button>
        <div className={styles.weekTitle}>{week[0].date.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – {week[5].date.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
        <button className="btn secondary" onClick={() => setWeekOffset((v) => v + 1)}>→</button>
        {weekOffset !== 0 && <button className="btn secondary" onClick={() => setWeekOffset(0)}>This week</button>}
        <button className="btn" onClick={() => startAdd()}>＋ Add lesson</button>
      </div>

      {showAdd && <div className={`section-block ${styles.editor}`}>
        <div className={styles.editorTitle}>{editingId ? 'Edit lesson' : 'Add recurring lesson'}</div>
        <label>Day<select value={draft.weekday} onChange={(e)=>setDraft({...draft,weekday:Number(e.target.value)})}>{DAYS.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
        <label>Start<input type="time" value={draft.start_time} onChange={(e)=>setDraft({...draft,start_time:e.target.value})}/></label>
        <label>Course<select value={draft.course} onChange={(e)=>setDraft({...draft,course:e.target.value})}>{COURSES.map(c=><option key={c}>{c}</option>)}</select></label>
        <div className={styles.autoDuration}>⏱ {durationLabel(draft.course)} · ends {addMinutes(draft.start_time, COURSE_MINUTES[draft.course])}</div>
        <label>Story<input type="number" min="1" max="6" value={draft.story_number} onChange={(e)=>setDraft({...draft,story_number:Number(e.target.value)||1})}/></label>
        <label>Day<input type="number" min="1" value={draft.day_number} onChange={(e)=>setDraft({...draft,day_number:Number(e.target.value)||1})}/></label>
        <label className={styles.labelField}>Note / group (optional)<input value={draft.label} onChange={(e)=>setDraft({...draft,label:e.target.value})} placeholder="e.g. Grosseto · group A"/></label>
        <button className="btn" disabled={saving} onClick={saveLesson}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn secondary" onClick={cancelEdit}>Cancel</button>
      </div>}
      {error && <div className="error-text">{error}</div>}

      {loading ? <div className="section-block">Loading…</div> : <div className={styles.weekList}>
        {week.map((day) => {
          const dayLessons = lessons.filter(l => l.weekday === day.value);
          const today = weekOffset === 0 && new Date().toDateString() === day.date.toDateString();
          return <section className={`${styles.dayRow} ${today ? styles.today : ''}`} key={day.value}>
            <div className={styles.dayHeader}>
              <div><span className={styles.dayName}>{day.label}</span><span className={styles.date}>{day.date.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></div>
              <button className={styles.addDay} onClick={()=>startAdd(day.value)}>＋</button>
            </div>
            <div className={styles.lessons}>
              {dayLessons.length === 0 ? <div className={styles.empty}>No lessons</div> : dayLessons.map((lesson) => {
                const mins = COURSE_MINUTES[lesson.course] || 60;
                const start = String(lesson.start_time).slice(0,5);
                const end = addMinutes(start, mins);
                const courseId = COURSE_IDS[lesson.course] || lesson.course.toLowerCase();
                return <article className={styles.lesson} key={lesson.id}>
                  <div className={styles.timeBlock}><strong>{start}</strong><span>{end}</span></div>
                  <div className={styles.lessonMain}><div className={styles.course}>{lesson.course}</div>{lesson.label && <div className={styles.groupLabel}>{lesson.label}</div>}<div className={styles.plan}>Story {lesson.story_number} · Day {lesson.day_number} <span>· {durationLabel(lesson.course)}</span></div></div>
                  <div className={styles.actions}><a className={styles.open} href={`/planner?course=${encodeURIComponent(courseId)}&story=${lesson.story_number}&day=${lesson.day_number}&start=${encodeURIComponent(start)}`}>Open Planner →</a><button onClick={()=>startEdit(lesson)}>Edit</button><button onClick={()=>deleteLesson(lesson.id)}>×</button></div>
                </article>;
              })}
            </div>
          </section>;
        })}
      </div>}

      <div className={styles.note}>✨ Mousy & Linda are automatically 45 minutes. Sam, Emma, Oliver, Marcia and Pam & Paul are 60 minutes. Ben & Brenda is intentionally hidden this year. Story/Day can be updated as you progress.</div>
    </Layout>
  );
}
