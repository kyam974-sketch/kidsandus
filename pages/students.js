import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import styles from '../styles/Roster.module.css';

const EMPTY = { first_name: '', last_name: '', preferred_name: '', birth_date: '', notes: '' };

function displayName(student) {
  return student.preferred_name?.trim() || [student.first_name, student.last_name].filter(Boolean).join(' ');
}

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');

  async function loadData() {
    setLoading(true);
    const [{ data: s, error: se }, { data: c }, { data: m }] = await Promise.all([
      supabase.from('students').select('*').order('last_name').order('first_name'),
      supabase.from('classes').select('id,name,course,active').order('name'),
      supabase.from('class_students').select('student_id,class_id,active').eq('active', true),
    ]);
    if (se) setError(se.message);
    setStudents(s || []);
    setClasses(c || []);
    setMemberships(m || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (!showArchived && !s.active) return false;
      if (!q) return true;
      return `${s.first_name} ${s.last_name} ${s.preferred_name || ''}`.toLowerCase().includes(q);
    });
  }, [students, showArchived, query]);

  function classNamesFor(studentId) {
    const ids = memberships.filter((m) => m.student_id === studentId).map((m) => m.class_id);
    return classes.filter((c) => ids.includes(c.id) && c.active);
  }

  function beginEdit(student) {
    setEditingId(student.id);
    setForm({
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      preferred_name: student.preferred_name || '',
      birth_date: student.birth_date || '',
      notes: student.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setError('');
  }

  async function saveStudent(e) {
    e.preventDefault();
    setError('');
    if (!form.first_name.trim()) { setError('Inserisci almeno il nome.'); return; }
    setSaving(true);
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      preferred_name: form.preferred_name.trim() || null,
      birth_date: form.birth_date || null,
      notes: form.notes.trim(),
      active: true,
    };
    const result = editingId
      ? await supabase.from('students').update(payload).eq('id', editingId)
      : await supabase.from('students').insert(payload);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    cancelEdit();
    await loadData();
  }

  async function toggleArchive(student) {
    const next = !student.active;
    const verb = next ? 'riattivare' : 'archiviare';
    if (!window.confirm(`Vuoi ${verb} ${displayName(student)}?`)) return;
    const { error: updateError } = await supabase.from('students').update({ active: next }).eq('id', student.id);
    if (updateError) { setError(updateError.message); return; }
    await loadData();
  }

  return (
    <Layout>
      <div className="page-eyebrow">Roster</div>
      <h1 className="page-title">Students</h1>
      <p className="page-desc">Anagrafica unica degli studenti. Le classi useranno questi profili, senza duplicare i nomi.</p>

      <section className={styles.panel}>
        <h2>{editingId ? 'Modifica studente' : 'Aggiungi studente'}</h2>
        {error && <div className={styles.error}>{error}</div>}
        <form onSubmit={saveStudent} className={styles.formGrid}>
          <div className={styles.field}>
            <label>Nome *</label>
            <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label>Cognome</label>
            <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label>Nome usato in classe</label>
            <input placeholder="Solo se diverso" value={form.preferred_name} onChange={(e) => setForm({ ...form, preferred_name: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label>Data di nascita</label>
            <input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          </div>
          <div className={`${styles.field} ${styles.full}`}>
            <label>Note interne</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className={`${styles.actions} ${styles.full}`}>
            <button className={styles.primary} disabled={saving}>{saving ? 'Salvataggio…' : editingId ? 'Salva modifiche' : 'Aggiungi studente'}</button>
            {editingId && <button type="button" className={styles.secondary} onClick={cancelEdit}>Annulla</button>}
          </div>
        </form>
      </section>

      <div className={styles.toolbar}>
        <input
          aria-label="Cerca studente"
          placeholder="Cerca studente…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', minWidth: 230, fontSize: 15 }}
        />
        <button className={styles.secondary} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Nascondi archiviati' : 'Mostra archiviati'}
        </button>
        <span className={styles.count}>{filtered.length} studenti</span>
      </div>

      {loading ? <div className={styles.empty}>Caricamento…</div> : filtered.length === 0 ? (
        <div className={styles.empty}>Nessuno studente ancora. Aggiungi il primo qui sopra.</div>
      ) : (
        <div className={styles.list}>
          {filtered.map((student) => {
            const assigned = classNamesFor(student.id);
            return (
              <div key={student.id} className={styles.row} style={{ opacity: student.active ? 1 : .55 }}>
                <div>
                  <div className={styles.name}>{displayName(student)}</div>
                  {(student.preferred_name || student.birth_date) && (
                    <div className={styles.meta}>
                      {student.preferred_name ? `${student.first_name} ${student.last_name}`.trim() : ''}
                      {student.preferred_name && student.birth_date ? ' · ' : ''}
                      {student.birth_date || ''}
                    </div>
                  )}
                  {student.notes && <div className={styles.muted}>{student.notes}</div>}
                </div>
                <div>
                  <div className={styles.meta}>Classi</div>
                  <div className={styles.badges}>
                    {assigned.length ? assigned.map((c) => <span key={c.id} className={styles.badge}>{c.name}</span>) : <span className={styles.muted}>Non assegnato</span>}
                  </div>
                </div>
                <div className={styles.actions}>
                  <button className={styles.secondary} onClick={() => beginEdit(student)}>Modifica</button>
                  <button className={student.active ? styles.danger : styles.secondary} onClick={() => toggleArchive(student)}>
                    {student.active ? 'Archivia' : 'Riattiva'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
