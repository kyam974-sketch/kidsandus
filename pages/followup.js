import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import ResponsiveTable from '../components/ResponsiveTable';
import { findStudentProfile, continuityContext } from '../lib/studentContinuity';
import { supabase } from '../lib/supabaseClient';
import { EMOJI_SCALE, RATING_LABELS, hasMyWay, ratingFieldsForCourse, ratingSummary } from '../lib/followupRatings';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

const SEDI = ['Grosseto', 'Esterna'];
const CORSI = ['Mousy', 'Linda', 'Sam', 'Emma', 'Oliver', 'Marcia', 'Pam & Paul', 'Ben & Brenda'];
const CORSO_IDS = {
  Mousy: 'mousy',
  Linda: 'linda',
  Sam: 'sam',
  Emma: 'emma',
  Oliver: 'oliver',
  Marcia: 'marcia',
  'Pam & Paul': 'pam',
  'Ben & Brenda': 'ben',
};
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

function emptyEntry(course) {
  return { teacher_note: '', note: '', ...Object.fromEntries(ratingFieldsForCourse(course).map((field) => [field, null])) };
}

function activityLabel(activity) {
  const bits = [activity?.name || 'Activity'];
  if (activity?.materials) bits.push(`materials: ${activity.materials}`);
  return bits.join(' · ');
}

