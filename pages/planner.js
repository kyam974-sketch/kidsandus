import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const COURSES = [
  { id: 'mousy', name: 'Mousy' }, { id: 'linda', name: 'Linda' }, { id: 'sam', name: 'Sam' },
  { id: 'emma', name: 'Emma' }, { id: 'oliver', name: 'Oliver' }, { id: 'marcia', name: 'Marcia' },
  { id: 'pam', name: 'Pam & Paul' }, { id: 'ben', name: 'Ben & Brenda' },
];

function emptyActivity() {
  return { name: 'New activity', duration: "5'", audio: '', desc: '', notes: '', materials: '', is_bonus: false };
}

function renderNotes(text) {
  if (!text) return null;
  return String(text).split('**').map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="mandatory-phrase">{part}</strong> : <span key={i}>{part}</span>
  );
}

function parseAudioNumbers(audioText) {
  if (!audioText) return [];
  return [...String(audioText).matchAll(/#(\d+)/g)].map((m) => parseInt(m[1], 10));
}

function AudioBadges({ audioText, songsMap, big = false }) {
  if (!audioText) return null;
  const nums = parseAudioNumbers(audioText);
  if (!nums.length) return <div className="audio-badge" style={{ fontSize: big ? 16 : 13 }}>🎵 {audioText}</div>;
  return (
    <div className="audio-wrap">
      {nums.map((n) => {
        const song = songsMap[n];
        return (
          <div key={n} className="audio-badge" style={{ fontSize: big ? 16 : 13 }}>
            <span>🎵 TR#{n}{song ? ` ${song.title}` : ''}</span>
            {song?.audio_url ? <audio controls src={song.audio_url} preload="none" /> : <em>(no audio yet)</em>}
          </div>
        );
      })}
    </div>
  );
}

function parseDuration(d) {
  const n = parseInt(String(d).replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function clockToSeconds(clock) {
  const [h, m] = String(clock).split(':').map(Number);
  return h * 3600 + m * 60;
}

function fmtCountdown(seconds) {
  const safe = Math.max(0, seconds || 0);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export default function Planner() {
  const [courseId, setCourseId] = useState('sam');
  const [storyNumber, setStoryNumber] = useState(1);
  const [dayNumber, setDayNumber] = useState(1);
  const [activities, setActivities] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('edit');
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [songsMap, setSongsMap] = useState({});
  const [dayGuide, setDayGuide] = useState(null);
  const [startTime, setStartTime] = useState('16:00');
  const [now, setNow] = useState(new Date());
  const [manualIdx, setManualIdx] = useState(null);

  const key = `${courseId}|Story ${storyNumber}|${dayNumber}`;
  const corsoName = COURSES.find((c) => c.id === courseId)?.name;

  useEffect(() => {
    if (mode !== 'live' && mode !== 'light') return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [mode]);

  async function loadAll() {
    setLoading(true);
    const [{ data: lesson }, { data: songs }, { data: guide }] = await Promise.all([
      supabase.from('lessons').select('data').eq('key', key).maybeSingle(),
      supabase.from('songs').select('track_number, title, audio_url').eq('corso', corsoName),
      supabase.from('guide_days').select('materials, bonus_materials').eq('corso', corsoName).eq('story_number', storyNumber).eq('day_number', dayNumber).maybeSingle(),
    ]);
    setActivities(Array.isArray(lesson?.data) ? lesson.data : []);
    setHistory([]);
    const map = {};
    (songs || []).forEach((s) => { map[s.track_number] = s; });
    setSongsMap(map);
    setDayGuide(guide || null);
    setManualIdx(null);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, [courseId, storyNumber, dayNumber]);

  async function persistActivities(next) {
    setActivities(next);
    setSaving(true);
    const { error } = await supabase.from('lessons').upsert({ key, data: next }, { onConflict: 'key' });
    setSaving(false);
    if (error) setGenerateError('Save error: ' + error.message);
  }

  async function saveActivities(next, remember = false) {
    if (remember) setHistory((h) => [...h.slice(-19), activities]);
    await persistActivities(next);
  }

  async function undo() {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    await persistActivities(previous);
  }

  function updateAct(idx, field, value) {
    const next = activities.slice();
    next[idx] = { ...next[idx], [field]: value };
    saveActivities(next, field === 'is_bonus');
  }
  function addActivity() { saveActivities([...activities, emptyActivity()], true); }
  function deleteAct(idx) { const next = activities.slice(); next.splice(idx, 1); saveActivities(next, true); }
  function moveAct(idx, dir) {
    const next = activities.slice(); const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    saveActivities(next, true);
  }

  async function handleGenerateNotes() {
    setGenerateError('');
    setGeneratingNotes(true);
    try {
      const [{ data: day }, { data: story }] = await Promise.all([
        supabase.from('guide_days').select('*').eq('corso', corsoName).eq('story_number', storyNumber).eq('day_number', dayNumber).maybeSingle(),
        supabase.from('guide_stories').select('*').eq('corso', corsoName).eq('story_number', storyNumber).maybeSingle(),
      ]);

      if (!day?.lesson_plan) throw new Error('No Teacher Guide lesson plan found for this course/story/day yet.');

      const context = [];
      if (story?.warmup_routines) context.push('WARM-UP ROUTINES:\n' + story.warmup_routines);
      if (story?.songs) context.push('STORY SONGS:\n' + story.songs);
      if (story?.choosing_rhyme) context.push('CHOOSING RHYME:\n' + story.choosing_rhyme);
      if (day?.lesson_goals) context.push('LESSON GOALS:\n' + day.lesson_goals);
      if (day?.materials) context.push('MATERIALS:\n' + day.materials);
      if (day?.bonus_materials) context.push('BONUS MATERIALS:\n' + day.bonus_materials);
      if (day?.preparation) context.push('PREPARATION:\n' + day.preparation);
      context.push('LESSON PLAN:\n' + day.lesson_plan);

      const prompt = `Convert this Kids&Us Teacher Guide for ${corsoName}, Story ${storyNumber}, Day ${dayNumber} directly into the teacher's usable lesson notes.\n\n${context.join('\n\n')}\n\nReturn ONLY a JSON array. Each numbered top-level lesson-plan step becomes exactly ONE object in the same order. Bonus activities become objects with is_bonus=true. Use each step's own duration and track numbers.\n\nEach object must be:\n{"name":"...","duration":"6'","audio":"Track #1" or "","desc":"source wording for this activity","notes":"short teacher notes","materials":"...","is_bonus":false}\n\nNOTES RULES:\n- notes are telegraphic, imperative, minimal and easy to glance at during class; no filler and no explanatory prose.\n- Preserve teacher speech exactly whenever the source gives words the teacher is supposed to SAY, ASK, TELL, REPEAT, PROMPT or MODEL to the children. This includes quoted direct speech and clearly indicated teacher prompts even if the source formatting did not survive import.\n- Never paraphrase those spoken phrases. Copy them verbatim from the source and wrap each exact spoken phrase in **double asterisks** so the interface renders it in bold.\n- Do NOT mark ordinary instructions or narration as mandatory speech.\n- If uncertain whether wording is a teacher utterance, keep it in the notes without ** rather than inventing or rewriting it.\n- Keep useful operational cues such as prop/action, track, turn-taking and transitions, but compress them heavily.\n- Do not invent wording that is absent from the Teacher Guide.\n\nDESC RULE: keep enough original source wording for later regeneration/reference, but the teacher sees notes in class, not desc.`;

      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await resp.json();
      const text = (data.content || []).map((b) => b.text || '').join('');
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      if (!Array.isArray(parsed)) throw new Error('Unexpected response format');

      if (activities.length && !window.confirm(`Replace the ${activities.length} existing activities with ${parsed.length} newly generated lesson notes?`)) {
        setGeneratingNotes(false);
        return;
      }
      await saveActivities(parsed, true);
    } catch (e) {
      setGenerateError('Notes generation error: ' + e.message);
    }
    setGeneratingNotes(false);
  }

  const normalActs = activities.filter((a) => !a.is_bonus);
  const bonusActs = activities.filter((a) => a.is_bonus);
  const [sh, sm] = startTime.split(':').map(Number);
  let cumulative = 0;
  const timedActs = normalActs.map((a) => {
    const startMin = sh * 60 + sm + cumulative;
    const dur = parseDuration(a.duration);
    cumulative += dur;
    const endMin = sh * 60 + sm + cumulative;
    const fmt = (mins) => `${String(Math.floor((mins / 60) % 24)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    return { ...a, startClock: fmt(startMin), endClock: fmt(endMin), durationMinutes: dur };
  });

  const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const currentActIdx = timedActs.findIndex((a) => nowSecs >= clockToSeconds(a.startClock) && nowSecs < clockToSeconds(a.endClock));
  const currentAct = currentActIdx >= 0 ? timedActs[currentActIdx] : null;
  let currentProgress = 0;
  let remainingSecs = 0;
  if (currentAct) {
    const startSecs = clockToSeconds(currentAct.startClock);
    const endSecs = clockToSeconds(currentAct.endClock);
    const total = Math.max(1, endSecs - startSecs);
    const elapsed = Math.max(0, Math.min(total, nowSecs - startSecs));
    currentProgress = (elapsed / total) * 100;
    remainingSecs = Math.max(0, total - elapsed);
  }

  const autoDisplayIdx = currentActIdx >= 0 ? currentActIdx : 0;
  const displayIdx = manualIdx !== null ? manualIdx : autoDisplayIdx;
  const displayAct = timedActs[displayIdx];
  const displayIsCurrent = displayIdx === currentActIdx && currentActIdx >= 0;
  const secondsUntilDisplay = displayAct ? Math.max(0, clockToSeconds(displayAct.startClock) - nowSecs) : 0;
  const lightCountdown = displayIsCurrent ? remainingSecs : secondsUntilDisplay;
  const lightCountdownLabel = displayIsCurrent ? 'remaining' : (secondsUntilDisplay > 0 ? 'starts in' : 'finished');

  const printActivities = timedActs.map((a) => ({ ...a, noteText: a.notes || '' }));

  return (
    <Layout>
      <div className="planner-screen">
        <div className="page-eyebrow no-print">Active module</div>
        <h1 className="page-title no-print">Planner</h1>
        <p className="page-desc no-print">Plan it your way: AI-assisted or completely manual.</p>

        {mode === 'light' ? (
          <div className="light-stage">
            <div style={{ position: 'absolute', top: 24, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, fontSize: 18, fontWeight: 800 }}>
              <span>🕒 {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span>{displayAct ? `${displayAct.startClock} – ${displayAct.endClock}` : '—'}</span>
              <span>{displayAct ? `⏱ ${lightCountdownLabel} ${fmtCountdown(lightCountdown)}` : ''}</span>
            </div>
            <div className="light-counter">{displayIdx + 1} / {timedActs.length}</div>
            <div className="light-title">{displayAct?.name || '—'}</div>
            {(displayAct?.notes || displayAct?.desc) && <div className="light-note">{renderNotes(displayAct.notes || displayAct.desc)}</div>}
            <AudioBadges audioText={displayAct?.audio} songsMap={songsMap} big />
            {displayAct?.materials && <div className="light-materials">🎒 {displayAct.materials}</div>}
            <div className="light-controls">
              <button className="btn secondary dark-btn" onClick={() => setManualIdx(Math.max(0, displayIdx - 1))}>◀</button>
              <button className="btn" onClick={() => setMode('live')}>Exit Light</button>
              <button className="btn secondary dark-btn" onClick={() => setManualIdx(Math.min(timedActs.length - 1, displayIdx + 1))}>▶</button>
            </div>
          </div>
        ) : (
          <>
            <div className="section-block no-print planner-toolbar">
              <div className="planner-selectors">
                <div className="field compact"><label>Course</label><select value={courseId} onChange={(e) => setCourseId(e.target.value)}>{COURSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="field compact"><label>Story</label><select value={storyNumber} onChange={(e) => setStoryNumber(Number(e.target.value))}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>Story {n}</option>)}</select></div>
                <div className="field compact day-field"><label>Day</label><input type="number" min="1" value={dayNumber} onChange={(e) => setDayNumber(Number(e.target.value) || 1)} /></div>
                <div className="mode-buttons"><button className={mode === 'edit' ? 'btn' : 'btn secondary'} onClick={() => setMode('edit')}>Edit</button><button className={mode === 'live' ? 'btn' : 'btn secondary'} onClick={() => setMode('live')}>Live</button><button className="btn secondary" onClick={() => setMode('light')}>Extra Light</button></div>
              </div>
              {saving && <div className="saving-note">Saving…</div>}
            </div>

            {mode === 'edit' && (
              <div className="section-block no-print">
                <div className="planner-actions">
                  <button className="btn secondary" disabled={!history.length || saving} onClick={undo}>↩️ Undo</button>
                  <button className="btn" disabled={generatingNotes} onClick={handleGenerateNotes}>{generatingNotes ? 'Generating…' : '📝 Generate lesson notes'}</button>
                  <button className="btn secondary" onClick={addActivity}>＋ Add activity manually</button>
                </div>
                {generateError && <div className="error-text">{generateError}</div>}
                <p className="planner-help">Generate lesson notes reads the selected Teacher Guide day directly, builds the activity list and keeps teacher speech verbatim. Undo restores the last structural action. You can also build or edit the lesson completely by hand.</p>

                {loading ? <p>Loading…</p> : activities.length === 0 ? <p>No activities yet. Generate lesson notes from the Teacher Guide or add activities manually.</p> : activities.map((a, i) => (
                  <div key={i} className={a.is_bonus ? 'act-edit-card bonus' : 'act-edit-card'}>
                    <div className="act-edit-head">
                      <input className="activity-name-input" value={a.name || ''} onChange={(e) => updateAct(i, 'name', e.target.value)} />
                      <div className="act-move"><button onClick={() => moveAct(i,-1)} className="link-btn">↑</button><button onClick={() => moveAct(i,1)} className="link-btn">↓</button><button onClick={() => deleteAct(i)} className="link-btn danger">Delete</button></div>
                    </div>
                    <div className="act-meta-row">
                      <input className="mini-input" placeholder="6'" value={a.duration || ''} onChange={(e) => updateAct(i,'duration',e.target.value)} />
                      <input className="audio-input" placeholder="Track #1" value={a.audio || ''} onChange={(e) => updateAct(i,'audio',e.target.value)} />
                      <label className="bonus-check"><input type="checkbox" checked={!!a.is_bonus} onChange={(e) => updateAct(i,'is_bonus',e.target.checked)} /> Bonus</label>
                    </div>
                    <label className="notes-label">Teaching notes</label>
                    <textarea className="notes-editor" value={a.notes || ''} onChange={(e) => updateAct(i,'notes',e.target.value)} placeholder="Short, telegraphic notes. Teacher speech is shown in bold." />
                    {a.notes && <div className="notes-preview">{renderNotes(a.notes)}</div>}
                    <input className="materials-input" placeholder="Materials" value={a.materials || ''} onChange={(e) => updateAct(i,'materials',e.target.value)} />
                  </div>
                ))}
              </div>
            )}

            {mode === 'live' && (
              <div className="live-stage no-print">
                <div className="live-banner">
                  <span>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <strong>{currentAct ? `▶ ${currentAct.name}` : '⏳ Waiting for lesson time'}</strong>
                  <span>{currentAct ? `⏱ ${fmtCountdown(remainingSecs)}` : ''}</span>
                </div>
                <div className="live-tools"><div className="field compact"><label>Start time</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div><button className="btn secondary" onClick={() => window.print()}>🖨️ Print audit notes</button></div>

                {(dayGuide?.materials || dayGuide?.bonus_materials) && <div className="ready-note"><div className="ready-title">🎒 Get Ready for the Class</div>{dayGuide.materials && <pre className="ready-list">{dayGuide.materials}</pre>}{dayGuide.bonus_materials && <><div className="ready-subtitle">Bonus</div><pre className="ready-list">{dayGuide.bonus_materials}</pre></>}</div>}

                {timedActs.map((a, i) => {
                  const isCurrent = i === currentActIdx;
                  const style = isCurrent ? { '--progress': `${currentProgress}%` } : undefined;
                  return <div key={i} className={isCurrent ? 'live-card current progress-card' : 'live-card'} style={style}>
                    <div className="live-card-top"><span>{a.startClock} – {a.endClock} · {a.duration}</span>{isCurrent && <span className="live-timer">⏱ {fmtCountdown(remainingSecs)}</span>}</div>
                    <div className="live-card-name">{isCurrent ? '▶ ' : ''}{a.name}</div>
                    <AudioBadges audioText={a.audio} songsMap={songsMap} big={isCurrent} />
                    {a.materials && <div className="live-materials">🎒 {a.materials}</div>}
                    <div className="live-notes">{renderNotes(a.notes || a.desc)}</div>
                  </div>;
                })}
                {bonusActs.length > 0 && <div className="bonus-area"><h3>🎁 Bonus activities</h3>{bonusActs.map((a,i) => <div key={i} className="live-card bonus"><div className="live-card-name">{a.name}</div><AudioBadges audioText={a.audio} songsMap={songsMap} />{a.materials && <div className="live-materials">🎒 {a.materials}</div>}<div className="live-notes">{renderNotes(a.notes || a.desc)}</div></div>)}</div>}
              </div>
            )}
          </>
        )}
      </div>

      <section className="print-sheet print-only">
        <header className="print-header">
          <div><div className="print-kicker">Lesson notes · 2026/27</div><h1>{corsoName} · Story {storyNumber} · Day {dayNumber}</h1></div>
          <div className="print-time">Start {startTime}</div>
        </header>
        {(dayGuide?.materials || dayGuide?.bonus_materials) && <div className="print-ready"><strong>Get ready</strong>{dayGuide.materials && <pre>{dayGuide.materials}</pre>}{dayGuide.bonus_materials && <><strong>Bonus materials</strong><pre>{dayGuide.bonus_materials}</pre></>}</div>}
        <div className="print-plan">
          {printActivities.map((a, i) => <article className="print-activity" key={i}><div className="print-clock"><strong>{a.startClock}</strong><span>{a.endClock}</span></div><div className="print-body"><div className="print-act-title"><span>{i+1}. {a.name}</span><small>{a.duration}</small></div>{a.audio && <div className="print-audio">🎵 {a.audio}</div>}{a.materials && <div className="print-materials">Materials: {a.materials}</div>}<div className="print-notes">{renderNotes(a.noteText || a.desc)}</div></div></article>)}
          {bonusActs.length > 0 && <div className="print-bonus"><h2>Bonus activities</h2>{bonusActs.map((a,i) => <article className="print-activity" key={i}><div className="print-clock">BONUS</div><div className="print-body"><div className="print-act-title"><span>{a.name}</span></div>{a.materials && <div className="print-materials">Materials: {a.materials}</div>}<div className="print-notes">{renderNotes(a.notes || a.desc)}</div></div></article>)}</div>}
        </div>
      </section>
    </Layout>
  );
}
