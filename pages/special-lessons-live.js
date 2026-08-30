import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

function parseDuration(value) {
  const n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function renderNotes(text) {
  if (!text) return null;
  return String(text).split('**').map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="mandatory-phrase">{part}</strong> : <span key={i}>{part}</span>
  );
}

function metaFromKey(key) {
  const parts = String(key || '').split('|');
  return {
    type: parts[1] || '',
    course: parts[2] || '',
    story: parts[3] || '',
    day: parts[4] || '',
    title: (parts[5] || 'Special lesson').replace(/_/g, ' '),
  };
}

export default function SpecialLessonLive() {
  const router = useRouter();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState('16:00');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!router.isReady || !router.query.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('lessons').select('id,key,data,created_at').eq('id', router.query.id).maybeSingle();
      setLesson(data || null);
      setLoading(false);
    })();
  }, [router.isReady, router.query.id]);

  const meta = useMemo(() => metaFromKey(lesson?.key), [lesson]);
  const activities = Array.isArray(lesson?.data) ? lesson.data.filter((a) => a.included !== false) : [];
  const [sh, sm] = startTime.split(':').map(Number);
  let cumulative = 0;
  const timed = activities.map((a) => {
    const dur = parseDuration(a.duration);
    const start = sh * 60 + sm + cumulative;
    cumulative += dur;
    const end = sh * 60 + sm + cumulative;
    const fmt = (m) => `${String(Math.floor((m / 60) % 24)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { ...a, startClock: fmt(start), endClock: fmt(end), durationMinutes: dur };
  });
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentIndex = timed.findIndex((a) => {
    const [h1,m1] = a.startClock.split(':').map(Number); const [h2,m2] = a.endClock.split(':').map(Number);
    return nowMinutes >= h1*60+m1 && nowMinutes < h2*60+m2;
  });

  return (
    <Layout>
      <div className="planner-screen">
        <div className="page-eyebrow">Special lesson · Live</div>
        <h1 className="page-title">{meta.title}</h1>
        <p className="page-desc">{meta.type} · {meta.course}{meta.story ? ` · ${meta.story}` : ''}{meta.day ? ` · ${meta.day}` : ''}</p>
        <div className="section-block no-print">
          <div className="live-tools">
            <div className="field compact"><label>Start time</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
            <a className="btn secondary" href="/special-lessons">← Special Lessons</a>
          </div>
        </div>
        {loading ? <p>Loading…</p> : !lesson ? <div className="section-block">Lezione non trovata.</div> : (
          <div className="live-stage no-print">
            {timed.map((a, i) => (
              <div key={i} className={i === currentIndex ? 'live-card current' : 'live-card'}>
                <div className="live-card-top"><span>{a.startClock} – {a.endClock} · {a.duration || '—'}</span></div>
                <div className="live-card-name">{i === currentIndex ? '▶ ' : ''}{a.name}</div>
                {a.audio && <div className="audio-badge">🎵 {a.audio}</div>}
                {a.materials && <div className="live-materials">🎒 {a.materials}</div>}
                <div className="live-notes">{renderNotes(a.notes || a.desc)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
