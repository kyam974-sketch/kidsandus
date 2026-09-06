import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const COURSES = [
  { id: 'mousy', name: 'Mousy', duration: 45 },
  { id: 'mousy_nursery', name: 'Mousy Nursery', duration: 30 },
  { id: 'linda', name: 'Linda', duration: 45 },
  { id: 'linda_nursery', name: 'Linda Nursery', duration: 30 },
  { id: 'sam', name: 'Sam', duration: 60 },
  { id: 'emma', name: 'Emma', duration: 60 },
  { id: 'oliver', name: 'Oliver', duration: 60 },
  { id: 'marcia', name: 'Marcia', duration: 60 },
  { id: 'pam', name: 'Pam & Paul', duration: 60 },
  { id: 'ben', name: 'Ben & Brenda', duration: 60 },
];

const TYPES = [
  { id: 'makeup', label: 'Recupero / Makeup', help: 'Per chi ha saltato una o più lezioni: recupera i contenuti necessari del Day perso.' },
  { id: 'demo', label: 'Demo', help: 'Lezione dimostrativa costruita scegliendo attività già note, in base a materiali e obiettivi.' },
  { id: 'propedeutica', label: 'Propedeutica', help: 'Lezione ponte prima dell’inizio ufficiale del calendario. Può usare attività richiamate dalla banca senza anticipare la Story.' },
  { id: 'other', label: 'Altro', help: 'Lezione speciale costruita liberamente dalla banca attività o a mano.' },
];

