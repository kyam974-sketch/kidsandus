import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const CORSI = ['Mousy', 'Mousy Nursery', 'Linda', 'Linda Nursery', 'Sam', 'Emma', 'Oliver', 'Marcia', 'Pam & Paul', 'Ben & Brenda'];

function emptyDayForm() {
  return { lesson_goals: '', materials: '', bonus_materials: '', preparation: '', lesson_plan: '' };
}

export default function Guides() {
  const [corso, setCorso] = useState('Mousy');
  const [view, setView] = useState('course');
  const [sections, setSections] = useState([]);
  const [openSection, setOpenSection] = useState(null);
  const [storyNumber, setStoryNumber] = useState(1);
  const [story, setStory] = useState(null);
  const [storyTab, setStoryTab] = useState('routines');
  const [openInfoBlock, setOpenInfoBlock] = useState(null);
  const [days, setDays] = useState([]);
  const [openDay, setOpenDay] = useState(null);
  const [editingDay, setEditingDay] = useState(null);
  const [dayForm, setDayForm] = useState(emptyDayForm());
  const [savingDay, setSavingDay] = useState(false);
  const [pdfBase64, setPdfBase64] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadCourseSections() {
    setLoading(true);
    const { data } = await supabase.from('guide_sections').select('*').eq('corso', corso).order('section_order');
    setSections(data || []);
    setLoading(false);
  }

  async function loadStory() {
    setLoading(true);
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.from('guide_stories').select('*').eq('corso', corso).eq('story_number', storyNumber).maybeSingle(),
      supabase.from('guide_days').select('*').eq('corso', corso).eq('story_number', storyNumber).order('day_number'),
    ]);
    setStory(s || null);
    setDays(d || []);
    setLoading(false);
  }

  useEffect(() => { if (view === 'course') loadCourseSections(); }, [corso, view]);
  useEffect(() => { if (view === 'story') loadStory(); }, [corso, storyNumber, view]);

  function startEditDay(day) {
    setEditingDay(day.day_number);
    setDayForm({ lesson_goals: day.lesson_goals || '', materials: day.materials || '', bonus_materials: day.bonus_materials || '', preparation: day.preparation || '', lesson_plan: day.lesson_plan || '' });
    setOpenDay(null);
    setGenerateError('');
  }

  function startNewDay() {
    const nextNumber = days.length > 0 ? Math.max(...days.map((d) => d.day_number)) + 1 : 1;
    setEditingDay(nextNumber);
    setDayForm(emptyDayForm());
    setPdfBase64(''); setPdfName(''); setGenerateError('');
  }

  function cancelEditDay() {
    setEditingDay(null); setDayForm(emptyDayForm()); setPdfBase64(''); setPdfName(''); setGenerateError('');
  }

  async function saveDay() {
    setSavingDay(true);
    const { error } = await supabase.from('guide_days').upsert({ corso, story_number: storyNumber, day_number: editingDay, ...dayForm }, { onConflict: 'corso,story_number,day_number' });
    setSavingDay(false);
    if (error) { setGenerateError('Save error: ' + error.message); return; }
    cancelEditDay(); await loadStory();
  }

  async function deleteDay(day) {
    if (!window.confirm(`Delete Day ${day.day_number}? This cannot be undone.`)) return;
    await supabase.from('guide_days').delete().eq('corso', corso).eq('story_number', storyNumber).eq('day_number', day.day_number);
    await loadStory();
  }

  function handlePdfChange(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setPdfName(file.name);
    const reader = new FileReader();
    reader.onload = () => { const result = reader.result || ''; setPdfBase64(String(result).split(',')[1] || ''); };
    reader.readAsDataURL(file);
  }

  async function handleGenerateDay() {
    if (!pdfBase64) { setGenerateError('Upload a photo or PDF of the lesson plan page(s) first.'); return; }
    setGenerateError(''); setGenerating(true);
    const prompt = `You are reading a page from a Kids&Us Teacher Guide, showing a Daily Lesson Plan ("Day #${editingDay}") for ${corso}, Story ${storyNumber}.\n\nExtract the content into the following fields, copying the exact wording from the source (do not paraphrase or translate — this is used verbatim in class):\n- lesson_goals: the "LESSON GOALS" bullet list\n- materials: the "MATERIALS" bullet list\n- bonus_materials: the "BONUS ACTIVITIES MATERIALS" list (if present, else empty string)\n- preparation: the "PREPARATION" section text (if present, else empty string)\n- lesson_plan: the full "LESSON PLAN" section, including all numbered steps, activity names, timings, track numbers, "HOW TO PLAY" instructions, and the "BONUS ACTIVITIES" section at the end, preserving line breaks and exact quoted phrases.\n\nRespond with ONLY valid JSON, no markdown:\n{"lesson_goals": "...", "materials": "...", "bonus_materials": "...", "preparation": "...", "lesson_plan": "..."}`;
    try {
      const resp = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } }, { type: 'text', text: prompt }] }] }) });
      const data = await resp.json();
      const text = (data.content || []).map((b) => b.text || '').join('');
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      setDayForm({ lesson_goals: parsed.lesson_goals || '', materials: parsed.materials || '', bonus_materials: parsed.bonus_materials || '', preparation: parsed.preparation || '', lesson_plan: parsed.lesson_plan || '' });
    } catch (e) { setGenerateError('Generation error: ' + e.message); }
    setGenerating(false);
  }

  const infoBlocks = story ? [
    { key: 'the_story', label: 'The Story', content: story.the_story },
    { key: 'songs', label: 'Story Specific Songs', content: story.songs },
    { key: 'warmup_routines', label: 'Warm-up Routines', content: story.warmup_routines },
    { key: 'choosing_rhyme', label: 'Choosing Rhyme', content: story.choosing_rhyme },
  ] : [];

  return (
    <Layout>
      <div className="page-eyebrow">Active module</div>
      <h1 className="page-title">Teacher Guides</h1>
      <p className="page-desc">Course methodology, story routines, and daily lesson plans, by course.</p>
      <div className="section-block">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
          <div className="field" style={{ maxWidth: 220, marginBottom: 0 }}>
            <label htmlFor="corso-select-guide">Course</label>
            <select id="corso-select-guide" value={corso} onChange={(e) => setCorso(e.target.value)}>{CORSI.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button type="button" className={view === 'course' ? 'btn' : 'btn secondary'} onClick={() => setView('course')}>Course Info</button>
            <button type="button" className={view === 'story' ? 'btn' : 'btn secondary'} onClick={() => setView('story')}>Stories</button>
          </div>
          {view === 'story' && <div className="field" style={{ maxWidth: 140, marginBottom: 16 }}><label htmlFor="story-select">Story</label><select id="story-select" value={storyNumber} onChange={(e) => { setStoryNumber(Number(e.target.value)); cancelEditDay(); }}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>Story {n}</option>)}</select></div>}
        </div>

        {loading ? <p className="page-desc">Loading…</p> : view === 'course' ? (
          sections.length === 0 ? <p className="page-desc">No course info added yet for {corso}.</p> : <div>{sections.map((s) => { const isOpen = openSection === s.id; return <div key={s.id} className="collapse-card"><div className="collapse-head" onClick={() => setOpenSection(isOpen ? null : s.id)}><span style={{ fontSize: 14 }}><span className="collapse-num">{s.section_order}</span><strong>{s.title}</strong></span><span className="collapse-chevron">{isOpen ? '▲' : '▼'}</span></div>{isOpen && <div className="collapse-body"><pre className="pre-text">{s.content || '(no content yet)'}</pre></div>}</div>; })}</div>
        ) : !story && days.length === 0 ? <p className="page-desc">No content added yet for Story {storyNumber}.</p> : (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}><button type="button" className={storyTab === 'routines' ? 'btn' : 'btn secondary'} onClick={() => setStoryTab('routines')}>Story Info & Routines</button><button type="button" className={storyTab === 'days' ? 'btn' : 'btn secondary'} onClick={() => setStoryTab('days')}>Days ({days.length})</button></div>
            {storyTab === 'routines' && <div>{story && <h2 style={{ marginBottom: 14 }}>{story.title}</h2>}{infoBlocks.map((b) => { const isOpen = openInfoBlock === b.key; return <div key={b.key} className="collapse-card"><div className="collapse-head" onClick={() => setOpenInfoBlock(isOpen ? null : b.key)}><strong style={{ fontSize: 14 }}>{b.label}</strong><span className="collapse-chevron">{isOpen ? '▲' : '▼'}</span></div>{isOpen && <div className="collapse-body"><pre className="pre-text">{b.content || '(no content yet)'}</pre></div>}</div>; })}</div>}
            {storyTab === 'days' && <div>
              {editingDay === null && <button type="button" className="btn secondary" style={{ marginBottom: 14 }} onClick={startNewDay}>+ New Day</button>}
              {editingDay !== null && <div className="edit-panel"><h3 style={{ fontSize: 16, marginBottom: 10 }}>Day {editingDay}</h3><div className="field"><label>Generate from photo/PDF (optional)</label><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><label htmlFor="day-pdf-upload" className="btn secondary" style={{ display: 'inline-block', fontSize: 13, cursor: 'pointer' }}>{pdfName ? '📄 Change file' : '📄 Upload lesson plan page(s)'}</label><input id="day-pdf-upload" type="file" accept=".pdf,application/pdf,image/*" onChange={handlePdfChange} style={{ display: 'none' }}/>{pdfName && <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{pdfName}</span>}<button type="button" className="btn" disabled={generating || !pdfBase64} onClick={handleGenerateDay}>{generating ? 'Generating…' : 'Generate with AI'}</button></div>{generateError && <div className="error-text" style={{ marginTop: 8 }}>{generateError}</div>}</div>{[['lesson_goals','Lesson Goals',100],['materials','Materials',120],['bonus_materials','Bonus Activities Materials',60],['preparation','Preparation',80],['lesson_plan','Lesson Plan',300]].map(([key,label,height]) => <div className="field" key={key}><label htmlFor={key}>{label}</label><textarea id={key} value={dayForm[key]} onChange={(e) => setDayForm({ ...dayForm, [key]: e.target.value })} style={{ minHeight: height }}/></div>)}<div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn" disabled={savingDay} onClick={saveDay}>{savingDay ? 'Saving…' : 'Save Day'}</button><button type="button" className="btn secondary" onClick={cancelEditDay}>Cancel</button></div></div>}
              {editingDay === null && days.map((day) => { const isOpen = openDay === day.day_number; return <div key={day.day_number} className="collapse-card"><div className="collapse-head" onClick={() => setOpenDay(isOpen ? null : day.day_number)}><strong style={{ fontSize: 14 }}>Day {day.day_number}</strong><span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><button type="button" onClick={(e) => { e.stopPropagation(); startEditDay(day); }} className="link-btn">Edit</button><button type="button" onClick={(e) => { e.stopPropagation(); deleteDay(day); }} className="link-btn danger">Delete</button><span className="collapse-chevron">{isOpen ? '▲' : '▼'}</span></span></div>{isOpen && <div className="collapse-body"><h4 className="day-subhead">Materials</h4><pre className="pre-text materials-box">{day.materials || '(none)'}</pre>{day.bonus_materials && <><h4 className="day-subhead">Bonus Activities Materials</h4><pre className="pre-text materials-box">{day.bonus_materials}</pre></>}<h4 className="day-subhead">Lesson Goals</h4><pre className="pre-text">{day.lesson_goals || '(none)'}</pre>{day.preparation && <><h4 className="day-subhead">Preparation</h4><pre className="pre-text">{day.preparation}</pre></>}<h4 className="day-subhead">Lesson Plan</h4><pre className="pre-text">{day.lesson_plan || '(none)'}</pre></div>}</div>; })}
            </div>}
          </div>
        )}
      </div>
    </Layout>
  );
}
