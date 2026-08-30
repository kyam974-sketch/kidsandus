import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const COURSES = [
  { id: 'mousy', name: 'Mousy', duration: 45 },
  { id: 'linda', name: 'Linda', duration: 45 },
  { id: 'sam', name: 'Sam', duration: 60 },
  { id: 'emma', name: 'Emma', duration: 60 },
  { id: 'oliver', name: 'Oliver', duration: 60 },
  { id: 'marcia', name: 'Marcia', duration: 60 },
  { id: 'pam', name: 'Pam & Paul', duration: 60 },
  { id: 'ben', name: 'Ben & Brenda', duration: 60 },
];

const TYPES = [
  { id: 'makeup', label: 'Recupero / Makeup' },
  { id: 'demo', label: 'Demo' },
  { id: 'propedeutica', label: 'Propedeutica' },
  { id: 'other', label: 'Altro' },
];

function minutes(value) {
  const n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

export default function SpecialLessons() {
  const [type, setType] = useState('makeup');
  const [courseId, setCourseId] = useState('sam');
  const [story, setStory] = useState(1);
  const [sourceDay, setSourceDay] = useState(1);
  const [duration, setDuration] = useState(60);
  const [title, setTitle] = useState('');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const course = useMemo(() => COURSES.find((c) => c.id === courseId), [courseId]);
  const sourceKey = `${courseId}|Story ${story}|${sourceDay}`;
  const coreMinutes = activities.filter((a) => !a.is_bonus).reduce((sum, a) => sum + minutes(a.duration), 0);

  useEffect(() => {
    if (course) setDuration(course.duration);
  }, [courseId]);

  async function loadFromTgDay() {
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase.from('lessons').select('data').eq('key', sourceKey).maybeSingle();
    setLoading(false);
    if (error) {
      setMessage(`Errore: ${error.message}`);
      return;
    }
    if (!Array.isArray(data?.data) || !data.data.length) {
      setActivities([]);
      setMessage('Questo Day non è ancora presente nel Planner.');
      return;
    }
    setActivities(data.data.map((a) => ({ ...a })));
    setMessage('Flow caricato dal Day originale. Nessuno shuffle applicato.');
  }

  function updateActivity(index, field, value) {
    setActivities((current) => current.map((a, i) => i === index ? { ...a, [field]: value } : a));
  }

  function moveActivity(index, direction) {
    setActivities((current) => {
      const next = current.slice();
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeActivity(index) {
    setActivities((current) => current.filter((_, i) => i !== index));
  }

  function addActivity() {
    setActivities((current) => [...current, { name: 'New activity', duration: "5'", audio: '', notes: '', materials: '', is_bonus: false }]);
  }

  async function saveLesson() {
    if (!activities.length) {
      setMessage('Carica o crea prima il flow della lezione.');
      return;
    }
    setSaving(true);
    setMessage('');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTitle = (title || TYPES.find((t) => t.id === type)?.label || 'lesson').replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '_');
    const key = `special|${type}|${courseId}|Story ${story}|Day ${sourceDay}|${safeTitle}|${stamp}`;
    const { error } = await supabase.from('lessons').upsert({ key, data: activities }, { onConflict: 'key' });
    setSaving(false);
    if (error) setMessage(`Errore salvataggio: ${error.message}`);
    else setMessage('Lezione speciale salvata.');
  }

  return (
    <Layout>
      <div className="planner-screen">
        <div className="page-eyebrow">Teaching tools</div>
        <h1 className="page-title">Special Lessons</h1>
        <p className="page-desc">Crea recuperi, demo e propedeutiche partendo dal flow reale di un Day del Teacher Guide. Nessuno shuffle casuale.</p>

        <div className="section-block" style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <div className="field"><label>Tipo lezione</label><select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
            <div className="field"><label>Corso</label><select value={courseId} onChange={(e) => setCourseId(e.target.value)}>{COURSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label>Story</label><select value={story} onChange={(e) => setStory(Number(e.target.value))}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>Story {n}</option>)}</select></div>
            <div className="field"><label>Day sorgente</label><select value={sourceDay} onChange={(e) => setSourceDay(Number(e.target.value))}>{Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Day {n}</option>)}</select></div>
            <div className="field"><label>Durata target</label><select value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={45}>45 min</option><option value={60}>60 min</option></select></div>
          </div>

          <div className="field"><label>Titolo / nota</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Recupero Nadia · Story 1" /></div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={loadFromTgDay} disabled={loading}>{loading ? 'Loading…' : 'Usa il flow del Day'}</button>
            <button className="btn secondary" onClick={addActivity}>＋ Aggiungi attività</button>
            <button className="btn secondary" onClick={saveLesson} disabled={saving || !activities.length}>{saving ? 'Saving…' : 'Salva lezione'}</button>
          </div>

          <div className="planner-help">Target: {duration} min · Core attuale: {coreMinutes} min · Fonte: {course?.name} · Story {story} · Day {sourceDay}</div>
          {message && <div className="ready-note">{message}</div>}
        </div>

        <div className="section-block">
          <h2 style={{ marginTop: 0 }}>Flow della lezione</h2>
          {!activities.length ? <p>Nessuna attività caricata.</p> : activities.map((a, i) => (
            <div key={i} className={a.is_bonus ? 'act-edit-card bonus' : 'act-edit-card'}>
              <div className="act-edit-head">
                <input className="activity-name-input" value={a.name || ''} onChange={(e) => updateActivity(i, 'name', e.target.value)} />
                <div className="act-move">
                  <button className="link-btn" onClick={() => moveActivity(i, -1)}>↑</button>
                  <button className="link-btn" onClick={() => moveActivity(i, 1)}>↓</button>
                  <button className="link-btn danger" onClick={() => removeActivity(i)}>Delete</button>
                </div>
              </div>
              <div className="act-meta-row">
                <input className="mini-input" value={a.duration || ''} onChange={(e) => updateActivity(i, 'duration', e.target.value)} placeholder="7'" />
                <input className="audio-input" value={a.audio || ''} onChange={(e) => updateActivity(i, 'audio', e.target.value)} placeholder="Track #" />
                <label className="bonus-check"><input type="checkbox" checked={!!a.is_bonus} onChange={(e) => updateActivity(i, 'is_bonus', e.target.checked)} /> Bonus</label>
              </div>
              <textarea value={a.notes || ''} onChange={(e) => updateActivity(i, 'notes', e.target.value)} rows={5} style={{ width: '100%', marginTop: 10 }} placeholder="Teaching notes" />
              <input className="materials-input" value={a.materials || ''} onChange={(e) => updateActivity(i, 'materials', e.target.value)} placeholder="Materials" />
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
