import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import {
  SCHOOL_YEAR,
  NURSERY_SESSIONS_PER_STORY,
  NURSERY_STORIES,
  isNurseryCourse,
  nurseryPlanFromStart,
  officialCourseStartForWeekday,
  officialPlanForWeekday,
} from '../lib/schoolCalendar';
import styles from '../styles/Roster.module.css';

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const COURSE_ORDER = ['mousy', 'mousy_nursery', 'linda', 'linda_nursery', 'sam', 'emma', 'oliver', 'marcia', 'pam', 'ben'];

function makeEmptyForm(weekday = 1) {
  return {
    name: '',
    course: '',
    weekday,
    start_time: '16:00',
    duration_minutes: 60,
    start_date: officialCourseStartForWeekday(weekday),
    location: 'Grosseto',
    school_year: SCHOOL_YEAR,
  };
}

function makeEditForm(item) {
  const weekday = Number(item.weekday) || 1;
  return {
    id: item.id,
    name: item.name || '',
    course: item.course || '',
    weekday,
    start_time: String(item.start_time || '').slice(0, 5),
    duration_minutes: Number(item.duration_minutes) || 60,
    start_date: item.start_date || officialCourseStartForWeekday(weekday),
    location: item.location || 'Grosseto',
  };
}

function displayStudent(student) {
  return student.preferred_name?.trim() || [student.first_name, student.last_name].filter(Boolean).join(' ');
}

function sortStudents(items) {
  return items.slice().sort((a, b) => displayStudent(a).localeCompare(displayStudent(b), 'it', { sensitivity: 'base' }));
}

function timeShort(value) {
  return value ? String(value).slice(0, 5) : '';
}

