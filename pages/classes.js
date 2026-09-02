import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import styles from '../styles/Roster.module.css';

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const EMPTY = {
  name: '',
  course: '',
  weekday: 1,
  start_time: '16:00',
  duration_minutes: 60,
  location: 'Grosseto',
  school_year: '2026-2027',
};

function displayStudent(student) {
  return student.preferred_name?.trim() || [student.first_name, student.last_name].filter(Boolean).join(' ');
}

function timeShort(value) {
  return value ? String(value).slice(0, 5) : '';
}

export default function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [addingStudent, setAddingStudent] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData() {
    setLoading(true);
    const [{ data: c, error: ce }, { data: s }, { data: m }, { data: cr }] = await Promise.all([
      supabase.from('classes').select('*').eq('active', true).order('weekday').order('start_time'),
      supabase.from('students').select('*').eq('active', true).order('last_name').order('first_name'),
      supabase.from('class_students').select('*').eq('active', true),
      supabase.from('course_registry').select('id,label,expected_minutes,active').eq('active', true).order('label'),
    ]);
    if (ce) setError(ce.message);
    setClasses(c || []);
    setStudents(s || []);
    setMemberships(m || []);
    setCourses(cr || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const courseMap = useMemo(() => Object.fromEntries(courses.map((c) => [c.label, c])), [courses]);

  function rosterFor(classId) {
    const ids = memberships.filter((m) => m.class_id === classId).map((m) => m.student_id);
    return students.filter((s) => ids.includes(s.id));
  }

  function availableFor(classId) {
    const assigned = new Set(memberships.filter((m) => m.class_id === classId).map((m) => m.student_id));
    return students.filter((s) => !assigned.has(s.id));
  }

  function setCourse(course) {
    const duration = courseMap[course]?.expected_minutes || 60;
    setForm((f) => ({ ...f, course, duration_minutes: duration }));
  }

  async function createClass(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!form.course) { setError('Scegli un corso.'); return; }
    if (!form.start_time) { setError('Inserisci l’orario.'); return; }
    const day = DAYS.find((d) => d.value === Number(form.weekday))?.label || '';
    const generatedName = `${form.course} · ${day} ${timeShort(form.start_time)}`;
    const payload = {
      name: form.name.trim() || generatedName,
      course: form.course,
      weekday: Number(form.weekday),
      start_time: form.start_time,
      duration_minutes: Number(form.duration_minutes),
      location: form.location.trim() || 'Grosseto',
      school_year: form.school_year.trim() || '2026-2027',
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
    setForm(EMPTY);
    setNotice('Classe creata. Ora puoi assegnare gli studenti.');
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

  async function archiveClass(item) {
    if (!window.confirm(`Archiviare la classe ${item.name}?`)) return;
    const { error: updateError } = await supabase.from('classes').update({ active: false }).eq('id', item.id);
    if (updateError) { setError(updateError.message); return; }
    await loadData();
  }

  return (
    <Layout>
      <div className="page-eyebrow">Roster · Schedule base</div>
      <h1 className="page-title">Classes</h1>
      <p className="page-desc">Crea le classi reali e assegna gli studenti. Questi slot saranno la base del Calendar e della futura sincronizzazione Outlook.</p>

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
            <select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>
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
            <label>Sede</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label>Anno scolastico</label>
            <input value={form.school_year} onChange={(e) => setForm({ ...form, school_year: e.target.value })} />
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
            return (
              <section key={item.id} className={styles.classCard}>
                <div className={styles.classTop}>
                  <div>
                    <div className={styles.classTitle}>{item.name}</div>
                    <div className={styles.badges}><span className={styles.badgeCourse}>{item.course}</span><span className={styles.badge}>{item.school_year}</span></div>
                  </div>
                  <button className={styles.danger} onClick={() => archiveClass(item)}>Archivia</button>
                </div>
                <div className={styles.schedule}>{day} · {timeShort(item.start_time)} · {item.duration_minutes} min · {item.location}</div>

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
                      <select value={addingStudent[item.id] || ''} onChange={(e) => setAddingStudent((prev) => ({ ...prev, [item.id]: e.target.value }))}>
                        <option value="">Aggiungi studente…</option>
                        {available.map((student) => <option key={student.id} value={student.id}>{displayStudent(student)}</option>)}
                      </select>
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
