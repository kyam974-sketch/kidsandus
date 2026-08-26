import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const COURSES = [
{ id: 'mousy', name: 'Mousy' },
{ id: 'linda', name: 'Linda' },
{ id: 'sam', name: 'Sam' },
{ id: 'emma', name: 'Emma' },
{ id: 'oliver', name: 'Oliver' },
{ id: 'marcia', name: 'Marcia' },
{ id: 'pam', name: 'Pam & Paul' },
{ id: 'ben', name: 'Ben & Brenda' },
];

function emptyActivity() {
return { name: 'New activity', duration: '5\'', audio: '', desc: '', notes: '', materials: '', is_bonus: false };
}

function renderDesc(desc) {
if (!desc) return null;
const parts = String(desc).split('**');
return parts.map((part, i) =>
i % 2 === 1 ? (
<strong key={i} style={{ background: '#fff3cd', padding: '0 3px', borderRadius: 3 }}>
{part}
</strong>
) : (
<span key={i}>{part}</span>
)
);
}

function parseAudioNumbers(audioText) {
if (!audioText) return [];
const matches = [...String(audioText).matchAll(/#(\d+)/g)];
return matches.map((m) => parseInt(m[1], 10));
}

function AudioBadges({ audioText, songsMap, big }) {
const nums = parseAudioNumbers(audioText);
if (!audioText) return null;
if (nums.length === 0) {
return (
<div className="audio-badge" style={{ fontSize: big ? 15 : 12 }}>
🎵 {audioText}
</div>
);
}
return (
<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, alignItems: 'center' }}>
{nums.map((n) => {
const song = songsMap[n];
return (
<div key={n} className="audio-badge" style={{ fontSize: big ? 15 : 12 }}>
<span>
🎵 TR#{n}
{song ? ` ${song.title}` : ''}
</span>
{song?.audio_url ? (
<audio controls src={song.audio_url} style={{ height: 26, verticalAlign: 'middle' }} preload="none" />
) : (
<span style={{ fontWeight: 400, fontStyle: 'italic' }}>(no audio yet)</span>
)}
</div>
);
})}
</div>
);
}

