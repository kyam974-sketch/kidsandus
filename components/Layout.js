import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S'];
function todayIndex() {
  const d = new Date().getDay();
  return d === 0 ? -1 : d - 1;
}

const NAV = [
  { href: '/', label: '🏠 Dashboard', live: true },
  { href: '/calendar', label: '📅 Calendar', sub: 'prototype', live: true },
  { href: '/followup', label: '📝 Follow-up', sub: 'live', live: true },
  { href: '/songs', label: '🎵 Songs', sub: 'live', live: true },
  { href: '/guides', label: '📚 Teacher Guides', sub: 'live', live: true },
  { href: '/planner', label: '✨ Planner', sub: 'live', live: true },
  { href: '#', label: '📊 Term Reports', sub: 'soon', live: false },
];

export default function Layout({ children }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const active = todayIndex();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login');
      else setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess) router.replace('/login');
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (checking || !session) return null;

  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="rail-brand">Kids&amp;Us Hub</div>
        <div className="rail-sub">TEACHING TOOLS</div>
        <div className="day-strip">{DAYS.map((d, i) => <span key={i} className={i === active ? 'active' : ''} title={d} />)}</div>
        <nav className="rail-nav">
          {NAV.map((item) => {
            const isActive = router.pathname === item.href;
            if (!item.live) return <span key={item.label} className="rail-link disabled">{item.label}{item.sub && <small>{item.sub}</small>}</span>;
            return <a key={item.label} href={item.href} className={`rail-link${isActive ? ' active' : ''}`}>{item.label}{item.sub && <small>{item.sub}</small>}</a>;
          })}
        </nav>
        <button className="rail-logout" onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}>Log out</button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
