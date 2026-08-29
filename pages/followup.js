import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

const EMOJI_SCALE = [
  { value: 1, emoji: '😟', label: 'Poor' },
  { value: 2, emoji: '😐', label: 'Satisfactory' },
  { value: 3, emoji: '🙂', label: 'Good' },
  { value: 4, emoji: '😊', label: 'Very good' },
  { value: 5, emoji: '😄', label: 'Excellent' },
];
const RATING_FIELDS = ['motivation', 'learning', 'behaviour'];
const RATING_LABELS = { motivation: 'Motivation', learning: 'Learning', behaviour: 'Behaviour' };
const SEDI = ['Grosseto', 'Esterna'];
const CORSI = ['Mousy', 'Linda', 'Sam', 'Emma', 'Oliver', 'Marcia', 'Pam & Paul', 'Ben & Brenda'];
const CORSO_INFO = {
  Mousy: 'Mousy (12-36 months, with a parent). IMPORTANT: verbal production is NOT expected. Assess reactivity, attention, simple command response, name recognition, emotional participation. Fussiness/distraction is normal, not a behaviour issue.',
  Linda: 'Linda (2-3 years, parents present early on then independent). First words and short phrases emerging. Assess greetings, age, simple instructions, colours/numbers, counting to 10. Egocentrism/sharing difficulty is normal.',
  Sam: 'Sam (3-4 years). Active participation, answering questions, describing objects, fixed structures in context. Assess greetings, personal questions, feelings, colour/shape/size description and simple game instructions.',
  Emma: 'Emma (4-5 years). More complex structures, full sentences expected. Assess greetings, weather, feelings, story questions, counting, object description and classroom participation.',
  Oliver: 'Oliver (5-6 years, may include older beginners). Broader topic vocabulary, full phrases, story comprehension and increasingly autonomous language use.',
  Marcia: 'Marcia (6-7 years). Advanced course, rich stories, complex structures, dialogues, comparisons and instructions. Sustained concentration and growing autonomy expected.',
  'Pam & Paul': 'Pam & Paul (7-8 years). Solid language base, complex structures, narration, dialogic interaction and autonomous language use.',
  'Ben & Brenda': 'Ben & Brenda (8-9 years). Consolidated proficiency, sophisticated structures, critical thinking in language and elaborated production.',
};
const GIORNI = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CURRENT_YEAR = '2026-2027';

function emptyEntry() {
  return { teacher_note: '', note: '', motivation: null, learning: null, behaviour: null };
}