export default function Planner() {
const [courseId, setCourseId] = useState('sam');
const [storyNumber, setStoryNumber] = useState(1);
const [dayNumber, setDayNumber] = useState(1);
const [activities, setActivities] = useState([]);
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [mode, setMode] = useState('edit'); // 'edit' | 'live' | 'light'

const [generating, setGenerating] = useState(false);
const [generateError, setGenerateError] = useState('');
const [generatingNotes, setGeneratingNotes] = useState(false);

const [songsMap, setSongsMap] = useState({});
const [dayGuide, setDayGuide] = useState(null); // { materials, bonus_materials } from Teacher Guide

const [startTime, setStartTime] = useState('16:00');
const [now, setNow] = useState(new Date());
useEffect(() => {
if (mode !== 'live' && mode !== 'light') return;
const t = setInterval(() => setNow(new Date()), 1000);
return () => clearInterval(t);
}, [mode]);

const [manualIdx, setManualIdx] = useState(null);

const key = `${courseId}|Story ${storyNumber}|${dayNumber}`;
const corsoName = COURSES.find((c) => c.id === courseId)?.name;

async function loadActivities() {
setLoading(true);
const { data } = await supabase.from('lessons').select('data').eq('key', key).maybeSingle();
setActivities(Array.isArray(data?.data) ? data.data : []);
setManualIdx(null);
setLoading(false);
}

async function loadSongs() {
const { data } = await supabase.from('songs').select('track_number, title, audio_url').eq('corso', corsoName);
const map = {};
(data || []).forEach((s) => {
map[s.track_number] = s;
});
setSongsMap(map);
}

async function loadDayGuide() {
const { data } = await supabase
.from('guide_days')
.select('materials, bonus_materials')
.eq('corso', corsoName)
.eq('story_number', storyNumber)
.eq('day_number', dayNumber)
.maybeSingle();
setDayGuide(data || null);
}

useEffect(() => {
loadActivities();
loadSongs();
loadDayGuide();
}, [courseId, storyNumber, dayNumber]);

async function saveActivities(next) {
setActivities(next);
setSaving(true);
await supabase.from('lessons').upsert({ key, data: next }, { onConflict: 'key' });
setSaving(false);
}

function updateAct(idx, field, value) {
const next = activities.slice();
next[idx] = { ...next[idx], [field]: value };
saveActivities(next);
}

function addActivity() {
saveActivities([...activities, emptyActivity()]);
}

function deleteAct(idx) {
const next = activities.slice();
next.splice(idx, 1);
saveActivities(next);
}

function moveAct(idx, dir) {
const next = activities.slice();
const target = idx + dir;
if (target < 0 || target >= next.length) return;
[next[idx], next[target]] = [next[target], next[idx]];
saveActivities(next);
}

async function handleGenerate() {
setGenerateError('');
setGenerating(true);
try {
const [{ data: day }, { data: story }] = await Promise.all([
supabase
.from('guide_days')
.select('*')
.eq('corso', corsoName)
.eq('story_number', storyNumber)
.eq('day_number', dayNumber)
.maybeSingle(),
supabase.from('guide_stories').select('*').eq('corso', corsoName).eq('story_number', storyNumber).maybeSingle(),
]);

if (!day && !story) {
setGenerateError('No Teacher Guide content found for this course/story/day yet. Add it in Teacher Guides first.');
setGenerating(false);
return;
}

const contextParts = [];
if (story?.warmup_routines) contextParts.push('WARM-UP ROUTINES:\n' + story.warmup_routines);
if (story?.songs) contextParts.push('STORY SONGS:\n' + story.songs);
if (story?.choosing_rhyme) contextParts.push('CHOOSING RHYME:\n' + story.choosing_rhyme);
if (day?.lesson_goals) contextParts.push('LESSON GOALS:\n' + day.lesson_goals);
if (day?.preparation) contextParts.push('PREPARATION:\n' + day.preparation);
if (day?.materials) contextParts.push('MATERIALS LIST (from guide):\n' + day.materials);
if (day?.bonus_materials) contextParts.push('BONUS MATERIALS (from guide):\n' + day.bonus_materials);
if (day?.lesson_plan) contextParts.push('LESSON PLAN (source text):\n' + day.lesson_plan);

const prompt = `Convert this Kids&Us Teacher Guide content for ${corsoName}, Story ${storyNumber}, Day ${dayNumber} into a structured lesson activity list.

${contextParts.join('\n\n')}

The LESSON PLAN source text is organised as a series of NUMBERED top-level steps, each with its own duration in parentheses right after the step name (e.g. "1.– WELCOME THE CHILDREN (5')", "2.– WARM-UP ROUTINES (12') (TR#1)", "3.– STORY: ... (7')", "4.– ACTIVITY 1: ... (7')"). Each numbered step becomes EXACTLY ONE activity in the output, using that step's own duration — never split a numbered step into several activities, and never leave an activity with an empty or zero duration. If a step (such as "WARM-UP ROUTINES") lists several bulleted sub-items, keep it as ONE activity whose desc briefly covers all of those sub-items using the exact quoted phrases from the Warm-up Routines / Story context above — do not create a separate activity per bullet. The BONUS ACTIVITIES at the end of the source each become one activity with "is_bonus": true.

Turn this into a JSON array of activities, one per numbered step as described above, each as:
{"name": "...", "duration": "6'", "audio": "Track #1" (or empty string, or multiple like "Track #1, Track #2"), "desc": "...", "materials": "comma, separated, list", "is_bonus": false}

For "desc": write a single flowing narrative description of how to run the activity, in English, embedding the exact key phrases the teacher should say directly in the text using **double asterisks**. Use the exact quoted phrases from the source lesson plan text — do not invent or paraphrase them.

Respond with ONLY the JSON array, no markdown, no other text.`;

const resp = await fetch('/api/generate', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
});
const data = await resp.json();
const text = (data.content || []).map((b) => b.text || '').join('');
const clean = text.replace(/```json|```/g, '').trim();
const parsed = JSON.parse(clean);
if (!Array.isArray(parsed)) throw new Error('Unexpected response format');

if (activities.length > 0) {
if (!window.confirm(`Replace the ${activities.length} existing activities with ${parsed.length} generated ones?`)) {
setGenerating(false);
return;
}
}
await saveActivities(parsed);
} catch (e) {
setGenerateError('Generation error: ' + e.message);
}
setGenerating(false);
}