function operationalCue(activity, maxLength = 260) {
  const raw = String(activity?.notes || activity?.desc || '').trim();
  if (!raw) return '';
  const compact = raw
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length <= maxLength) return compact;
  const clipped = compact.slice(0, maxLength - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.7 ? clipped.slice(0, lastSpace) : clipped).trim()}…`;
}

function activityContext(activities) {
  return (activities || []).map((activity, index) => {
    const details = String(activity?.notes || activity?.desc || '').trim();
    const materials = String(activity?.materials || '').trim();
    const audio = String(activity?.audio || '').trim();
    return [
      `${index + 1}. ${activity?.name || 'Activity'}`,
      materials ? `Materials/props: ${materials}` : '',
      audio ? `Audio: ${audio}` : '',
      details ? `What the class did: ${details}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
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
  const [studentProfiles, setStudentProfiles] = useState([]);
  const [continuityError, setContinuityError] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [showAddSuggestions, setShowAddSuggestions] = useState(false);
  const [newGroup, setNewGroup] = useState({ sede: 'Grosseto', corso: '', giorno: '', orario: '', anno_scolastico: CURRENT_YEAR });
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupCreateError, setGroupCreateError] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [yearFilter, setYearFilter] = useState(CURRENT_YEAR);

  const [guideDay, setGuideDay] = useState(null);
  const [lessonActivities, setLessonActivities] = useState([]);
  const [lessonContextLoading, setLessonContextLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedStudent, setCopiedStudent] = useState('');
  const [copiedHistory, setCopiedHistory] = useState('');
  const [historyCopyError, setHistoryCopyError] = useState('');

  const availableYears = Array.from(new Set(groups.map((g) => g.anno_scolastico).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  if (!availableYears.includes(CURRENT_YEAR)) availableYears.unshift(CURRENT_YEAR);
  const groupsForYear = groups.filter((g) => g.anno_scolastico === yearFilter);
  const selectedGroup = groups.find((g) => g.id === form.group_id) || null;
  const ratingFields = ratingFieldsForCourse(selectedGroup?.corso);
  const showMyWay = hasMyWay(selectedGroup?.corso);
  const groupStudents = selectedGroup && Array.isArray(selectedGroup.students) ? selectedGroup.students : [];

  const studentList = Array.from(new Set(groups.flatMap((g) => (Array.isArray(g.students) ? g.students : [])))).sort((a, b) => a.localeCompare(b, 'it'));
  const addSuggestions = newStudentName.trim()
    ? studentList.filter((n) => n.toLowerCase().includes(newStudentName.trim().toLowerCase()) && n !== newStudentName).slice(0, 6)
    : [];
  const searchSuggestions = studentQuery.trim()
    ? studentList.filter((n) => n.toLowerCase().includes(studentQuery.trim().toLowerCase()) && n !== studentQuery).slice(0, 6)
    : [];
  const studentHistory = selectedStudent
    ? allSessions.filter((s) => (s.entries || []).some((en) => en.name && en.name.toLowerCase() === selectedStudent.toLowerCase())).sort((a, b) => new Date(b.session_date) - new Date(a.session_date) || new Date(b.created_at || 0) - new Date(a.created_at || 0))
    : [];

  const hasExactLessonActivities = lessonActivities.length > 0;
  const hasFallbackLessonPlan = !!guideDay?.lesson_plan?.trim();
  const hasLessonContext = hasExactLessonActivities || hasFallbackLessonPlan;

  async function loadData() {
    setLoading(true);
    setContinuityError('');
    const [{ data: g }, { data: s }, historyResult, profileResult] = await Promise.all([
      supabase.from('group_students').select('*').order('sede'),
      supabase.from('followup_sessions').select('*').order('created_at', { ascending: false }).limit(15),
      supabase.from('followup_sessions').select('*').order('session_date', { ascending: false }).order('id').range(0, 999),
      supabase.from('students').select('*'),
    ]);
    const all = historyResult.data || [];
    let historyError = historyResult.error;
    if (!historyError) {
      for (let offset = 1000; all.length === offset; offset += 1000) {
        const page = await supabase.from('followup_sessions').select('*').order('session_date', { ascending: false }).order('id').range(offset, offset + 999);
        if (page.error) { historyError = page.error; break; }
        all.push(...(page.data || []));
      }
    }
    if (historyError || profileResult.error) setContinuityError('Non riesco a caricare lo storico o le schede studenti. Ricarica prima di generare il giudizio.');
    setStudentProfiles(profileResult.data || []);
    setGroups(g || []);
    setSessions(s || []);
    setAllSessions(all || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setPresentStudents(groupStudents); setEntries({}); }, [form.group_id]);

  useEffect(() => {
    async function loadLessonContext() {
      if (!selectedGroup?.corso || !form.story || !form.day) {
        setGuideDay(null);
        setLessonActivities([]);
        return;
      }

      setLessonContextLoading(true);
      const courseId = CORSO_IDS[selectedGroup.corso];
      const lessonKey = courseId ? `${courseId}|Story ${Number(form.story)}|${Number(form.day)}` : null;

      const [guideResult, lessonResult] = await Promise.all([
        supabase
          .from('guide_days')
          .select('lesson_plan, preparation, materials')
          .eq('corso', selectedGroup.corso)
          .eq('story_number', Number(form.story))
          .eq('day_number', Number(form.day))
          .maybeSingle(),
        lessonKey
          ? supabase.from('lessons').select('data').eq('key', lessonKey).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      setGuideDay(guideResult.error ? null : (guideResult.data || null));
      const rawActivities = Array.isArray(lessonResult?.data?.data) ? lessonResult.data.data : [];
      setLessonActivities(rawActivities.filter((activity) => activity?.included !== false && !activity?.is_bonus));
      setLessonContextLoading(false);
    }

    loadLessonContext();
  }, [selectedGroup?.corso, form.story, form.day]);

  function rememberedPronouns(name) {
    const key = name.trim().toLowerCase();
    const latest = [...allSessions].sort((a, b) => new Date(b.created_at || b.session_date) - new Date(a.created_at || a.session_date));
    for (const session of latest) {
      const previous = (session.entries || []).find((entry) => entry.name?.trim().toLowerCase() === key);
      if (previous && typeof previous.pronouns === 'string') return previous.pronouns;
    }
    return '';
  }
  function getEntry(name) {
    const profile = findStudentProfile(name, studentProfiles);
    const pronouns = { male: 'he/him', female: 'she/her', neutral: 'they/them' }[profile?.gender];
    return { ...emptyEntry(selectedGroup?.corso), ...entries[name],
      student_id: profile?.id || null,
      pronouns: pronouns || (profile ? '' : rememberedPronouns(name)),
    };
  }
  function setEntryPatch(name, patch) { setEntries((prev) => ({ ...prev, [name]: { ...(prev[name] || emptyEntry(selectedGroup?.corso)), ...patch } })); }
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
      if (!entry) return;
      lines.push(`${fmtDate(session.session_date)} — ${session.corso || ''} ${session.giorno || ''}`.trim());
      lines.push(ratingSummary(entry, session.corso));
      if (entry.note) lines.push(entry.note);
      lines.push('');
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

  async function copyHistoryNote(sessionId, note) {
    setHistoryCopyError('');
    try {
      await navigator.clipboard.writeText(note);
      setCopiedHistory(sessionId);
      setTimeout(() => setCopiedHistory((current) => current === sessionId ? '' : current), 2000);
    } catch {
      setHistoryCopyError('Non riesco a copiare la nota. Seleziona il testo e copialo manualmente.');
    }
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
    const exactActivities = hasExactLessonActivities ? activityContext(lessonActivities) : '';
    const fallbackLessonPlan = !hasExactLessonActivities ? (guideDay?.lesson_plan || '') : '';
    const groupObservation = form.group_note.trim() || '(none)';

    const studentEvidence = presentStudents.map((name) => {
      const e = getEntry(name);
      const ratings = ratingFields.map((field) => {
        const selected = EMOJI_SCALE.find((x) => x.value === e[field]);
        return `${RATING_LABELS[field]}: ${selected ? `${selected.label} (${selected.value}/5)` : 'not selected'}`;
      }).join('; ');
      const profile = findStudentProfile(name, studentProfiles);
      return `${name}\nPronouns from student profile: ${e.pronouns || 'use the gender indicated by teacher language or an unambiguous familiar given name; if unclear avoid pronouns, not singular they'}\n${ratings}\nTeacher individual observation TODAY: ${e.teacher_note?.trim() || '(none)'}\nPERSONAL CONTINUITY — context before/current date ${form.session_date}\n${continuityContext(name, profile, allSessions, form.session_date)}`;
    }).join('\n\n');

    return `You are assisting a Kids&Us teacher in Italy with INTERNAL follow-up judgments that will later support term reports.

COURSE DEVELOPMENTAL CONTEXT
${corsoContext}

EXACT LESSON — Story ${form.story}, Day ${form.day}
${hasExactLessonActivities ? `These are the CORE activities actually loaded in the Planner for this exact lesson. Treat them as the primary lesson context:\n${exactActivities}` : `Planner activities were not available. Use this exact Teacher Guide Day plan as the fallback lesson context:\n${fallbackLessonPlan}`}

TEACHER GROUP OBSERVATION
${groupObservation}

INDIVIDUAL TEACHER EVIDENCE
${studentEvidence}

TASK
For EACH student present, write a concise individualized judgment in natural, idiomatic British English, suitable as an internal follow-up note and useful later for a term report. Cover EACH assessed dimension separately, in this order: Motivation & Participation, Learning, Behaviour${showMyWay ? ', My Way' : ''}. Aim for around 60-100 words overall, usually 3-5 flowing sentences, with enough detail to make the note useful when revisiting the lesson. This is a flexible guide, not a word quota: do not pad sparse evidence. Each dimension field should contain a complete, grammatical sentence that flows naturally into the next; do not omit the subject of a verb or attach a clause to the wrong subject. Concise means focused, not reduced to rating labels. Brevity must never remove an assessed dimension. Return separate text fields so no criterion is lost; the application will join them into a natural paragraph.

STRICT RULES
- Read this child's dated personal history and profile notes before writing. The note is about TODAY, informed by that child's evolving baseline, not an isolated snapshot or a term report.
- Explicit teacher observations are primary evidence. Previous generated judgments are secondary and may contain invented claims: NEVER use them to establish speaking ability, mastered vocabulary, counting or other concrete achievements unsupported by raw teacher evidence. Lesson plans describe opportunities, not proof that the child performed them.
- Preserve explicit developmental facts (for example not speaking yet, including in the home language) until a later teacher observation changes them. High Learning ratings do NOT imply speech. For a child not yet speaking, describe receptive understanding, engagement or non-verbal participation only when supported; never invent repetition, spoken answers, singing words or verbal counting.
- Read changes chronologically: "first word today" updates "not speaking yet"; "starting to say words" is emerging speech, not fluent speech. Never let older information override the newest explicit evidence.
- Interpret "better", "more manageable", "still" or "again" against documented earlier teacher observations. Explain a supported change gently (for example more settled than in previous lessons), without labelling a child "unmanageable" or inventing earlier incidents. If no baseline exists, mention today's observation without inventing a comparison.
- Context can change: use historical behaviour as a dated baseline, not a permanent trait. Do not diagnose, compare with classmates or repeat every old difficulty. Mention only history relevant to today's note.
- Ground the judgment in what was concretely done in THIS exact lesson, not in generic lesson goals.
- Use the operational notes under each activity to understand what the children actually had to do, say, choose, count, point to, mime, move, answer or manipulate during the lesson.
- Prefer concrete references to the day's real activities, games, materials, props or sensory experiences (for example flowers, sand, bubbles, cards, story, songs, building blocks, etc.) when those elements are actually present in the lesson context above.
- When natural, include at least one concrete lesson element in each judgment so the note says what the child worked or played with that day rather than only describing broad skills.
- Do NOT use bonus/optional activities as if they happened unless the teacher observation explicitly says they were done. Planner context above contains core activities only.
- Every selected rating MUST have corresponding descriptive text. Motivation & Participation describes engagement and willingness to participate; Learning describes understanding and progress; Behaviour describes conduct, attention to rules and interactions. These are distinct dimensions: do not combine them into a generic positive or negative conclusion.
- Ratings calibrate the strength of the judgment; they are NOT wording to copy. Describe engagement, response to the learning opportunities and conduct in plain classroom language instead of writing "motivation was excellent", "learning was good" or "behaviour was very good". Keep the five levels distinct without inventing a problem merely because a rating is below Excellent.
- When only ratings and the lesson plan are available, describe the assessed overall engagement and response in the context of the activities actually taught, with modest wording. Do not invent specific answers, mistakes, independent task completion, mastery, turn-taking or reminders. Richer language must come from the real lesson context, not fabricated events.
- Refer to a concrete lesson activity naturally, without repeating the whole lesson plan or forcing an activity into every sentence. Learning text must describe the child’s assessed response to the language work, not merely say that the activities supported learning. Avoid vague filler such as "a good overall response"; use plain descriptions calibrated to the rating, without claiming specific mastery.
${showMyWay ? '- My Way is a separate teacher-selected assessment of home platform use, based on audio listening and Mission progress. It is NOT classroom participation, learning performance or behaviour. Always write a separate My Way sentence when its rating is selected, expressing the assessed level of home platform use without claiming specific listening frequency or Mission completion. Mention it only if selected or explicitly supported by an individual teacher observation. Never infer listening counts, completed games or missed Missions from an emoji. Missions are optional; do not penalize their absence or invent a numeric grading threshold.' : ''}
- Use each student's individual teacher observation when present.
- Use observations in the group note that explicitly name this student as individual evidence, including a change during the lesson (for example initial tears followed by settling). General group observations remain context only: do NOT attribute an event involving another child to this student.
- Do not invent incidents, answers, vocabulary produced, behaviours, achievements or difficulties that the teacher did not report or that are not supported by the selected ratings.
- A concrete activity may be named because it was part of the lesson, but do not claim that the child mastered specific vocabulary or structures merely because the activity was present.
- If a rating is not selected and no individual observation supports that dimension, return an empty string for its field. Do not invent a missing assessment. Integrate every relevant individual observation into the appropriate assessment field, translated and naturally rewritten in English. Never append the raw teacher annotation or repeat its content as a separate final sentence.
- Keep developmental expectations appropriate to the course profile, especially for Mousy and Linda.
- Do not mention numeric ratings, emojis, the AI, the prompt, or lack of evidence in the final judgment.
- Write the separate fields as consecutive sentences of ONE fluent paragraph, not as standalone mini-reports. Use the child’s name ONCE ONLY, at the beginning of the motivation sentence (or the first non-empty field). Never repeat the name in any later field, including observation.
- Preserve the student’s gender: use he/him/his or she/her as indicated by the selected pronouns, teacher wording or an unambiguous familiar given name (for example Liam/Lorenzo: he; Alice: she). Use singular they/them ONLY if the teacher explicitly selects or requests neutral pronouns. If gender is genuinely unclear, use grammatical constructions without personal pronouns rather than defaulting to they. Avoid a checklist of labels followed by good/excellent.
- Use simple, idiomatic classroom English. Avoid literal translations, inflated praise, bureaucratic phrases, repetitive sentence openings and repeating the same idea across criteria. Vary the phrasing naturally while preserving the selected rating levels.
- This English note is internal evidence only. Term Reports are generated separately in Italian.
- Tone: professional, natural, concise, factual, not inflated.

STYLE EXAMPLES — invented examples illustrating tone and detail, NEVER evidence about the current students:
1. Alex is a boy. Lesson context: room/action Memory and charades. Ratings: high participation, very good learning, satisfactory behaviour. Teacher observation: interrupts and chats during group activities.
"Alex joined the room-and-action Memory and charades with enthusiasm, bringing plenty of energy to the lesson. His overall response to the language practised through these games was secure. Interrupting and chatting during group activities sometimes got in the way of listening, so that enthusiasm needs to be channelled more constructively."
2. Robin is a girl. Lesson context: calendar routine, Number cards and pair work with afternoon-activity stickers. All classroom ratings high; My Way very good; no individual incidents reported.
"Robin approached the calendar routine, Number-card activities and paired work with the afternoon-activity stickers with enthusiasm. She engaged confidently with the language work practised across these activities. A positive, cooperative approach helped keep participation constructive, while engagement with My Way outside class was also very positive."
Use this degree of detail, not these exact sentences or facts. Do not add a recommendation to every note; include one only when a reported difficulty makes it useful.

Return ONLY valid JSON exactly in this form:
{"Student Name":{"motivation":"descriptive English text","learning":"descriptive English text","behaviour":"descriptive English text"${showMyWay ? ',"my_way":"descriptive English text"' : ''}}}`;
  }

  async function handleGenerate() {
    setGenerateError('');
    if (loading || continuityError) { setGenerateError(continuityError || 'Sto caricando lo storico e le schede studenti.'); return; }
    if (!presentStudents.length) { setGenerateError('Segna almeno un allievo come presente.'); return; }
    if (!selectedGroup) { setGenerateError('Seleziona prima il gruppo.'); return; }
    if (lessonContextLoading) { setGenerateError('Sto ancora caricando le attività della lezione.'); return; }
    if (!hasLessonContext) { setGenerateError(`Non trovo le attività per ${selectedGroup.corso}, Story ${form.story}, Day ${form.day}.`); return; }

    const withoutEvidence = presentStudents.filter((name) => {
      const e = getEntry(name);
      return !e.teacher_note?.trim() && !ratingFields.some((field) => e[field]);
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
      const judgments = presentStudents.map((name) => {
        const judgment = parsed[name];
        if (!judgment || typeof judgment !== 'object' || Array.isArray(judgment)) {
          throw new Error(`Risposta incompleta per ${name}. Riprova la generazione.`);
        }
        const entry = getEntry(name);
        const parts = ratingFields.map((field) => {
          const text = typeof judgment[field] === 'string' ? judgment[field].trim() : '';
          if (entry[field] && !text) throw new Error(`Manca ${RATING_LABELS[field]} per ${name}. Riprova la generazione.`);
          return text;
        }).filter(Boolean);
        if (!parts.length) throw new Error(`Giudizio vuoto per ${name}. Riprova la generazione.`);
        return { name, note: parts.join(' ') };
      });
      judgments.forEach(({ name, note }) => setEntryPatch(name, { note }));
    } catch (e) {
      setGenerateError('Generation error: ' + e.message);
    }
    setGenerating(false);
  }

  return (
    <Layout>
      <div className="page-eyebrow">Active module</div>
      <h1 className="page-title">Follow-up</h1>
      <p className="page-desc">Record teacher evidence, then generate individual judgments grounded in the concrete activities of the exact Story and Day.</p>

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

          <div className="followup-lesson-fields">
            <div className="field"><label>Date</label><input type="date" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} /></div>
            <div className="field"><label>Story</label><select value={form.story} onChange={(e) => setForm({ ...form, story: Number(e.target.value) })}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>Story {n}</option>)}</select></div>
            <div className="field"><label>Day</label><input type="number" min="1" value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) || 1 })} /></div>
          </div>

          {selectedGroup && (
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 10, background: hasLessonContext ? '#eef8f0' : '#fff5e8', fontSize: 13.5 }}>
              {lessonContextLoading
                ? 'Loading exact lesson activities…'
                : hasExactLessonActivities
                  ? `✓ Exact lesson activities loaded: ${selectedGroup.corso} · Story ${form.story} · Day ${form.day}`
                  : hasFallbackLessonPlan
                    ? `✓ Teacher Guide Day plan loaded as fallback: ${selectedGroup.corso} · Story ${form.story} · Day ${form.day}`
                    : `Lesson activities not found for ${selectedGroup.corso} · Story ${form.story} · Day ${form.day}`}
              {hasExactLessonActivities && (
                <div style={{ marginTop: 8, color: 'var(--ink-soft)' }}>
                  <strong>What was done:</strong>
                  <div style={{ marginTop: 7, display: 'grid', gap: 7 }}>
                    {lessonActivities.map((activity, index) => {
                      const cue = operationalCue(activity);
                      return (
                        <div key={`${activity?.name || 'activity'}-${index}`} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '7px 10px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{activityLabel(activity)}</div>
                          {cue && <div style={{ marginTop: 3, lineHeight: 1.35 }}><strong>How:</strong> {cue}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
                <div className="input-action-row">
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
              {showMyWay && <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: '0 0 12px' }}>My Way: assess audio listening and Mission progress in the Teacher’s Dashboard. Aim for daily audio (7/week); 4 Mission activities/week are recommended and optional. Choose the emoji manually.</p>}
              {presentStudents.map((name) => {
                const entry = getEntry(name);
                return <div key={name} className="assessment-card" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 10, background: '#fff' }}>
                  <div className="assessment-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <strong>{name}</strong>
                    <button type="button" className="btn secondary" style={{ padding: '6px 10px', fontSize: 12.5 }} onClick={() => copyStudentForClassroom(name)}>{copiedStudent === name ? 'Copied ✓' : '📋 Copy judgment'}</button>
                  </div>
                  {ratingFields.map((field) => <div key={field} className="rating-row" role="group" aria-label={`${name} — ${RATING_LABELS[field]}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}><span style={{ fontSize: 14, color: 'var(--ink-soft)', width: 140, flexShrink: 0 }}>{RATING_LABELS[field]}</span><div className="rating-options">{EMOJI_SCALE.map((es) => <button key={es.value} type="button" title={es.label} aria-label={`${RATING_LABELS[field]}: ${es.label}`} aria-pressed={entry[field] === es.value} onClick={() => setEntryPatch(name, { [field]: entry[field] === es.value ? null : es.value })} style={{ border: entry[field] === es.value ? '2px solid var(--coral)' : '1px solid var(--line)', borderRadius: 8, background: '#fff', padding: '2px 6px', fontSize: 18 }}>{es.emoji}</button>)}</div></div>)}
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
                <p className="page-desc" style={{ margin: '0 0 10px', fontSize: 13 }}>Uses the student profile and dated follow-up history, together with today's ratings, teacher observations and exact lesson activities. The judgment can therefore refer to what children actually had to do in the exact Story/Day, rather than relying on generic lesson goals.</p>
                <button type="button" className="btn" disabled={generating || !hasLessonContext} onClick={handleGenerate} style={{ width: '100%' }}>{generating ? 'Generating judgments…' : 'Generate individual judgments'}</button>
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
        {historyCopyError && <p className="error-text" role="alert">{historyCopyError}</p>}
        {selectedStudent && <><div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><strong>{selectedStudent}</strong><button className="btn secondary" onClick={copyHistory} type="button">{copied ? 'Copied ✓' : 'Copy all for Term Reports'}</button></div>{studentHistory.length === 0 ? <p>No follow-up found.</p> : <div className="student-history" role="list" aria-label="Student history">{studentHistory.map((s) => {
              const entry = (s.entries || []).find((en) => en.name && en.name.toLowerCase() === selectedStudent.toLowerCase());
              return <article className="history-entry" role="listitem" key={s.id}>
                <header className="history-entry-header">
                  <time dateTime={s.session_date}>{fmtDate(s.session_date)}</time>
                  <span>{s.corso} · {s.giorno}</span>
                  <button className="btn secondary history-copy" type="button" disabled={!entry?.note?.trim()} onClick={() => copyHistoryNote(s.id, entry.note)} aria-label={`Copia nota del ${fmtDate(s.session_date)}`}>{copiedHistory === s.id ? 'Copiata ✓' : 'Copia nota'}</button>
                </header>
                <div className="history-entry-body">
                  <dl className="history-assessments" aria-label="Assessments">{ratingFieldsForCourse(s.corso).map((field) => {
                    const rating = EMOJI_SCALE.find((item) => item.value === entry?.[field]);
                    return <div key={field}><dt>{RATING_LABELS[field]}:</dt><dd><span aria-label={rating?.label || 'Not assessed'}>{rating?.emoji || '—'}</span></dd></div>;
                  })}</dl>
                  <div className="history-note"><strong>Note</strong><p>{entry?.note || '—'}</p></div>
                </div>
              </article>;
            })}</div>}</>}
      </div>

      <div className="section-block">
        <h2>Your groups</h2>
        {loading ? <p>Loading…</p> : <ResponsiveTable label="Your groups"><thead><tr><th>Location</th><th>Course</th><th>Day</th><th>Time</th><th>Year</th><th>Students</th><th></th></tr></thead><tbody>{groups.map((g) => <tr key={g.id}><td>{g.sede}</td><td>{g.corso}</td><td>{g.giorno}</td><td>{g.orario || '—'}</td><td>{g.anno_scolastico}</td><td>{Array.isArray(g.students) ? g.students.length : 0}</td><td><button type="button" onClick={() => handleDeleteGroup(g)} className="link-btn danger">Delete</button></td></tr>)}</tbody></ResponsiveTable>}
      </div>

      <div className="section-block">
        <h2>Recent follow-ups</h2>
        {loading ? <p>Loading…</p> : sessions.length === 0 ? <p>No follow-up registered yet.</p> : <ResponsiveTable label="Recent follow-ups"><thead><tr><th>Date</th><th>Group</th><th>Story/Day</th><th>Students assessed</th><th></th></tr></thead><tbody>{sessions.map((s) => <tr key={s.id}><td>{fmtDate(s.session_date)}</td><td>{s.group_name}</td><td>{s.story || '—'}</td><td>{Array.isArray(s.entries) ? s.entries.length : 0}</td><td><button type="button" onClick={() => handleDeleteSession(s)} className="link-btn danger">Delete</button></td></tr>)}</tbody></ResponsiveTable>}
      </div>
    </Layout>
  );
}