function dateShort(value) {
  if (!value) return '';
  return new Date(`${value}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function nurseryPlan(weekday, startDate) {
  const dates = nurseryPlanFromStart(weekday, startDate);
  return Array.from({ length: NURSERY_STORIES }, (_, index) => {
    const storyDates = dates.slice(index * NURSERY_SESSIONS_PER_STORY, (index + 1) * NURSERY_SESSIONS_PER_STORY);
    return {
      story: index + 1,
      sessions: NURSERY_SESSIONS_PER_STORY,
      start: storyDates[0] || null,
      end: storyDates[storyDates.length - 1] || null,
    };
  });
}

export default function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(() => makeEmptyForm());
  const [editing, setEditing] = useState(null);
  const [addingStudent, setAddingStudent] = useState({});
  const [studentSearch, setStudentSearch] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData() {
    setLoading(true);
    const [{ data: c, error: ce }, { data: s }, { data: m }, { data: cr }] = await Promise.all([
      supabase.from('classes').select('*').eq('active', true).order('weekday').order('start_time'),
      supabase.from('students').select('*').eq('active', true),
      supabase.from('class_students').select('*').eq('active', true),
      supabase.from('course_registry').select('id,label,expected_minutes,active').eq('active', true),
    ]);
    if (ce) setError(ce.message);
    setClasses(c || []);
    setStudents(sortStudents(s || []));
    setMemberships(m || []);
    setCourses((cr || []).slice().sort((a, b) => {
      const ai = COURSE_ORDER.indexOf(a.id);
      const bi = COURSE_ORDER.indexOf(b.id);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    }));
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const courseMap = useMemo(() => Object.fromEntries(courses.map((c) => [c.label, c])), [courses]);
  const formIsNursery = isNurseryCourse(form.course);
  const selectedPlan = useMemo(
    () => formIsNursery ? nurseryPlan(form.weekday, form.start_date) : officialPlanForWeekday(form.weekday),
    [formIsNursery, form.weekday, form.start_date]
  );

  function rosterFor(classId) {
    const ids = memberships.filter((m) => m.class_id === classId).map((m) => m.student_id);
    return sortStudents(students.filter((s) => ids.includes(s.id)));
  }

  function availableFor(classId) {
    const assigned = new Set(memberships.filter((m) => m.class_id === classId).map((m) => m.student_id));
    return sortStudents(students.filter((s) => !assigned.has(s.id)));
  }

  function filteredAvailableFor(classId) {
    const query = (studentSearch[classId] || '').trim().toLocaleLowerCase('it');
    const available = availableFor(classId);
    if (!query) return available;
    return available.filter((student) => displayStudent(student).toLocaleLowerCase('it').includes(query));
  }

  function setCourse(course) {
    const duration = courseMap[course]?.expected_minutes || 60;
    setForm((f) => ({ ...f, course, duration_minutes: duration }));
  }

  function setWeekday(weekday) {
    const value = Number(weekday);
    setForm((f) => ({
      ...f,
      weekday: value,
      start_date: isNurseryCourse(f.course) ? f.start_date : officialCourseStartForWeekday(value),
    }));
  }

  function startEdit(item) {
    setError('');
    setNotice('');
    setEditing(makeEditForm(item));
  }

  function setEditingCourse(course) {
    const duration = courseMap[course]?.expected_minutes || editing?.duration_minutes || 60;
    setEditing((current) => ({
      ...current,
      course,
      duration_minutes: duration,
      start_date: isNurseryCourse(course) ? current.start_date : officialCourseStartForWeekday(current.weekday),
    }));
  }

  function setEditingWeekday(weekday) {
    const value = Number(weekday);
    setEditing((current) => ({
      ...current,
      weekday: value,
      start_date: isNurseryCourse(current.course) ? current.start_date : officialCourseStartForWeekday(value),
    }));
  }

  async function createClass(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!form.course) { setError('Scegli un corso.'); return; }
    if (!form.start_time) { setError('Inserisci l’orario.'); return; }
    if (formIsNursery && !form.start_date) { setError('Inserisci la data della prima lezione Nursery.'); return; }

    const day = DAYS.find((d) => d.value === Number(form.weekday))?.label || '';
    const generatedName = `${form.course} · ${day} ${timeShort(form.start_time)}`;
    const payload = {
      name: form.name.trim() || generatedName,
      course: form.course,
      weekday: Number(form.weekday),
      start_time: form.start_time,
      duration_minutes: Number(form.duration_minutes),
      start_date: formIsNursery ? form.start_date : officialCourseStartForWeekday(form.weekday),
      location: form.location.trim() || 'Grosseto',
      school_year: SCHOOL_YEAR,
      story_number: 1,
      day_number: 1,
      schedule_mode: formIsNursery ? 'relative' : 'official',
      calendar_source: 'hub',
      active: true,
    };

    setSaving(true);
    const { error: insertError } = await supabase.from('classes').insert(payload);
    setSaving(false);
    if (insertError) {
      setError(insertError.code === '23505' ? 'Esiste già una classe attiva nello stesso slot per questo corso.' : insertError.message);
      return;
    }
    setForm(makeEmptyForm());
    setNotice(formIsNursery
      ? 'Classe Nursery creata. La prima lezione è Story 1 · Day 1; ogni Story avanza per 8 lezioni effettive, saltando le chiusure.'
      : 'Classe creata. Il planning Story/Day seguirà automaticamente il calendario Kids&Us 2026/27. Ora puoi assegnare gli studenti.');
    await loadData();
  }

  async function saveClassEdit(e) {
    e.preventDefault();
    if (!editing) return;
    setError('');
    setNotice('');
    if (!editing.course) { setError('Scegli un corso.'); return; }
    if (!editing.start_time) { setError('Inserisci l’orario.'); return; }

    const editingIsNursery = isNurseryCourse(editing.course);
    if (editingIsNursery && !editing.start_date) { setError('Inserisci la data della prima lezione Nursery.'); return; }
    const day = DAYS.find((d) => d.value === Number(editing.weekday))?.label || '';
    const generatedName = `${editing.course} · ${day} ${timeShort(editing.start_time)}`;
    const payload = {
      name: editing.name.trim() || generatedName,
      course: editing.course,
      weekday: Number(editing.weekday),
      start_time: editing.start_time,
      duration_minutes: Number(editing.duration_minutes),
      start_date: editingIsNursery ? editing.start_date : officialCourseStartForWeekday(editing.weekday),
      location: editing.location.trim() || 'Grosseto',
      school_year: SCHOOL_YEAR,
      story_number: 1,
      day_number: 1,
      schedule_mode: editingIsNursery ? 'relative' : 'official',
    };

    setSaving(true);
    const { error: updateError } = await supabase.from('classes').update(payload).eq('id', editing.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.code === '23505' ? 'Esiste già una classe attiva nello stesso slot per questo corso.' : updateError.message);
      return;
    }

    setEditing(null);
    setNotice(editingIsNursery
      ? 'Classe Nursery modificata. La progressione riparte dalla sua data effettiva e mantiene 8 lezioni per Story.'
      : 'Classe modificata. Il Calendar è stato riallineato automaticamente al giorno scelto.');
    await loadData();
  }

  async function deleteClass(item) {
    const rosterCount = rosterFor(item.id).length;
    const detail = rosterCount > 0 ? ` e le ${rosterCount} assegnazioni studenti collegate` : '';
    if (!window.confirm(`Eliminare definitivamente la classe “${item.name}”${detail}? Questa operazione non si può annullare.`)) return;

    setError('');
    setNotice('');
    const { error: deleteError } = await supabase.from('classes').delete().eq('id', item.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    if (editing?.id === item.id) setEditing(null);
    setNotice('Classe eliminata. Le assegnazioni studenti e le eventuali sessioni collegate sono state rimosse automaticamente.');
    await loadData();
  }

  async function addStudent(classId) {
    const studentId = addingStudent[classId];
    if (!studentId) return;
    setError('');
    const { error: upsertError } = await supabase.from('class_students').upsert(
      { class_id: classId, student_id: studentId, active: true, left_on: null },
      { onConflict: 'class_id,student_id' }
    );
    if (upsertError) { setError(upsertError.message); return; }
    setAddingStudent((prev) => ({ ...prev, [classId]: '' }));
    setStudentSearch((prev) => ({ ...prev, [classId]: '' }));
    await loadData();
  }

  async function removeStudent(classId, studentId) {
    const student = students.find((s) => s.id === studentId);
    if (!window.confirm(`Rimuovere ${student ? displayStudent(student) : 'questo studente'} dalla classe?`)) return;
    const { error: updateError } = await supabase
      .from('class_students')
      .update({ active: false, left_on: new Date().toISOString().slice(0, 10) })
      .eq('class_id', classId)
      .eq('student_id', studentId);
    if (updateError) { setError(updateError.message); return; }
    await loadData();
  }

  return (
    <Layout>
      <div className="page-eyebrow">Roster · Schedule base</div>
      <h1 className="page-title">Classes</h1>
      <p className="page-desc">Crea le classi reali e assegna gli studenti. Le classi standard seguono il planning Kids&Us 2026/27; le Nursery partono dalla loro prima data effettiva e fanno 8 lezioni per Story, saltando le chiusure.</p>

      <section className={styles.panel}>
        <h2>Nuova classe</h2>
        {error && <div className={styles.error}>{error}</div>}
        {notice && <div className={styles.notice}>{notice}</div>}
        <form onSubmit={createClass} className={styles.formGrid}>
          <div className={styles.field}>
            <label>Corso *</label>
            <select value={form.course} onChange={(e) => setCourse(e.target.value)}>
              <option value="">Scegli…</option>
              {courses.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Nome classe</label>
            <input placeholder="Automatico se lasci vuoto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label>Giorno *</label>
            <select value={form.weekday} onChange={(e) => setWeekday(e.target.value)}>
              {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Orario *</label>
            <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label>Durata</label>
            <input type="number" min="15" max="180" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
          </div>
          <div className={styles.field}>
            <label>{formIsNursery ? 'Prima lezione · data effettiva Nursery' : 'Prima lezione · calendario Kids&Us'}</label>
            <input
              type="date"
              value={form.start_date}
              readOnly={!formIsNursery}
              onChange={(e) => formIsNursery && setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label>Sede</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label>Anno scolastico</label>
            <input value={SCHOOL_YEAR} readOnly />
          </div>

          <div className={`${styles.full} ${styles.muted}`}>
            {formIsNursery && <div style={{ marginBottom: 6 }}><strong>Nursery:</strong> Story 1 parte dalla prima lezione scelta; ogni Story contiene esattamente {NURSERY_SESSIONS_PER_STORY} lezioni.</div>}
            {selectedPlan.map((part) => (
              <span key={part.story} style={{ display: 'inline-block', marginRight: '14px', marginBottom: '4px' }}>
                Story {part.story}: {part.sessions} lezioni{part.start ? ` · ${dateShort(part.start)} → ${dateShort(part.end)}` : ''}
              </span>
            ))}
          </div>

          <div className={`${styles.actions} ${styles.full}`}>
            <button className={styles.primary} disabled={saving}>{saving ? 'Creazione…' : 'Crea classe'}</button>
          </div>
        </form>
      </section>

      {loading ? <div className={styles.empty}>Caricamento…</div> : classes.length === 0 ? (
        <div className={styles.empty}>Nessuna classe ancora. Crea il primo slot qui sopra.</div>
      ) : (
        <div className={styles.classGrid}>
          {classes.map((item) => {
            const day = DAYS.find((d) => d.value === Number(item.weekday))?.label || '';
            const roster = rosterFor(item.id);
            const available = availableFor(item.id);
            const filteredAvailable = filteredAvailableFor(item.id);
            const isEditing = editing?.id === item.id;
            const editingIsNursery = isEditing && isNurseryCourse(editing.course);
            return (
              <section key={item.id} className={styles.classCard}>
                <div className={styles.classTop}>
                  <div>
                    <div className={styles.classTitle}>{item.name}</div>
                    <div className={styles.badges}><span className={styles.badgeCourse}>{item.course}</span><span className={styles.badge}>{item.school_year}</span></div>
                  </div>
                  <div className={styles.actions}>
                    <button className={styles.secondary} onClick={() => startEdit(item)} disabled={isEditing}>Modifica</button>
                    <button className={styles.danger} onClick={() => deleteClass(item)}>Elimina</button>
                  </div>
                </div>
                <div className={styles.schedule}>{day} · {timeShort(item.start_time)} · {item.duration_minutes} min · {item.location}{item.start_date ? ` · dal ${dateShort(item.start_date)}` : ''}</div>

                {isEditing && (
                  <form onSubmit={saveClassEdit} className={styles.editPanel}>
                    <div className={styles.editGrid}>
                      <div className={styles.field}>
                        <label>Corso *</label>
                        <select value={editing.course} onChange={(e) => setEditingCourse(e.target.value)}>
                          {courses.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label>Nome classe</label>
                        <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label>Giorno *</label>
                        <select value={editing.weekday} onChange={(e) => setEditingWeekday(e.target.value)}>
                          {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label>Orario *</label>
                        <input type="time" value={editing.start_time} onChange={(e) => setEditing({ ...editing, start_time: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label>Durata</label>
                        <input type="number" min="15" max="180" value={editing.duration_minutes} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} />
                      </div>
                      <div className={styles.field}>
                        <label>{editingIsNursery ? 'Prima lezione · data effettiva Nursery' : 'Prima lezione · calendario Kids&Us'}</label>
                        <input
                          type="date"
                          value={editing.start_date}
                          readOnly={!editingIsNursery}
                          onChange={(e) => editingIsNursery && setEditing({ ...editing, start_date: e.target.value })}
                        />
                      </div>
                      <div className={styles.field}>
                        <label>Sede</label>
                        <input value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
                      </div>
                    </div>
                    {editingIsNursery && <div className={styles.muted} style={{ marginTop: 8 }}>La data scelta è Story 1 · Day 1. La progressione avanza ogni 8 lezioni effettive e salta le chiusure.</div>}
                    <div className={styles.actions}>
                      <button className={styles.primary} disabled={saving}>{saving ? 'Salvataggio…' : 'Salva modifiche'}</button>
                      <button type="button" className={styles.secondary} onClick={() => setEditing(null)}>Annulla</button>
                    </div>
                  </form>
                )}

                <div className={styles.roster}>
                  <div className={styles.rosterHead}><span>Students</span><span className={styles.count}>{roster.length}</span></div>
                  {roster.length === 0 ? <div className={styles.muted}>Nessuno studente assegnato.</div> : roster.map((student) => (
                    <div key={student.id} className={styles.studentLine}>
                      <span>{displayStudent(student)}</span>
                      <button className={styles.smallButton} onClick={() => removeStudent(item.id, student.id)}>Rimuovi</button>
                    </div>
                  ))}

                  {available.length > 0 && (
                    <div className={styles.addRow}>
                      <div className={styles.studentPicker}>
                        <input
                          type="search"
                          placeholder="Cerca studente…"
                          value={studentSearch[item.id] || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setStudentSearch((prev) => ({ ...prev, [item.id]: value }));
                            setAddingStudent((prev) => ({ ...prev, [item.id]: '' }));
                          }}
                        />
                        <select value={addingStudent[item.id] || ''} onChange={(e) => setAddingStudent((prev) => ({ ...prev, [item.id]: e.target.value }))}>
                          <option value="">{filteredAvailable.length === 0 ? 'Nessun risultato' : 'Scegli studente…'}</option>
                          {filteredAvailable.map((student) => <option key={student.id} value={student.id}>{displayStudent(student)}</option>)}
                        </select>
                      </div>
                      <button className={styles.secondary} onClick={() => addStudent(item.id)} disabled={!addingStudent[item.id]}>Aggiungi</button>
                    </div>
                  )}
                  {students.length === 0 && <div className={styles.muted}>Prima aggiungi gli studenti nella sezione Students.</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Layout>
  );
}