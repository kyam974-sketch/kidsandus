export const SCHOOL_YEAR = '2026-2027';
export const COURSE_START = '2026-09-21';
export const COURSE_END = '2027-06-12';

// Official 2026/27 part windows reconstructed from MyClassroom planning.
// Each regular class follows its weekday inside these windows; school closures
// are removed before assigning Story/Day numbers.
export const COURSE_PARTS = [
  { story: 1, start: '2026-09-21', end: '2026-11-21' },
  { story: 2, start: '2026-11-23', end: '2027-02-06' },
  { story: 3, start: '2027-02-08', end: '2027-04-10' },
  { story: 4, start: '2027-04-12', end: '2027-06-12' },
];

// Only periods explicitly marked as School Holiday in the supplied school calendar.
// Staff meetings, parent meetings and report deadlines are not class closures.
export const SCHOOL_CLOSURES = [
  { start: '2026-12-07', end: '2026-12-08', label: 'School holiday' },
  { start: '2026-12-23', end: '2027-01-08', label: 'Christmas holiday' },
  { start: '2027-03-25', end: '2027-03-29', label: 'School holiday' },
  { start: '2027-05-01', end: '2027-05-01', label: 'School holiday' },
  { start: '2027-06-01', end: '2027-06-02', label: 'School holiday' },
];

function parseDate(value) {
  if (value instanceof Date) {
    const copy = new Date(value);
    copy.setHours(12, 0, 0, 0);
    return copy;
  }
  const text = String(value || '').slice(0, 10);
  if (!text) return null;
  const d = new Date(`${text}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isoDate(value) {
  const d = parseDate(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoWeekday(value) {
  const d = parseDate(value);
  if (!d) return null;
  return d.getDay() === 0 ? 7 : d.getDay();
}

function inRange(value, start, end) {
  const d = parseDate(value);
  const a = parseDate(start);
  const b = parseDate(end);
  return Boolean(d && a && b && d >= a && d <= b);
}

export function closureForDate(value) {
  return SCHOOL_CLOSURES.find((range) => inRange(value, range.start, range.end)) || null;
}

export function isSchoolClosure(value) {
  return Boolean(closureForDate(value));
}

export function partForDate(value) {
  return COURSE_PARTS.find((part) => inRange(value, part.start, part.end)) || null;
}

export function teachingDatesForPart(weekday, story) {
  const part = COURSE_PARTS.find((item) => item.story === Number(story));
  if (!part) return [];
  const targetWeekday = Number(weekday);
  const start = parseDate(part.start);
  const end = parseDate(part.end);
  const dates = [];
  const current = new Date(start);

  while (current <= end) {
    if (isoWeekday(current) === targetWeekday && !isSchoolClosure(current)) {
      dates.push(isoDate(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function officialCourseStartForWeekday(weekday) {
  const dates = teachingDatesForPart(Number(weekday), 1);
  return dates[0] || COURSE_START;
}

export function officialPlanForWeekday(weekday) {
  return COURSE_PARTS.map((part) => {
    const dates = teachingDatesForPart(Number(weekday), part.story);
    return {
      story: part.story,
      start: dates[0] || null,
      end: dates[dates.length - 1] || null,
      sessions: dates.length,
      dates,
    };
  });
}

export function scheduledLessonForDate(item, value) {
  const date = parseDate(value);
  if (!date || String(item?.school_year || SCHOOL_YEAR) !== SCHOOL_YEAR) return null;
  if (Number(item?.weekday) !== isoWeekday(date)) return null;
  if (isSchoolClosure(date)) return null;

  const classStart = parseDate(item?.start_date || officialCourseStartForWeekday(item?.weekday));
  if (classStart && date < classStart) return null;

  const part = partForDate(date);
  if (!part) return null;
  const dates = teachingDatesForPart(item.weekday, part.story);
  const currentIso = isoDate(date);
  const index = dates.indexOf(currentIso);
  if (index < 0) return null;

  return {
    story: part.story,
    day: index + 1,
    sessionIndex: index,
    totalSessions: dates.length,
    date: currentIso,
  };
}
