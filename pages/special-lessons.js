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
  { id: 'makeup', label: 'Recupero / Makeup', help: 'Per chi ha saltato una o più lezioni: recupera i contenuti necessari del Day perso.' },
  { id: 'demo', label: 'Demo', help: 'Lezione dimostrativa per far conoscere corso e metodo. Non presuppone materiali già acquistati.' },
  { id: 'propedeutica', label: 'Propedeutica', help: 'Una delle lezioni ponte prima dell’inizio ufficiale del calendario.' },
  { id: 'other', label: 'Altro', help: 'Lezione speciale costruita manualmente.' },
];

function minutes(value) {
  const n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseSavedKey(key) {
  const parts = String(key || '').split('|');
  return {
    type: parts[1] || '',
    course: parts[2] || '',
    contextA: parts[3] || '',
    contextB: parts[4] || '',
    title: (parts[5] || 'Special lesson').replace(/_/g, ' '),
  };
}

export default function SpecialLessons() {
  const [type, setType] = useState('makeup');
  const [courseId, setCourseId] = useState('sam');
  const [story, setStory] = useState(1);
  const [sourceDay, setSourceDay] = useState(1);
  const [prepNumber, setPrepNumber] = useState(1);
  const [duration, setDuration] = useState(60);
  const [title, setTitle] = useState('');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [savedLessons, setSavedLessons] = useState([]);

  const course = useMemo(() => COURSES.find((c) => c.id === courseId), [courseId]);
  const sourceKey = `${courseId}|Story ${story}|${sourceDay}`;
  const includedActivities = activities.filter((a) => a.included !== false);
  const coreMinutes = includedActivities.filter((a) => !a.is_bonus).reduce((sum, a) => sum + minutes(a.duration), 0);
  const typeInfo = TYPES.find((t) => t.id === type);

  useEffect(() => {
    if (course) setDuration(course.duration);
  }, [courseId]);

  useEffect(() => { loadSavedLessons(); }, []);

  useEffect(() => {
    setActivities([]);
    setMessage('');
    setTitle('');
  }, [type]);

  async function loadSavedLessons() {
    const { data } = await supabase.from('lessons').select('id,key,created_at').like('key', 'special|%').order('created_at', { ascending: false }).limit(50);
    setSavedLessons(data || []);
  }

  async function loadRecoveryDay() {
    if (type !== 'makeup') return;
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
    setActivities(data.data.map((a) => ({ ...a, included: !a.is_bonus, source_is_bonus: !!a.is_bonus })));
    setMessage('Attività del Day caricate come banca per il recupero. Togli la spunta a ciò che non serve; i bonus partono esclusi.');
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
    setActivities((current) => [...current, { name: 'New activity', duration: "5'", audio: '', notes: '', materials: '', is_bonus: false, included: true }]);
  }

  async function saveLesson() {
    const finalActivities = activities.filter((a) => a.included !== false).map(({ included, ...a }) => a);
    if (!finalActivities.length) {
      setMessage('Inserisci o seleziona prima almeno un’attività.');
      return;
    }
    setSaving(true);
    setMessage('');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTitle = (title || typeInfo?.label || 'lesson').replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '_');
    let contextA = 'Custom';
    let contextB = 'Custom';
    if (type === 'makeup') { contextA = `Story ${story}`; contextB = `Day ${sourceDay}`; }
    if (type === 'demo') { contextA = 'Demo'; contextB = `${duration} min`; }
    if (type === 'propedeutica') { contextA = 'Pre-course'; contextB = `Lesson ${prepNumber}`; }
    const key = `special|${type}|${courseId}|${contextA}|${contextB}|${safeTitle}|${stamp}`;
    const { error } = await supabase.from('lessons').insert({ key, data: finalActivities });
    setSaving(false);
    if (error) setMessage(`Errore salvataggio: ${error.message}`);
    else {
      setMessage('Lezione speciale salvata. La trovi qui sotto in “Lezioni salvate”, con Live ed Extra Light.');
      await loadSavedLessons();
    }
  }

  return (
    <Layout>
      <div className="planner-screen">
        <div className="page-eyebrow">Teaching tools</div>
        <h1 className="page-title">Special Lessons</h1>
        <p className="page-desc">Demo, propedeutiche e recuperi hanno scopi diversi: qui vengono costruiti e salvati separatamente.</p>

        <div className="section-block" style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
            <div className="field"><label>Tipo lezione</label><select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
            <div className="field"><label>Corso</label><select value={courseId} onChange={(e) => setCourseId(e.target.value)}>{COURSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            {type === 'makeup' && <><div className="field"><label>Story</label><select value={story} onChange={(e) => setStory(Number(e.target.value))}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>Story {n}</option>)}</select></div><div className="field"><label>Day perso</label><select value={sourceDay} onChange={(e) => setSourceDay(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Day {n}</option>)}</select></div></>}
            {type === 'propedeutica' && <div className="field"><label>Lezione propedeutica</label><select value={prepNumber} onChange={(e) => setPrepNumber(Number(e.target.value))}>{[1,2,3].map((n) => <option key={n} value={n}>Lezione {n}</option>)}</select></div>}
            <div className="field"><label>Durata</label><select value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={45}>45 min</option><option value={60}>60 min</option></select></div>
          </div>

          <div className="ready-note"><strong>{typeInfo?.label}</strong><div style={{ marginTop: 6 }}>{typeInfo?.help}</div></div>
          <div className="field"><label>Titolo / nota</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Recupero Story 1 · Day 3" /></div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {type === 'makeup' && <button className="btn" onClick={loadRecoveryDay} disabled={loading}>{loading ? 'Loading…' : 'Carica attività del Day perso'}</button>}
            <button className="btn secondary" onClick={addActivity}>＋ Aggiungi attività</button>
            <button className="btn secondary" onClick={saveLesson} disabled={saving || !includedActivities.length}>{saving ? 'Saving…' : 'Salva lezione'}</button>
          </div>

          <div className="planner-help">Target: {duration} min · Core selezionato: {coreMinutes} min · Corso: {course?.name}</div>
          {message && <div className="ready-note">{message}</div>}
        </div>

        <div className="section-block">
          <h2 style={{ marginTop: 0 }}>Flow della lezione</h2>
          {(type === 'demo' || type === 'propedeutica') && !activities.length && <p>Questa lezione non viene clonata da un Day del TG. Aggiungi le attività che devono comporre il flow; la generazione automatica verrà costruita con regole specifiche per questo tipo.</p>}
          {!activities.length ? <p>Nessuna attività caricata.</p> : activities.map((a, i) => (
            <div key={i} className={a.is_bonus ? 'act-edit-card bonus' : 'act-edit-card'} style={{ opacity: a.included === false ? .48 : 1 }}>
              <div className="act-edit-head">
                <input className="activity-name-input" value={a.name || ''} onChange={(e) => updateActivity(i, 'name', e.target.value)} />
                <div className="act-move">
                  <button className="link-btn" onClick={() => moveActivity(i, -1)}>↑</button>
                  <button className="link-btn" onClick={() => moveActivity(i, 1)}>↓</button>
                  <button className="link-btn danger" onClick={() => removeActivity(i)}>Delete</button>
                </div>
              </div>
              <div className="act-meta-row">
                {type === 'makeup' && <label className="bonus-check"><input type="checkbox" checked={a.included !== false} onChange={(e) => updateActivity(i, 'included', e.target.checked)} /> Usa nel recupero</label>}
                <input className="mini-input" value={a.duration || ''} onChange={(e) => updateActivity(i, 'duration', e.target.value)} placeholder="7'" />
                <input className="audio-input" value={a.audio || ''} onChange={(e) => updateActivity(i, 'audio', e.target.value)} placeholder="Track #" />
                <label className="bonus-check"><input type="checkbox" checked={!!a.is_bonus} onChange={(e) => updateActivity(i, 'is_bonus', e.target.checked)} /> Bonus</label>
              </div>
              <textarea value={a.notes || ''} onChange={(e) => updateActivity(i, 'notes', e.target.value)} rows={5} style={{ width: '100%', marginTop: 10 }} placeholder="Teaching notes" />
              <input className="materials-input" value={a.materials || ''} onChange={(e) => updateActivity(i, 'materials', e.target.value)} placeholder="Materials" />
            </div>
          ))}
        </div>

        <div className="section-block">
          <h2 style={{ marginTop: 0 }}>Lezioni salvate</h2>
          {!savedLessons.length ? <p>Nessuna lezione speciale salvata.</p> : savedLessons.map((lesson) => {
            const meta = parseSavedKey(lesson.key);
            const typeLabel = TYPES.find((t) => t.id === meta.type)?.label || meta.type;
            const courseName = COURSES.find((c) => c.id === meta.course)?.name || meta.course;
            return <div key={lesson.id} className="act-edit-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div><strong>{meta.title}</strong><div className="planner-help">{typeLabel} · {courseName} · {meta.contextA} · {meta.contextB}</div></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="btn" href={`/special-lessons-live?id=${lesson.id}`}>▶ Live</a>
                <a className="btn secondary" href={`/special-lessons-live?id=${lesson.id}&mode=light`}>Extra Light</a>
              </div>
            </div>;
          })}
        </div>
      </div>
    </Layout>
  );
}