async function handleGenerateNotes() {
if (activities.length === 0) return;
setGenerateError('');
setGeneratingNotes(true);
try {
const listText = activities.map((a, i) => `${i}. [${a.name}]\n${a.desc || ''}`).join('\n\n');

const prompt = `Here is a list of Kids&Us lesson activities with their full teacher-guide descriptions.

${listText}

For EACH activity (same order, same index), write a condensed "teacher's own notes" version — the kind of shorthand a teacher jots down to glance at while running the class, NOT full sentences. Style rules:
- Telegraphic, imperative, drop filler words (articles, "you can", "then", "now", connecting phrases).
- Example: "take out the cake from the box" becomes "take out cake". "Call the register" becomes "register". "You can either use a toy birthday cake with three candles on it or the A3 Birthday Cake card (S.1.1.1) and Candle cutouts" becomes "use cake or cutouts".
- Keep the exact key phrases the teacher says aloud to the children, still wrapped in **double asterisks** exactly as in the source — do not shorten or reword what's inside ** **, only shorten the narration around them.
- Use short dashes or line breaks between steps within the same activity if there are multiple beats, but keep it brief — a few lines at most.
- Do not lose any of the quoted spoken phrases.

Respond with ONLY a JSON array of strings, one per activity, in the same order, no markdown, no other text.`;

const resp = await fetch('/api/generate', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
});
const data = await resp.json();
const text = (data.content || []).map((b) => b.text || '').join('');
const clean = text.replace(/```json|```/g, '').trim();
const parsed = JSON.parse(clean);
if (!Array.isArray(parsed)) throw new Error('Unexpected response format');

const next = activities.map((a, i) => ({ ...a, notes: parsed[i] || a.notes || '' }));
await saveActivities(next);
} catch (e) {
setGenerateError('Notes generation error: ' + e.message);
}
setGeneratingNotes(false);
}

function handlePrint() {
window.print();
}

const normalActs = activities.filter((a) => !a.is_bonus);
const bonusActs = activities.filter((a) => a.is_bonus);

function parseDuration(d) {
const n = parseInt(String(d).replace(/[^\d]/g, ''), 10);
return isNaN(n) ? 0 : n;
}