export default function FollowUp() {
  const [groups, setGroups] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  const [form, setForm] = useState({
    group_id: '',
    session_date: todayISO(),
    story: 1,
    day: 1,
    group_note: '',
  });

  const [presentStudents, setPresentStudents] = useState([]);
  const [entries, setEntries] = useState({});
  const [newStudentName, setNewStudentName] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [showAddSuggestions, setShowAddSuggestions] = useState(false);
  const [newGroup, setNewGroup] = useState({ sede: 'Grosseto', corso: '', giorno: '', orario: '', anno_scolastico: CURRENT_YEAR });
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupCreateError, setGroupCreateError] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [yearFilter, setYearFilter] = useState(CURRENT_YEAR);

  const [guideDay, setGuideDay] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedStudent, setCopiedStudent] = useState('');

  const availableYears = Array.from(new Set(groups.map((g) => g.anno_scolastico).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  if (!availableYears.includes(CURRENT_YEAR)) availableYears.unshift(CURRENT_YEAR);
  const groupsForYear = groups.filter((g) => g.anno_scolastico === yearFilter);
  const selectedGroup = groups.find((g) => g.id === form.group_id) || null;
  const groupStudents = selectedGroup && Array.isArray(selectedGroup.students) ? selectedGroup.students : [];

  const studentList = Array.from(new Set(groups.flatMap((g) => (Array.isArray(g.students) ? g.students : [])))).sort((a, b) => a.localeCompare(b, 'it'));
  const addSuggestions = newStudentName.trim()
    ? studentList.filter((n) => n.toLowerCase().includes(newStudentName.trim().toLowerCase()) && n !== newStudentName).slice(0, 6)
    : [];
  const searchSuggestions = studentQuery.trim()
    ? studentList.filter((n) => n.toLowerCase().includes(studentQuery.trim().toLowerCase()) && n !== studentQuery).slice(0, 6)
    : [];
  const studentHistory = selectedStudent
    ? allSessions.filter((s) => (s.entries || []).some((en) => en.name && en.name.toLowerCase() === selectedStudent.toLowerCase())).sort((a, b) => new Date(a.session_date) - new Date(b.session_date))
    : [];

  async function loadData() {
    setLoading(true);
    const [{ data: g }, { data: s }, { data: all }] = await Promise.all([
      supabase.from('group_students').select('*').order('sede'),
      supabase.from('followup_sessions').select('*').order('created_at', { ascending: false }).limit(15),
      supabase.from('followup_sessions').select('*').order('session_date', { ascending: true }).limit(2000),
    ]);
    setGroups(g || []);
    setSessions(s || []);
    setAllSessions(all || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setPresentStudents(groupStudents); setEntries({}); }, [form.group_id]);

  useEffect(() => {
    async function loadGuideDay() {
      if (!selectedGroup?.corso || !form.story || !form.day) { setGuideDay(null); return; }
      setGuideLoading(true);
      const { data, error } = await supabase
        .from('guide_days')
        .select('lesson_goals, lesson_plan, preparation, materials')
        .eq('corso', selectedGroup.corso)
        .eq('story_number', Number(form.story))
        .eq('day_number', Number(form.day))
        .maybeSingle();
      setGuideDay(error ? null : (data || null));
      setGuideLoading(false);
    }
    loadGuideDay();
  }, [selectedGroup?.corso, form.story, form.day]);

  function getEntry(name) { return entries[name] || emptyEntry(); }
  function setEntryPatch(name, patch) { setEntries((prev) => ({ ...prev, [name]: { ...getEntry(name), ...patch } })); }
  function togglePresent(name) { setPresentStudents((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name])); }

  async function upsertGroupStudents(group, students) {
    const { error } = await supabase.from('group_students').update({ students }).eq('id', group.id);
    if (error) setGroupCreateError('Error saving students: ' + error.message);
    return !error;
  }

  async function handleAddStudent() {
    const name = newStudentName.trim();
    if (!name || !selectedGroup || groupStudents.includes(name)) return;
    setAddingStudent(true);
    await upsertGroupStudents(selectedGroup, [...groupStudents, name]);
    setNewStudentName('');
    setAddingStudent(false);
    await loadData();
  }

  async function handleRemoveStudent(name) {
    if (!selectedGroup) return;
    await upsertGroupStudents(selectedGroup, groupStudents.filter((n) => n !== name));
    await loadData();
  }

  async function handleCreateGroup() {
    if (!newGroup.corso || !newGroup.giorno) return;
    setCreatingGroup(true);
    setGroupCreateError('');
    const { data, error } = await supabase.from('group_students').insert({
      sede: newGroup.sede,
      corso: newGroup.corso,
      giorno: newGroup.giorno,
      orario: newGroup.orario || '',
      anno_scolastico: newGroup.anno_scolastico || CURRENT_YEAR,
      students: [],
    }).select().single();
    setCreatingGroup(false);
    if (error) {
      setGroupCreateError(error.code === '23505' ? 'This group already exists — select it from the list above.' : 'Error: ' + error.message);
      return;
    }
    await loadData();
    setYearFilter(data.anno_scolastico);
    setForm((f) => ({ ...f, group_id: data.id }));
    setShowNewGroup(false);
    setNewGroup({ sede: 'Grosseto', corso: '', giorno: '', orario: '', anno_scolastico: CURRENT_YEAR });
  }

  function copyHistory() {
    const lines = [selectedStudent, ''];
    studentHistory.forEach((session) => {
      const entry = (session.entries || []).find((en) => en.name && en.name.toLowerCase() === selectedStudent.toLowerCase());
      if (!entry || !entry.note) return;
      lines.push(`${fmtDate(session.session_date)} — ${session.corso || ''} ${session.giorno || ''}`.trim());
      lines.push(entry.note, '');
    });
    navigator.clipboard.writeText(lines.join('\n').trim() || 'No individual note found for this student.');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyStudentForClassroom(name) {
    const note = getEntry(name).note?.trim();
    navigator.clipboard.writeText(note || 'No generated judgment yet for this student.');
    setCopiedStudent(name);
    setTimeout(() => setCopiedStudent(''), 1800);
  }

  function selectedGroupLabel() {
    return selectedGroup ? `${selectedGroup.sede} · ${selectedGroup.corso} · ${selectedGroup.giorno}` : '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaveError(''); setSaveOk(false);
    if (!form.group_id) { setSaveError('Select a group.'); return; }
    setSaving(true);
    const entryList = presentStudents.map((name) => ({ name, ...getEntry(name) }));
    const { error } = await supabase.from('followup_sessions').insert({
      group_id: form.group_id,
      group_name: selectedGroupLabel(),
      session_date: form.session_date,
      story: `Story ${form.story}, Day ${form.day}`,
      day: Number(form.day),
      group_note: form.group_note || null,
      sede: selectedGroup?.sede || null,
      corso: selectedGroup?.corso || null,
      giorno: selectedGroup?.giorno || null,
      orario: selectedGroup?.orario || null,
      anno_scolastico: selectedGroup?.anno_scolastico || null,
      entries: entryList,
    });
    setSaving(false);
    if (error) { setSaveError('Error saving: ' + error.message); return; }
    setSaveOk(true);
    setForm({ group_id: '', session_date: todayISO(), story: 1, day: 1, group_note: '' });
    setPresentStudents([]); setEntries({});
    loadData();
  }

  async function handleDeleteGroup(group) {
    if (!window.confirm(`Delete the group ${group.sede} · ${group.corso} · ${group.giorno}${group.orario ? ' · ' + group.orario : ''}?`)) return;
    const { error } = await supabase.from('group_students').delete().eq('id', group.id);
    if (error) { alert('Delete error: ' + error.message); return; }
    if (form.group_id === group.id) setForm((f) => ({ ...f, group_id: '' }));
    await loadData();
  }

  async function handleDeleteSession(session) {
    if (!window.confirm(`Delete the follow-up from ${fmtDate(session.session_date)} (${session.group_name})?`)) return;
    const { error } = await supabase.from('followup_sessions').delete().eq('id', session.id);
    if (error) { alert('Delete error: ' + error.message); return; }
    await loadData();
  }

  function buildPrompt() {
    const corsoContext = (selectedGroup && CORSO_INFO[selectedGroup.corso]) || `Corso: ${selectedGroup?.corso || ''}`;
    const goals = guideDay?.lesson_goals || '(Teacher Guide goals not available for this day)';
    const lessonContext = guideDay?.lesson_plan || '';
    const groupObservation = form.group_note.trim() || '(none)';

    const studentEvidence = presentStudents.map((name) => {
      const e = getEntry(name);
      const ratings = RATING_FIELDS.map((field) => {
        const selected = EMOJI_SCALE.find((x) => x.value === e[field]);
        return `${RATING_LABELS[field]}: ${selected ? `${selected.label} (${selected.value}/5)` : 'not selected'}`;
      }).join('; ');
      return `${name}\n${ratings}\nTeacher individual observation: ${e.teacher_note?.trim() || '(none)'}`;
    }).join('\n\n');

    return `You are assisting a Kids&Us teacher in Italy with INTERNAL follow-up judgments that will later support term reports.

SOURCE OF TRUTH — TEACHER GUIDE
Course profile:
${corsoContext}

Teacher Guide — Story ${form.story}, Day ${form.day}
Lesson goals:
${goals}
${lessonContext ? `\nLesson plan actually taught / available for this Day:\n${lessonContext}` : ''}

TEACHER GROUP OBSERVATION
${groupObservation}

INDIVIDUAL TEACHER EVIDENCE
${studentEvidence}

TASK
For EACH student present, write one concise individualized judgment in Italian, 2-3 sentences, suitable as an internal follow-up note and useful later for a term report.

STRICT RULES
- Use the Teacher Guide for this exact Story/Day as the learning context. Do not use Planner summaries as a source.
- The selected Motivation/Learning/Behaviour ratings are teacher evidence. Respect them; do not change or reinterpret them into different ratings.
- Use each student's individual teacher observation when present.
- The group observation is context only: do NOT automatically attribute a group event or behaviour to every student.
- Do not invent incidents, answers, vocabulary produced, behaviours, achievements or difficulties that the teacher did not report or that are not supported by the selected ratings.
- Do not claim that a child achieved a specific lesson goal merely because it appears in the Teacher Guide. Connect the judgment to lesson goals only when the teacher evidence supports that connection.
- If evidence for one dimension is absent, simply avoid making a claim about that dimension instead of guessing.
- Keep developmental expectations appropriate to the course profile, especially for Mousy and Linda.
- Do not mention numeric ratings, emojis, the AI, the prompt, or lack of evidence in the final judgment.
- Tone: professional, natural, concise, factual, not inflated.

Return ONLY valid JSON exactly in this form:
{"Student Name":"judgment text"}`;
  }

  async function handleGenerate() {
    setGenerateError('');
    if (!presentStudents.length) { setGenerateError('Segna almeno un allievo come presente.'); return; }
    if (!selectedGroup) { setGenerateError('Seleziona prima il gruppo.'); return; }
    if (guideLoading) { setGenerateError('Sto ancora caricando la Teacher Guide del giorno.'); return; }
    if (!guideDay) { setGenerateError(`Non trovo la Teacher Guide per ${selectedGroup.corso}, Story ${form.story}, Day ${form.day}.`); return; }

    const withoutEvidence = presentStudents.filter((name) => {
      const e = getEntry(name);
      return !e.teacher_note?.trim() && !RATING_FIELDS.some((field) => e[field]);
    });
    if (withoutEvidence.length) {
      setGenerateError(`Per generare un giudizio serve almeno un'emoji o una nota individuale per: ${withoutEvidence.join(', ')}.`);
      return;
    }

    setGenerating(true);
    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, messages: [{ role: 'user', content: buildPrompt() }] }),
      });
      const data = await resp.json();
      const raw = (data.content || []).map((b) => b.text || '').join('').replace(/```json|```/g, '').trim();
      if (!raw) throw new Error(data.error?.message || 'Empty AI response');
      const parsed = JSON.parse(raw);
      presentStudents.forEach((name) => {
        const judgment = parsed[name];
        if (judgment) setEntryPatch(name, { note: typeof judgment === 'string' ? judgment : String(judgment.note || '') });
      });
    } catch (e) {
      setGenerateError('Generation error: ' + e.message);
    }
    setGenerating(false);
  }

  return (
    <Layout>
      <div className="page-eyebrow">Active module</div>
      <h1 className="page-title">Follow-up</h1>
      <p className="page-desc">Record teacher evidence, then generate individual judgments grounded in the exact Teacher Guide Story and Day.</p>

      <div className="section-block">
        <h2>New follow-up</h2>
        <form onSubmit={handleSubmit}>
          <div className="field"><label>School year</label><select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>{availableYears.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          <div className="field">
            <label>Group</label>
            <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
              <option value="">Select…</option>
              {groupsForYear.map((g) => <option key={g.id} value={g.id}>{g.sede} · {g.corso} · {g.giorno}{g.orario ? ` · ${g.orario}` : ''}</option>)}
            </select>
            {!showNewGroup ? <button type="button" className="btn secondary" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={() => setShowNewGroup(true)}>+ New group</button> : (
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
                <select value={newGroup.sede} onChange={(e) => setNewGroup({ ...newGroup, sede: e.target.value })}>{SEDI.map((s) => <option key={s}>{s}</option>)}</select>
                <select value={newGroup.corso} onChange={(e) => setNewGroup({ ...newGroup, corso: e.target.value })}><option value="">Course…</option>{CORSI.map((c) => <option key={c}>{c}</option>)}</select>
                <select value={newGroup.giorno} onChange={(e) => setNewGroup({ ...newGroup, giorno: e.target.value })}><option value="">Day…</option>{GIORNI.map((g) => <option key={g}>{g}</option>)}</select>
                <input placeholder="Time" value={newGroup.orario} onChange={(e) => setNewGroup({ ...newGroup, orario: e.target.value })} />
                <button type="button" className="btn" onClick={handleCreateGroup} disabled={creatingGroup || !newGroup.corso || !newGroup.giorno}>Create</button>
                <button type="button" className="btn secondary" onClick={() => setShowNewGroup(false)}>Cancel</button>
                {groupCreateError && <div className="error-text" style={{ width: '100%' }}>{groupCreateError}</div>}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field"><label>Date</label><input type="date" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} /></div>
            <div className="field"><label>Story</label><select value={form.story} onChange={(e) => setForm({ ...form, story: Number(e.target.value) })}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>Story {n}</option>)}</select></div>
            <div className="field"><label>Day</label><input type="number" min="1" value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) || 1 })} /></div>
          </div>

          {selectedGroup && (
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 10, background: guideDay ? '#eef8f0' : '#fff5e8', fontSize: 13.5 }}>
              {guideLoading ? 'Loading Teacher Guide…' : guideDay ? `✓ Teacher Guide loaded: ${selectedGroup.corso} · Story ${form.story} · Day ${form.day}` : `Teacher Guide not found for ${selectedGroup.corso} · Story ${form.story} · Day ${form.day}`}
              {guideDay?.lesson_goals && <div style={{ marginTop: 6, color: 'var(--ink-soft)' }}><strong>Goals:</strong> {guideDay.lesson_goals}</div>}
            </div>
          )}

          {selectedGroup && (
            <div className="field">
              <label>Attendance — {groupStudents.length} students</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {groupStudents.map((name) => {
                  const present = presentStudents.includes(name);
                  return <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <button type="button" onClick={() => togglePresent(name)} className="btn secondary" style={{ padding: '6px 12px', background: present ? '#e9f1ea' : 'transparent' }}>{present ? '✓ ' : '✗ '}{name}</button>
                    <button type="button" onClick={() => handleRemoveStudent(name)} className="link-btn danger">×</button>
                  </span>;
                })}
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="New student name…" value={newStudentName} onChange={(e) => { setNewStudentName(e.target.value); setShowAddSuggestions(true); }} onFocus={() => setShowAddSuggestions(true)} onBlur={() => setTimeout(() => setShowAddSuggestions(false), 150)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddStudent(); } }} />
                  <button type="button" className="btn secondary" onClick={handleAddStudent} disabled={addingStudent}>+ Add</button>
                </div>
                {showAddSuggestions && addSuggestions.length > 0 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid var(--line)', borderRadius: 10 }}>{addSuggestions.map((n) => <div key={n} onMouseDown={() => { setNewStudentName(n); setShowAddSuggestions(false); }} style={{ padding: '10px 12px', cursor: 'pointer' }}>{n}</div>)}</div>}
              </div>
            </div>
          )}

          <div className="field"><label>Group note (optional)</label><textarea value={form.group_note} onChange={(e) => setForm({ ...form, group_note: e.target.value })} placeholder="Dynamics, particular episodes, classroom mood…" /></div>

          {presentStudents.length > 0 && (
            <div className="field">
              <label>Individual assessments</label>
              {presentStudents.map((name) => {
                const entry = getEntry(name);
                return <div key={name} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 10, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <strong>{name}</strong>
                    <button type="button" className="btn secondary" style={{ padding: '6px 10px', fontSize: 12.5 }} onClick={() => copyStudentForClassroom(name)}>{copiedStudent === name ? 'Copied ✓' : '📋 Copy judgment'}</button>
                  </div>
                  {RATING_FIELDS.map((field) => <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}><span style={{ fontSize: 12, color: 'var(--ink-soft)', width: 80 }}>{RATING_LABELS[field]}</span>{EMOJI_SCALE.map((es) => <button key={es.value} type="button" title={es.label} onClick={() => setEntryPatch(name, { [field]: entry[field] === es.value ? null : es.value })} style={{ border: entry[field] === es.value ? '2px solid var(--coral)' : '1px solid var(--line)', borderRadius: 8, background: '#fff', padding: '2px 6px', fontSize: 18 }}>{es.emoji}</button>)}</div>)}
                  <textarea placeholder="Teacher observation (optional)…" value={entry.teacher_note || ''} onChange={(e) => setEntryPatch(name, { teacher_note: e.target.value })} style={{ width: '100%', marginTop: 10, minHeight: 60 }} />
                  {entry.note && <div style={{ marginTop: 10 }}><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>AI judgment</label><textarea value={entry.note} onChange={(e) => setEntryPatch(name, { note: e.target.value })} style={{ width: '100%', minHeight: 72, background: '#f8faf8' }} /></div>}
                </div>;
              })}
            </div>
          )}

          {selectedGroup && presentStudents.length > 0 && (
            <div className="field">
              <label>Generate with AI</label>
              <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: '#fff' }}>
                <p className="page-desc" style={{ margin: '0 0 10px', fontSize: 13 }}>Uses the exact Teacher Guide Day, your selected emojis, the optional group note and each optional individual observation. It generates the written judgment only; your ratings stay exactly as you selected them.</p>
                <button type="button" className="btn" disabled={generating || !guideDay} onClick={handleGenerate} style={{ width: '100%' }}>{generating ? 'Generating judgments…' : 'Generate individual judgments'}</button>
                {generateError && <div className="error-text" style={{ marginTop: 10 }}>{generateError}</div>}
              </div>
            </div>
          )}

          {saveError && <div className="error-text">{saveError}</div>}
          {saveOk && <div style={{ color: 'var(--sage)', fontSize: 13, marginBottom: 14 }}>Saved.</div>}
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save follow-up'}</button>
        </form>
      </div>

      <div className="section-block">
        <h2>Student history</h2>
        <div className="field" style={{ position: 'relative' }}>
          <label>Search student</label>
          <input placeholder="Start typing a name…" value={studentQuery} onChange={(e) => { setStudentQuery(e.target.value); setShowSearchSuggestions(true); const exact = studentList.find((n) => n.toLowerCase() === e.target.value.toLowerCase()); setSelectedStudent(exact || ''); }} onFocus={() => setShowSearchSuggestions(true)} onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 150)} />
          {showSearchSuggestions && searchSuggestions.length > 0 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid var(--line)', borderRadius: 10 }}>{searchSuggestions.map((n) => <div key={n} onMouseDown={() => { setStudentQuery(n); setSelectedStudent(n); setShowSearchSuggestions(false); }} style={{ padding: '10px 12px', cursor: 'pointer' }}>{n}</div>)}</div>}
        </div>
        {selectedStudent && <><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><strong>{selectedStudent}</strong><button className="btn secondary" onClick={copyHistory} type="button">{copied ? 'Copied ✓' : 'Copy all for Term Reports'}</button></div>{studentHistory.length === 0 ? <p>No follow-up found.</p> : <table className="simple-table"><thead><tr><th>Date</th><th>Group</th><th>Assessments</th><th>Note</th></tr></thead><tbody>{studentHistory.map((s) => { const entry = (s.entries || []).find((en) => en.name && en.name.toLowerCase() === selectedStudent.toLowerCase()); const ratings = entry ? RATING_FIELDS.map((f) => entry[f] && EMOJI_SCALE.find((x) => x.value === entry[f])?.emoji).filter(Boolean).join(' ') : ''; return <tr key={s.id}><td>{fmtDate(s.session_date)}</td><td>{s.corso} · {s.giorno}</td><td>{ratings || '—'}</td><td>{entry?.note || '—'}</td></tr>; })}</tbody></table>}</>}
      </div>

      <div className="section-block">
        <h2>Your groups</h2>
        {loading ? <p>Loading…</p> : <table className="simple-table"><thead><tr><th>Location</th><th>Course</th><th>Day</th><th>Time</th><th>Year</th><th>Students</th><th></th></tr></thead><tbody>{groups.map((g) => <tr key={g.id}><td>{g.sede}</td><td>{g.corso}</td><td>{g.giorno}</td><td>{g.orario || '—'}</td><td>{g.anno_scolastico}</td><td>{Array.isArray(g.students) ? g.students.length : 0}</td><td><button type="button" onClick={() => handleDeleteGroup(g)} className="link-btn danger">Delete</button></td></tr>)}</tbody></table>}
      </div>

      <div className="section-block">
        <h2>Recent follow-ups</h2>
        {loading ? <p>Loading…</p> : sessions.length === 0 ? <p>No follow-up registered yet.</p> : <table className="simple-table"><thead><tr><th>Date</th><th>Group</th><th>Story/Day</th><th>Students assessed</th><th></th></tr></thead><tbody>{sessions.map((s) => <tr key={s.id}><td>{fmtDate(s.session_date)}</td><td>{s.group_name}</td><td>{s.story || '—'}</td><td>{Array.isArray(s.entries) ? s.entries.length : 0}</td><td><button type="button" onClick={() => handleDeleteSession(s)} className="link-btn danger">Delete</button></td></tr>)}</tbody></table>}
      </div>
    </Layout>
  );
}