function minutes(value) {
  const n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function normalizeName(value) {
  return String(value || '')
    .replace(/^Optional:\s*/i, '')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ');
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function parseLessonKey(key) {
  const parts = String(key || '').split('|');
  const storyMatch = String(parts[1] || '').match(/Story\s+(\d+)/i);
  const day = Number(parts[2]);
  return {
    story: storyMatch ? Number(storyMatch[1]) : null,
    day: Number.isFinite(day) ? day : null,
  };
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

function activityFingerprint(activity) {
  return [
    normalizeText(activity?.notes),
    normalizeText(activity?.materials),
    normalizeText(activity?.audio),
  ].join('\n---\n');
}

function buildActivityBank(rows) {
  const occurrences = [];

  (rows || []).forEach((row) => {
    const source = parseLessonKey(row.key);
    if (!Array.isArray(row.data)) return;
    row.data.forEach((activity, index) => {
      const cleanName = String(activity?.name || '').replace(/^Optional:\s*/i, '').trim();
      if (!cleanName) return;
      occurrences.push({
        activity,
        cleanName,
        normalizedName: normalizeName(cleanName),
        story: source.story,
        day: source.day,
        sourceIndex: index + 1,
      });
    });
  });

  const nameGroups = new Map();
  occurrences.forEach((item) => {
    if (!nameGroups.has(item.normalizedName)) nameGroups.set(item.normalizedName, []);
    nameGroups.get(item.normalizedName).push(item);
  });

  const bank = [];
  nameGroups.forEach((items) => {
    const variants = new Map();
    items.forEach((item) => {
      const fingerprint = activityFingerprint(item.activity);
      if (!variants.has(fingerprint)) variants.set(fingerprint, []);
      variants.get(fingerprint).push(item);
    });

    const variantCount = variants.size;
    let variantIndex = 0;
    variants.forEach((variantItems) => {
      variantIndex += 1;
      const representative = variantItems[0].activity;
      const durations = [...new Set(variantItems.map((item) => String(item.activity?.duration || '').trim()).filter(Boolean))];
      const origins = variantItems
        .map((item) => ({ story: item.story, day: item.day, index: item.sourceIndex }))
        .filter((origin) => origin.story && origin.day)
        .sort((a, b) => a.story - b.story || a.day - b.day || a.index - b.index);
      bank.push({
        id: `${items[0].normalizedName}|${variantIndex}|${activityFingerprint(representative)}`,
        name: variantItems[0].cleanName,
        variantIndex,
        variantCount,
        representative,
        durations,
        origins,
        occurrenceCount: variantItems.length,
        searchable: [
          variantItems[0].cleanName,
          representative?.materials,
          representative?.audio,
          representative?.notes,
          origins.map((origin) => `Story ${origin.story} Day ${origin.day}`).join(' '),
        ].filter(Boolean).join(' ').toLocaleLowerCase('en'),
      });
    });
  });

  return bank.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.variantIndex - b.variantIndex);
}

function originLabel(origin) {
  return `S${origin.story} D${origin.day}`;
}

export default function SpecialLessons() {
  const [type, setType] = useState('makeup');
  const [courseId, setCourseId] = useState('mousy');
  const [story, setStory] = useState(1);
  const [sourceDay, setSourceDay] = useState(1);
  const [prepNumber, setPrepNumber] = useState(1);
  const [duration, setDuration] = useState(45);
  const [title, setTitle] = useState('');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [savedLessons, setSavedLessons] = useState([]);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [editingLessonKey, setEditingLessonKey] = useState('');
  const [bankOpen, setBankOpen] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankRows, setBankRows] = useState([]);
  const [bankMessage, setBankMessage] = useState('');
  const [bankQuery, setBankQuery] = useState('');
  const [bankStory, setBankStory] = useState('all');
  const [bankDay, setBankDay] = useState('all');

  const course = useMemo(() => COURSES.find((c) => c.id === courseId), [courseId]);
  const sourceKey = `${courseId}|Story ${story}|${sourceDay}`;
  const includedActivities = activities.filter((a) => a.included !== false);
  const coreMinutes = includedActivities.filter((a) => !a.is_bonus).reduce((sum, a) => sum + minutes(a.duration), 0);
  const typeInfo = TYPES.find((t) => t.id === type);
  const recallActive = bankQuery.trim().length > 0 || bankStory !== 'all' || bankDay !== 'all';

  const filteredBankRows = useMemo(() => {
    const query = bankQuery.trim().toLocaleLowerCase('en');
    if (!query && bankStory === 'all' && bankDay === 'all') return [];
    return bankRows.filter((item) => {
      if (query && !item.searchable.includes(query)) return false;
      if (bankStory !== 'all' && !item.origins.some((origin) => String(origin.story) === String(bankStory))) return false;
      if (bankDay !== 'all' && !item.origins.some((origin) => String(origin.day) === String(bankDay) && (bankStory === 'all' || String(origin.story) === String(bankStory)))) return false;
      return true;
    });
  }, [bankRows, bankQuery, bankStory, bankDay]);

  useEffect(() => { loadSavedLessons(); }, []);

  useEffect(() => {
    setBankOpen(false);
    setBankRows([]);
    setBankMessage('');
    setBankQuery('');
    setBankStory('all');
    setBankDay('all');
  }, [courseId]);

  function changeType(nextType) {
    setType(nextType);
    if (!editingLessonId) {
      setActivities([]);
      setMessage('');
      setTitle('');
    }
  }

  function changeCourse(nextCourseId) {
    setCourseId(nextCourseId);
    const nextCourse = COURSES.find((item) => item.id === nextCourseId);
    if (nextCourse && !editingLessonId) setDuration(nextCourse.duration);
  }

  function scrollToFlow() {
    window.setTimeout(() => {
      document.getElementById('special-flow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  async function loadSavedLessons() {
    const { data } = await supabase
      .from('lessons')
      .select('id,key,data,created_at')
      .like('key', 'special|%')
      .order('created_at', { ascending: false })
      .limit(50);
    setSavedLessons(data || []);
  }

  function startEditLesson(lesson) {
    const meta = parseSavedKey(lesson.key);
    const nextCourse = COURSES.find((item) => item.id === meta.course);
    const durationMatch = `${meta.contextA} ${meta.contextB}`.match(/(\d+)\s*min/i);
    const storyMatch = String(meta.contextA || '').match(/Story\s+(\d+)/i);
    const dayMatch = String(meta.contextB || '').match(/Day\s+(\d+)/i);
    const prepMatch = String(meta.contextB || '').match(/Lesson\s+(\d+)/i);

    setEditingLessonId(lesson.id);
    setEditingLessonKey(lesson.key);
    setType(meta.type || 'other');
    setCourseId(meta.course || 'mousy');
    setDuration(durationMatch ? Number(durationMatch[1]) : (nextCourse?.duration || 45));
    if (storyMatch) setStory(Number(storyMatch[1]));
    if (dayMatch) setSourceDay(Number(dayMatch[1]));
    if (prepMatch) setPrepNumber(Number(prepMatch[1]));
    setTitle(meta.title || '');
    setActivities(Array.isArray(lesson.data) ? lesson.data.map((a) => ({ ...a, included: true })) : []);
    setBankOpen(false);
    setBankRows([]);
    setBankMessage('');
    setBankQuery('');
    setMessage('Stai modificando una Special Lesson salvata. Le modifiche verranno applicate alla stessa lezione.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditing() {
    setEditingLessonId(null);
    setEditingLessonKey('');
    setActivities([]);
    setTitle('');
    setMessage('');
    if (course) setDuration(course.duration);
  }

  async function deleteSavedLesson(lesson) {
    const meta = parseSavedKey(lesson.key);
    if (!window.confirm(`Eliminare definitivamente la Special Lesson “${meta.title}”? Questa operazione non si può annullare.`)) return;

    setSaving(true);
    setMessage('');
    const { error } = await supabase
      .from('lessons')
      .delete()
      .eq('id', lesson.id)
      .like('key', 'special|%');
    setSaving(false);

    if (error) {
      setMessage(`Errore eliminazione: ${error.message}`);
      return;
    }

    if (editingLessonId === lesson.id) {
      setEditingLessonId(null);
      setEditingLessonKey('');
      setActivities([]);
      setTitle('');
    }
    setMessage(`Special Lesson “${meta.title}” eliminata.`);
    await loadSavedLessons();
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
    setMessage('Attività del Day caricate per il recupero. Togli la spunta a ciò che non serve; poi puoi aggiungere altre attività con Recall activity.');
    scrollToFlow();
  }

  async function openActivityBank() {
    if (bankOpen) {
      setBankOpen(false);
      return;
    }
    setBankOpen(true);
    if (bankRows.length) return;

    setBankLoading(true);
    setBankMessage('');
    const { data, error } = await supabase
      .from('lessons')
      .select('key,data')
      .like('key', `${courseId}|Story %|%`)
      .order('key');
    setBankLoading(false);

    if (error) {
      setBankMessage(`Errore nel caricamento: ${error.message}`);
      return;
    }

    const bank = buildActivityBank(data || []);
    setBankRows(bank);
    setBankMessage(bank.length
      ? 'Activity Library pronta. Cerca o filtra per richiamare solo le attività che ti servono.'
      : 'Nessuna attività disponibile nel Planner per questo corso.');
  }

  function addFromBank(item) {
    const source = item.representative || {};
    const next = {
      ...source,
      name: String(source.name || item.name || '').replace(/^Optional:\s*/i, '').trim(),
      included: true,
      recalled_from: item.origins.map(originLabel).join(', '),
    };
    setActivities((current) => [...current, next]);
    setBankOpen(false);
    setBankQuery('');
    setBankStory('all');
    setBankDay('all');
    setMessage(`Aggiunta “${item.name}” al flow. Puoi modificarla liberamente senza cambiare l’attività originale del Planner.`);
    scrollToFlow();
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
    scrollToFlow();
  }

  async function saveLesson() {
    const finalActivities = activities.filter((a) => a.included !== false).map(({ included, ...a }) => a);
    if (!finalActivities.length) {
      setMessage('Inserisci o seleziona prima almeno un’attività.');
      return;
    }

    setSaving(true);
    setMessage('');
    const freshStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const oldStamp = editingLessonKey ? String(editingLessonKey).split('|').slice(-1)[0] : '';
    const stamp = oldStamp || freshStamp;
    const safeTitle = (title || typeInfo?.label || 'lesson').replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '_');
    let contextA = 'Custom';
    let contextB = 'Custom';
    if (type === 'makeup') { contextA = `Story ${story}`; contextB = `Day ${sourceDay}`; }
    if (type === 'demo') { contextA = 'Demo'; contextB = `${duration} min`; }
    if (type === 'propedeutica') { contextA = 'Pre-course'; contextB = `Lesson ${prepNumber}`; }
    const key = `special|${type}|${courseId}|${contextA}|${contextB}|${safeTitle}|${stamp}`;

    const result = editingLessonId
      ? await supabase.from('lessons').update({ key, data: finalActivities }).eq('id', editingLessonId).like('key', 'special|%')
      : await supabase.from('lessons').insert({ key, data: finalActivities });

    setSaving(false);
    if (result.error) {
      setMessage(`${editingLessonId ? 'Errore salvataggio modifiche' : 'Errore salvataggio'}: ${result.error.message}`);
      return;
    }

    if (editingLessonId) {
      setEditingLessonKey(key);
      setMessage('Modifiche salvate. Live ed Extra Light useranno subito questa versione aggiornata.');
    } else {
      setMessage('Lezione speciale salvata. La trovi qui sotto in “Lezioni salvate”, con Live ed Extra Light.');
    }
    await loadSavedLessons();
  }

  return (
    <Layout>
      <div className="planner-screen">
        <div className="page-eyebrow">Teaching tools</div>
        <h1 className="page-title">Special Lessons</h1>
        <p className="page-desc">Costruisci demo, recuperi, propedeutiche e altre lezioni richiamando attività già presenti nel Planner oppure aggiungendole a mano.</p>

        <div className="section-block" style={{ display: 'grid', gap: 18 }}>
          {editingLessonId && (
            <div className="ready-note" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div><strong>✏️ Modifica Special Lesson</strong><div style={{ marginTop: 4 }}>Stai lavorando sulla lezione salvata: Salva modifiche aggiorna questa stessa lezione.</div></div>
              <button className="btn secondary" onClick={cancelEditing}>Annulla modifica</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
            <div className="field"><label>Tipo lezione</label><select value={type} onChange={(e) => changeType(e.target.value)}>{TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
            <div className="field"><label>Corso</label><select value={courseId} onChange={(e) => changeCourse(e.target.value)}>{COURSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            {type === 'makeup' && <><div className="field"><label>Story</label><select value={story} onChange={(e) => setStory(Number(e.target.value))}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>Story {n}</option>)}</select></div><div className="field"><label>Day perso</label><select value={sourceDay} onChange={(e) => setSourceDay(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Day {n}</option>)}</select></div></>}
            {type === 'propedeutica' && <div className="field"><label>Lezione propedeutica</label><select value={prepNumber} onChange={(e) => setPrepNumber(Number(e.target.value))}>{[1,2,3].map((n) => <option key={n} value={n}>Lezione {n}</option>)}</select></div>}
            <div className="field"><label>Durata</label><select value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option></select></div>
          </div>

          <div className="ready-note"><strong>{typeInfo?.label}</strong><div style={{ marginTop: 6 }}>{typeInfo?.help}</div></div>
          <div className="field"><label>Titolo / nota</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Recupero Story 1 · Day 3" /></div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {type === 'makeup' && <button className="btn" onClick={loadRecoveryDay} disabled={loading}>{loading ? 'Loading…' : 'Carica attività del Day perso'}</button>}
            <button className="btn" onClick={openActivityBank} disabled={bankLoading}>{bankLoading ? 'Loading…' : bankOpen ? 'Chiudi Recall activity' : '↩ Recall activity'}</button>
            <button className="btn secondary" onClick={addActivity}>＋ Aggiungi attività</button>
            <button className="btn secondary" onClick={saveLesson} disabled={saving || !includedActivities.length}>{saving ? 'Saving…' : editingLessonId ? 'Salva modifiche' : 'Salva lezione'}</button>
          </div>

          <div className="planner-help">Target: {duration} min · Core selezionato: {coreMinutes} min · Corso: {course?.name}</div>
          {message && <div className="ready-note">{message}</div>}
        </div>

        <div id="special-flow" className="section-block">
          <h2 style={{ marginTop: 0 }}>Flow della lezione</h2>
          {(type === 'demo' || type === 'propedeutica' || type === 'other') && !activities.length && <p>Parti vuota: usa <strong>Recall activity</strong> per richiamare attività già esistenti oppure aggiungine una manualmente.</p>}
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
              {a.recalled_from && <div className="planner-help" style={{ marginTop: 7 }}>Recalled from: {a.recalled_from}</div>}
              <textarea value={a.notes || ''} onChange={(e) => updateActivity(i, 'notes', e.target.value)} rows={5} style={{ width: '100%', marginTop: 10 }} placeholder="Teaching notes" />
              <input className="materials-input" value={a.materials || ''} onChange={(e) => updateActivity(i, 'materials', e.target.value)} placeholder="Materials" />
            </div>
          ))}
        </div>

        {bankOpen && (
          <div className="section-block" style={{ border: '2px solid var(--blue, #5278c7)' }}>
            <div className="page-eyebrow">Activity Library · {course?.name}</div>
            <h2 style={{ marginTop: 4 }}>↩ Recall activity</h2>
            <p style={{ marginTop: 0 }}>Cerca per nome, materiale, teaching notes, track oppure provenienza. Nessuna attività viene mostrata finché non la richiami con una ricerca o un filtro.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 2fr) repeat(2, minmax(120px, 1fr))', gap: 10, alignItems: 'end' }}>
              <div className="field"><label>Cerca</label><input type="search" value={bankQuery} onChange={(e) => setBankQuery(e.target.value)} placeholder="Es. scarves, balloons, TR#25, body parts…" /></div>
              <div className="field"><label>Story</label><select value={bankStory} onChange={(e) => { setBankStory(e.target.value); setBankDay('all'); }}><option value="all">Tutte</option>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>Story {n}</option>)}</select></div>
              <div className="field"><label>Day</label><select value={bankDay} onChange={(e) => setBankDay(e.target.value)}><option value="all">Tutti</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Day {n}</option>)}</select></div>
            </div>

            {bankMessage && <div className="planner-help" style={{ marginTop: 10 }}>{bankMessage}</div>}
            {!recallActive && <div className="planner-help" style={{ marginTop: 8 }}>Scrivi cosa cerchi oppure scegli Story/Day.</div>}
            {recallActive && <div className="planner-help" style={{ marginTop: 6 }}>{filteredBankRows.length} risultati</div>}

            {recallActive && (
              <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                {filteredBankRows.map((item) => {
                  const a = item.representative || {};
                  const originPreview = item.origins.slice(0, 8).map(originLabel).join(' · ');
                  const extraOrigins = item.origins.length > 8 ? ` · +${item.origins.length - 8}` : '';
                  return (
                    <div key={item.id} className="act-edit-card" style={{ margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 420px' }}>
                          <div style={{ fontSize: '1.08rem', fontWeight: 800 }}>
                            {item.name}
                            {item.variantCount > 1 && <span className="planner-help"> · Variant {item.variantIndex}/{item.variantCount}</span>}
                          </div>
                          <div className="planner-help" style={{ marginTop: 5 }}>
                            {item.durations.length ? `Duration: ${item.durations.join(' / ')}` : 'Duration: —'}
                            {a.audio ? ` · Audio: ${a.audio}` : ''}
                            {item.occurrenceCount > 1 ? ` · Used ${item.occurrenceCount} times` : ''}
                          </div>
                          {item.origins.length > 0 && <div className="planner-help" style={{ marginTop: 4 }}>From: {originPreview}{extraOrigins}</div>}
                          {a.materials && <div style={{ marginTop: 8 }}><strong>Materials:</strong> {a.materials}</div>}
                          {a.notes && <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Teaching notes</summary><div style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{a.notes}</div></details>}
                        </div>
                        <button className="btn" onClick={() => addFromBank(item)}>＋ Add to lesson</button>
                      </div>
                    </div>
                  );
                })}
                {!bankLoading && !filteredBankRows.length && <p>Nessuna attività corrisponde alla ricerca.</p>}
              </div>
            )}
          </div>
        )}

        <div className="section-block">
          <h2 style={{ marginTop: 0 }}>Lezioni salvate</h2>
          {!savedLessons.length ? <p>Nessuna lezione speciale salvata.</p> : savedLessons.map((lesson) => {
            const meta = parseSavedKey(lesson.key);
            const typeLabel = TYPES.find((t) => t.id === meta.type)?.label || meta.type;
            const courseName = COURSES.find((c) => c.id === meta.course)?.name || meta.course;
            const isEditingThis = editingLessonId === lesson.id;
            return <div key={lesson.id} className="act-edit-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', border: isEditingThis ? '2px solid var(--blue, #5278c7)' : undefined }}>
              <div><strong>{meta.title}</strong><div className="planner-help">{typeLabel} · {courseName} · {meta.contextA} · {meta.contextB}</div></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn secondary" onClick={() => startEditLesson(lesson)}>✏️ Modifica</button>
                <button className="link-btn danger" onClick={() => deleteSavedLesson(lesson)} disabled={saving}>Elimina</button>
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