const [sh, sm] = startTime.split(':').map(Number);
let cumulative = 0;
const timedActs = normalActs.map((a) => {
const startMin = sh * 60 + sm + cumulative;
const dur = parseDuration(a.duration);
cumulative += dur;
const endMin = sh * 60 + sm + cumulative;
const fmt = (mins) => `${String(Math.floor((mins / 60) % 24)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
return { ...a, startClock: fmt(startMin), endClock: fmt(endMin) };
});

const nowMin = now.getHours() * 60 + now.getMinutes();
let currentActIdx = timedActs.findIndex((a) => {
const [eh, em] = a.endClock.split(':').map(Number);
return nowMin < eh * 60 + em;
});
if (currentActIdx === -1 && timedActs.length > 0) currentActIdx = timedActs.length - 1;

const displayIdx = manualIdx !== null ? manualIdx : currentActIdx;
const displayAct = timedActs[displayIdx];

return (
<Layout>
<div className="page-eyebrow no-print">Active module</div>
<h1 className="page-title no-print">Planner</h1>
<p className="page-desc no-print">Build and run your lesson plans, activity by activity.</p>

{mode === 'light' ? (
<div className="light-stage">
<div style={{ fontSize: 12, opacity: 0.6, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2 }}>
{displayIdx + 1} / {timedActs.length}
</div>
<div style={{ fontSize: 46, fontWeight: 800, marginBottom: 20 }}>{displayAct?.name || '—'}</div>
{(displayAct?.notes || displayAct?.desc) && (
<div className="sticky-note light-note">{renderDesc(displayAct.notes || displayAct.desc)}</div>
)}
<AudioBadges audioText={displayAct?.audio} songsMap={songsMap} big />
{displayAct?.materials && <div style={{ fontSize: 15, color: '#ffe08a', marginTop: 12 }}>{displayAct.materials}</div>}
<div style={{ display: 'flex', gap: 20, marginTop: 44 }}>
<button className="btn secondary" style={{ color: '#fff', borderColor: '#666' }} onClick={() => setManualIdx(Math.max(0, displayIdx - 1))}>
◀
</button>
<button className="btn" onClick={() => setMode('live')}>
Exit Light
</button>
<button className="btn secondary" style={{ color: '#fff', borderColor: '#666' }} onClick={() => setManualIdx(Math.min(timedActs.length - 1, displayIdx + 1))}>
▶
</button>
</div>
</div>
) : (
<>
<div className="section-block no-print">
<div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
<div className="field" style={{ maxWidth: 200, marginBottom: 0 }}>
<label>Course</label>
<select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
{COURSES.map((c) => (
<option key={c.id} value={c.id}>
{c.name}
</option>
))}
</select>
</div>
<div className="field" style={{ maxWidth: 120, marginBottom: 0 }}>
<label>Story</label>
<select value={storyNumber} onChange={(e) => setStoryNumber(Number(e.target.value))}>
{[1, 2, 3, 4, 5, 6].map((n) => (
<option key={n} value={n}>
Story {n}
</option>
))}
</select>
</div>
<div className="field" style={{ maxWidth: 100, marginBottom: 0 }}>
<label>Day</label>
<input type="number" min="1" value={dayNumber} onChange={(e) => setDayNumber(Number(e.target.value) || 1)} />
</div>
<div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
<button type="button" className={mode === 'edit' ? 'btn' : 'btn secondary'} onClick={() => setMode('edit')}>
Edit
</button>
<button type="button" className={mode === 'live' ? 'btn' : 'btn secondary'} onClick={() => setMode('live')}>
Live
</button>
<button type="button" className="btn secondary" onClick={() => setMode('light')}>
Light
</button>
</div>
</div>
{saving && <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8, marginBottom: 0 }}>Saving…</p>}
</div>

{mode === 'edit' && (
<div className="section-block no-print">
<div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
<button type="button" className="btn" disabled={generating} onClick={handleGenerate}>
{generating ? 'Generating…' : '✨ Generate from Teacher Guide'}
</button>
<button type="button" className="btn secondary" disabled={generatingNotes || activities.length === 0} onClick={handleGenerateNotes}>
{generatingNotes ? 'Condensing…' : '📝 Generate short notes'}
</button>
<button type="button" className="btn secondary" onClick={addActivity}>
+ Add activity
</button>
</div>
{generateError && <div className="error-text">{generateError}</div>}
<p className="page-desc" style={{ fontSize: 12, marginBottom: 20 }}>
Uses the Course Info, Story routines/songs, and Day content already saved in Teacher Guides for this
course/story/day. The short notes are what you'll actually see in Live/Light — the full text below stays
here for reference and for regenerating notes, but never shows during class.
</p>

{loading ? (
<p className="page-desc">Loading…</p>
) : activities.length === 0 ? (
<p className="page-desc">No activities yet for {key}.</p>
) : (
activities.map((a, i) => (
<div key={i} className={a.is_bonus ? 'act-edit-card bonus' : 'act-edit-card'}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
<input
value={a.name || ''}
onChange={(e) => updateAct(i, 'name', e.target.value)}
style={{ fontSize: 16, fontWeight: 700, border: 'none', background: 'transparent', flex: 1, fontFamily: 'inherit' }}
/>
<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
<button type="button" onClick={() => moveAct(i, -1)} className="link-btn">↑</button>
<button type="button" onClick={() => moveAct(i, 1)} className="link-btn">↓</button>
<button type="button" onClick={() => deleteAct(i)} className="link-btn danger">Delete</button>
</div>
</div>

<div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
<input
placeholder="Duration (e.g. 6')"
value={a.duration || ''}
onChange={(e) => updateAct(i, 'duration', e.target.value)}
style={{ width: 90, fontSize: 12, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6 }}
/>
<input
placeholder="Audio (e.g. Track #1)"
value={a.audio || ''}
onChange={(e) => updateAct(i, 'audio', e.target.value)}
style={{ width: 160, fontSize: 12, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6, background: '#FFF9C4' }}
/>
<label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
<input type="checkbox" checked={!!a.is_bonus} onChange={(e) => updateAct(i, 'is_bonus', e.target.checked)} />
Bonus
</label>
</div>

<label style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 700, marginTop: 10, display: 'block' }}>
Full text (Teacher Guide source)
</label>
<textarea
value={a.desc || ''}
onChange={(e) => updateAct(i, 'desc', e.target.value)}
style={{ width: '100%', marginTop: 4, fontSize: 12.5, minHeight: 60, fontFamily: 'inherit', color: 'var(--ink-soft)' }}
/>

<label style={{ fontSize: 11, color: 'var(--sage)', fontWeight: 700, marginTop: 10, display: 'block' }}>
📝 Short notes — this is what shows in class
</label>
<textarea
value={a.notes || ''}
onChange={(e) => updateAct(i, 'notes', e.target.value)}
placeholder="Generate with the button above, or write your own shorthand…"
style={{ width: '100%', marginTop: 4, fontSize: 14, minHeight: 60, fontFamily: 'var(--notes-font)', background: '#FFF9C4' }}
/>

<input
placeholder="Materials (comma separated)"
value={a.materials || ''}
onChange={(e) => updateAct(i, 'materials', e.target.value)}
style={{ width: '100%', marginTop: 8, fontSize: 12, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--sage)', fontWeight: 600 }}
/>
</div>
))
)}
</div>
)}

{mode === 'live' && (
<div className="section-block live-stage">
<div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }} className="no-print">
<div className="field" style={{ maxWidth: 140, marginBottom: 0 }}>
<label>Start time</label>
<input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
</div>
<button type="button" className="btn secondary" onClick={handlePrint}>
🖨️ Print
</button>
</div>

{(dayGuide?.materials || dayGuide?.bonus_materials) && (
<div className="sticky-note ready-note">
<div className="ready-title">🎒 Get Ready for the Class</div>
{dayGuide.materials && <pre className="ready-list">{dayGuide.materials}</pre>}
{dayGuide.bonus_materials && (
<>
<div className="ready-subtitle">Bonus (if extra time)</div>
<pre className="ready-list">{dayGuide.bonus_materials}</pre>
</>
)}
</div>
)}

{timedActs.map((a, i) => {
const isCurrent = i === currentActIdx;
let remaining = '';
if (isCurrent) {
const [eh, em] = a.endClock.split(':').map(Number);
const endSecs = eh * 3600 + em * 60;
const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
const remSecs = Math.max(0, endSecs - nowSecs);
remaining = `${Math.floor(remSecs / 60)}:${String(remSecs % 60).padStart(2, '0')}`;
}
const bodyText = a.notes || a.desc;
return (
<div key={i} className={isCurrent ? 'live-card current' : 'live-card'}>
<div className="live-card-top">
<span>
{a.startClock} – {a.endClock} · {a.duration}
</span>
{isCurrent && <span className="live-timer">⏱ {remaining}</span>}
</div>
<div className="live-card-name">
{isCurrent ? '▶ ' : ''}
{a.name}
</div>
<AudioBadges audioText={a.audio} songsMap={songsMap} big={isCurrent} />
{a.materials && <div className="live-materials">{a.materials}</div>}
<div className="live-notes">{renderDesc(bodyText)}</div>
</div>
);
})}

{bonusActs.length > 0 && (
<div style={{ marginTop: 24 }}>
<h3 style={{ fontSize: 16, marginBottom: 10 }}>🎁 Bonus activities</h3>
{bonusActs.map((a, i) => (
<div key={i} className="live-card bonus">
<div className="live-card-name" style={{ fontSize: 18 }}>{a.name}</div>
<AudioBadges audioText={a.audio} songsMap={songsMap} />
{a.materials && <div className="live-materials">{a.materials}</div>}
<div className="live-notes">{renderDesc(a.notes || a.desc)}</div>
</div>
))}
</div>
)}
</div>
)}
</>
)}
</Layout>
);
}
