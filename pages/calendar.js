import { useMemo, useState } from 'react';
import Layout from '../components/Layout';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SAMPLE = [
  { day: 'Monday', time: '16:00', course: 'Sam', group: 'Sam · Monday 16:00', story: 1, lessonDay: 1 },
  { day: 'Tuesday', time: '17:15', course: 'Emma', group: 'Emma · Tuesday 17:15', story: 1, lessonDay: 1 },
  { day: 'Wednesday', time: '16:30', course: 'Oliver', group: 'Oliver · Wednesday 16:30', story: 1, lessonDay: 1 },
  { day: 'Thursday', time: '17:30', course: 'Sam', group: 'Sam · Thursday 17:30', story: 1, lessonDay: 2 },
  { day: 'Friday', time: '16:00', course: 'Marcia', group: 'Marcia · Friday 16:00', story: 1, lessonDay: 1 },
];

export default function CalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [lessons, setLessons] = useState(SAMPLE);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ day: 'Monday', time: '16:00', course: 'Sam', story: 1, lessonDay: 1 });

  const weekLabel = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    const diff = (now.getDay() + 6) % 7;
    monday.setDate(now.getDate() - diff + weekOffset * 7);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${fmt(monday)} – ${fmt(saturday)}`;
  }, [weekOffset]);

  function addLesson() {
    setLessons((prev) => [...prev, { ...draft, group: `${draft.course} · ${draft.day} ${draft.time}` }]);
    setShowAdd(false);
  }

  return (
    <Layout>
      <div className="page-eyebrow">Prototype</div>
      <h1 className="page-title">📅 Teaching Calendar</h1>
      <p className="page-desc">A weekly view that connects each class to its Teacher Guide day and Planner.</p>

      <div className="calendar-toolbar">
        <button className="btn secondary" onClick={() => setWeekOffset((v) => v - 1)}>←</button>
        <div className="calendar-week-title">{weekLabel}</div>
        <button className="btn secondary" onClick={() => setWeekOffset((v) => v + 1)}>→</button>
        <button className="btn" onClick={() => setShowAdd((v) => !v)}>＋ Add lesson</button>
      </div>

      {showAdd && (
        <div className="section-block calendar-add">
          <strong>Quick lesson</strong>
          <select value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select>
          <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
          <select value={draft.course} onChange={(e) => setDraft({ ...draft, course: e.target.value })}>{['Mousy','Linda','Sam','Emma','Oliver','Marcia','Pam & Paul','Ben & Brenda'].map((c) => <option key={c}>{c}</option>)}</select>
          <label>Story <input type="number" min="1" max="6" value={draft.story} onChange={(e) => setDraft({ ...draft, story: Number(e.target.value) })} /></label>
          <label>Day <input type="number" min="1" value={draft.lessonDay} onChange={(e) => setDraft({ ...draft, lessonDay: Number(e.target.value) })} /></label>
          <button className="btn" onClick={addLesson}>Add</button>
        </div>
      )}

      <div className="calendar-grid">
        {DAYS.map((day) => (
          <section className="calendar-day" key={day}>
            <div className="calendar-day-head">{day}</div>
            <div className="calendar-day-body">
              {lessons.filter((l) => l.day === day).sort((a,b) => a.time.localeCompare(b.time)).map((lesson, i) => (
                <div className="calendar-lesson" key={`${day}-${lesson.time}-${i}`}>
                  <div className="calendar-time">{lesson.time}</div>
                  <div className="calendar-course">{lesson.course}</div>
                  <div className="calendar-plan">Story {lesson.story} · Day {lesson.lessonDay}</div>
                  <div className="calendar-actions">
                    <a className="calendar-link" href={`/planner?course=${encodeURIComponent(lesson.course.toLowerCase())}&story=${lesson.story}&day=${lesson.lessonDay}`}>Open Planner →</a>
                  </div>
                </div>
              ))}
              {lessons.filter((l) => l.day === day).length === 0 && <div className="calendar-empty">No lessons</div>}
            </div>
          </section>
        ))}
      </div>

      <div className="calendar-note">💡 Prototype only: the final version can read your real groups automatically and remember which Story/Day was actually taught. Events and make-up lessons can still be started manually.</div>
    </Layout>
  );
}
