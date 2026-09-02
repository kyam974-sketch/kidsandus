import Layout from '../components/Layout';

const MODULES = [
  { href: '/students', tag: 'live', live: true, title: 'Students', desc: 'Single student roster, ready to assign to classes.' },
  { href: '/classes', tag: 'live', live: true, title: 'Classes', desc: 'Weekly class slots and student rosters.' },
  { href: '/calendar', tag: 'prototype', live: true, title: 'Calendar', desc: 'Teaching schedule today; Outlook integration comes next.' },
  { href: '/followup', tag: 'live', live: true, title: 'Follow-up', desc: 'Lesson notes by group, history by student.' },
  { href: '/songs', tag: 'live', live: true, title: 'Songs', desc: 'Lyrics and audio for songs, by course.' },
  { href: '/guides', tag: 'live', live: true, title: 'Teacher Guides', desc: 'Course methodology, story routines, and daily lesson plans.' },
  { href: '/planner', tag: 'live', live: true, title: 'Planner', desc: 'Build and run lesson plans, generated from your Teacher Guides.' },
  { href: '/special-lessons', tag: 'builder', live: true, title: 'Special Lessons', desc: 'Build demo, recovery and other non-standard lessons.' },
  { href: '/term-reports', tag: 'linked', live: true, title: 'Term Reports', desc: 'Term report cards, linked to follow-up history.' },
];

export default function Dashboard() {
  return (
    <Layout>
      <div className="page-eyebrow">Kids&amp;Us · Grosseto</div>
      <h1 className="page-title">Good morning, Chiara</h1>
      <p className="page-desc">All of the year's work in one place.</p>
      <div className="module-grid">
        {MODULES.map((m) => (
          <a key={m.title} href={m.href} className={`module-card ${m.live ? 'live' : 'soon'}`} onClick={(e) => !m.live && e.preventDefault()}>
            <span className={`module-tag ${m.live ? 'live' : 'soon'}`}>{m.tag}</span>
            <h3>{m.title}</h3>
            <p>{m.desc}</p>
          </a>
        ))}
      </div>
    </Layout>
  );
}
