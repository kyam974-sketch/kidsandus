import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import styles from '../styles/Calendar.module.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SAMPLE = [
  { day: 'Monday', time: '16:00', course: 'Sam', story: 1, lessonDay: 1 },
  { day: 'Tuesday', time: '17:15', course: 'Emma', story: 1, lessonDay: 1 },
  { day: 'Wednesday', time: '16:30', course: 'Oliver', story: 1, lessonDay: 1 },
  { day: 'Thursday', time: '17:30', course: 'Sam', story: 1, lessonDay: 2 },
  { day: 'Friday', time: '16:00', course: 'Marcia', story: 1, lessonDay: 1 },
];

export default function CalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [lessons, setLessons] = useState(SAMPLE);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ day: 'Monday', time: '16:00', course: 'Sam', story: 1, lessonDay: 1 });

  const weekLabel = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${fmt(monday)} – ${fmt(saturday)}`;
  }, [weekOffset]);

  function addLesson() {
    setLessons((prev) => [...prev, { ...draft }]);
    setShowAdd(false);
  }

  return (
    <Layout>
      <div className="page-eyebrow">Prototype</div>
      <h1 className="page-title">📅 Teaching Calendar</h1>
      <p className="page-desc">See the teaching week and jump straight from a class to its lesson plan.</p>

      <div className={styles.toolbar}>
        <button className="btn secondary" onClick={() => setWeekOffset((v) => v - 1)}>←</button>
        <div className={styles.weekTitle}>{weekLabel}</div>
        <button className="btn secondary" onClick={() => setWeekOffset((v) => v + 1)}>→</button>
        <button className="btn" onClick={() => setShowAdd((v) => !v)}>＋ Add lesson</button>
      </div>

      {showAdd && (
        <div className={`section-block ${styles.add}`}>
          <strong>Quick lesson</strong>
          <select value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select>
          <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
          <select value={draft.course} onChange={(e) => setDraft({ ...draft, course: e.target.value })}>{['Mousy','Linda','Sam','Emma','Oliver','Marcia','Pam & Paul','Ben & Brenda'].map((c) => <option key={c}>{c}</option>)}</select>
          <label>Story <input type="number" min="1" max="6" value={draft.story} onChange={(e) => setDraft({ ...draft, story: Number(e.target.value) })} /></label>
          <label>Day <input type="number" min="1" value={draft.lessonDay} onChange={(e) => setDraft({ ...draft, lessonDay: Number(e.target.value) })} /></label>
          <button className="btn" onClick={addLesson}>Add</button>
        </div>
      )}

      <div className={styles.grid}>
        {DAYS.map((day) => {
          const dayLessons = lessons.filter((l) => l.day === day).sort((a,b) => a.time.localeCompare(b.time));
          return (
            <section className={styles.day} key={day}>
              <div className={styles.dayHead}>{day}</div>
              <div className={styles.dayBody}>
                {dayLessons.map((lesson, i) => (
                  <div className={styles.lesson} key={`${day}-${lesson.time}-${i}`}>
                    <div className={styles.time}>{lesson.time}</div>
                    <div className={styles.course}>{lesson.course}</div>
                    <div className={styles.plan}>Story {lesson.story} · Day {lesson.lessonDay}</div>
                    <div className={styles.actions}>
                      <a className={styles.link} href={`/planner?course=${encodeURIComponent(lesson.course.toLowerCase())}&story=${lesson.story}&day=${lesson.lessonDay}`}>Open Planner →</a>
                    </div>
                  </div>
                ))}
                {dayLessons.length === 0 && <div className={styles.empty}>No lessons</div>}
              </div>
            </section>
          );
        })}
      </div>

      <div className={styles.note}>💡 This is deliberately a prototype. The real version can use your existing groups, track which Story/Day was actually taught, and still allow manual start times for events and make-up lessons.</div>
    </Layout>
  );
}
