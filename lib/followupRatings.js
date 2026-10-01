export const EMOJI_SCALE = [
  { value: 1, emoji: '😟', label: 'Poor' },
  { value: 2, emoji: '😐', label: 'Satisfactory' },
  { value: 3, emoji: '🙂', label: 'Good' },
  { value: 4, emoji: '😊', label: 'Very good' },
  { value: 5, emoji: '😄', label: 'Excellent' },
];

export const RATING_LABELS = {
  motivation: 'Motivation & Participation',
  learning: 'Learning',
  behaviour: 'Behaviour',
  my_way: 'My Way',
};

const CLASSROOM_FIELDS = ['motivation', 'learning', 'behaviour'];
const MY_WAY_COURSES = new Set(['pam&paul', 'ben&brenda']);

export function hasMyWay(course) {
  return MY_WAY_COURSES.has(String(course || '').toLowerCase().replace(/\s+/g, ''));
}

export function ratingFieldsForCourse(course) {
  return hasMyWay(course) ? [...CLASSROOM_FIELDS, 'my_way'] : CLASSROOM_FIELDS;
}

export function ratingSummary(entry, course, useEmoji = false) {
  return ratingFieldsForCourse(course).map((field) => {
    const rating = EMOJI_SCALE.find((item) => item.value === entry?.[field]);
    const value = rating ? (useEmoji ? rating.emoji : `${rating.label} (${rating.value}/5)`) : '—';
    return `${RATING_LABELS[field]}: ${value}`;
  }).join(' · ');
}
