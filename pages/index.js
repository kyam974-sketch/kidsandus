import Layout from '../components/Layout';

const MODULES = [
  { href: '/followup', tag: 'live', live: true, title: 'Follow-up', desc: 'Lesson notes by group, history by student.' },
  { href: '/songs', tag: 'live', live: true, title: 'Songs', desc: 'Lyrics and audio for songs, by course.' },
  { href: '/guides', tag: 'live', live: true, title: 'Teacher Guides', desc: 'Course methodology, story routines, and daily lesson plans.' },
  { href: '/planner', tag: 'live', live: true, title: 'Planner', desc: 'Build and run lesson plans, generated from your Teacher Guides.' },
  { href: '#', tag: 'soon', live: false, title: 'Term Reports', desc: 'Term report cards, linked to the follow-up history.' },
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
