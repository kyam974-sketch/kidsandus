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
  { href: '/special-lessons', label: '🧩 Special Lessons', sub: 'builder', live: true },
  { href: '/term-reports', label: '📊 Term Reports', sub: 'linked', live: true },
];

export default function Layout({ children }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isAppleMobile, setIsAppleMobile] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
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

  useEffect(() => {
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    setIsAppleMobile(apple);
    setIsStandalone(!!standalone);

    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice.catch(() => null);
      setInstallPrompt(null);
      return;
    }
    if (isAppleMobile) {
      window.alert('Su iPad: apri kidsandus.vercel.app in Safari → Condividi → Aggiungi alla schermata Home → attiva “Apri come app web” → Aggiungi.');
    }
  }

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
        {!isStandalone && (installPrompt || isAppleMobile) && (
          <button
            className="rail-logout"
            onClick={installApp}
            style={{ background: '#edf3ff', borderColor: '#d7e2fa', color: '#315aa8', fontWeight: 700 }}
          >
            {installPrompt ? '⬇️ Install app' : '📲 Add to Home'}
          </button>
        )}
        <button className="rail-logout" onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}>Log out</button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
