const normalized = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function findStudentProfile(name, students) {
  const key = normalized(name);
  const matches = students.filter((student) => [
    [student.first_name, student.last_name].filter(Boolean).join(' '),
    student.preferred_name,
    student.legacy_full_name,
  ].some((candidate) => candidate && normalized(candidate) === key));
  return matches.length === 1 ? matches[0] : null;
}

export function studentTimeline(name, profile, sessions, date) {
  return sessions.filter((session) => session.session_date <= date).flatMap((session) => {
    const matches = (session.entries || []).filter((entry) => profile?.id && entry.student_id
      ? entry.student_id === profile.id
      : normalized(entry.name) === normalized(name) || (profile && [
        [profile.first_name, profile.last_name].filter(Boolean).join(' '), profile.legacy_full_name,
      ].some((candidate) => candidate && normalized(entry.name) === normalized(candidate))));
    return matches.length === 1 ? [{ session, entry: matches[0] }] : [];
  }).sort((a, b) => a.session.session_date.localeCompare(b.session.session_date) ||
    String(a.session.created_at || '').localeCompare(String(b.session.created_at || '')));
}

export function continuityContext(name, profile, sessions, date) {
  const timeline = studentTimeline(name, profile, sessions, date);
  const recent = new Set(timeline.slice(-8));
  const lines = timeline.map((item) => {
    const { session, entry } = item;
    const raw = entry.teacher_note?.trim();
    const group = session.group_note?.trim();
    if (!raw && !group && !recent.has(item)) return '';
    return [
      `${session.session_date} | ${session.corso || ''} | ${session.story || ''}`,
      raw && `Teacher individual evidence: ${raw}`,
      group && `Teacher group evidence (use ONLY facts explicitly about this child): ${group}`,
      recent.has(item) && `Ratings: motivation=${entry.motivation || 'unassessed'}, learning=${entry.learning || 'unassessed'}, behaviour=${entry.behaviour || 'unassessed'}, My Way=${entry.my_way || 'unassessed'}`,
      recent.has(item) && entry.note && `Previous generated judgment (secondary evidence; may contain unsupported claims): ${entry.note}`,
    ].filter(Boolean).join('\n');
  }).filter(Boolean);
  return `Student profile notes: ${profile?.notes?.trim() || '(none)'}\nDated history, oldest to newest:\n${lines.join('\n\n') || '(no earlier saved follow-up)'}`;
}
