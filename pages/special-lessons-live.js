import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const COURSE_NAMES = {
  mousy: 'Mousy',
  linda: 'Linda',
  sam: 'Sam',
  emma: 'Emma',
  oliver: 'Oliver',
  marcia: 'Marcia',
  pam: 'Pam & Paul',
  ben: 'Ben & Brenda',
};

function parseDuration(value) {
  const n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function clockToSeconds(clock) {
  const [h, m] = String(clock).split(':').map(Number);
  return h * 3600 + m * 60;
}

function fmtCountdown(seconds) {
  const safe = Math.max(0, seconds || 0);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function renderNotes(text) {
  if (!text) return null;
  return String(text).split('**').map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="mandatory-phrase">{part}</strong> : <span key={i}>{part}</span>
  );
}

function parseAudioNumbers(audioText) {
  if (!audioText) return [];
  return [...String(audioText).matchAll(/#\s*(\d+)/g)].map((m) => parseInt(m[1], 10));
}

function AudioBadges({ audioText, songsMap, big = false }) {
  const [openLyrics, setOpenLyrics] = useState(null);

  useEffect(() => {
    setOpenLyrics(null);
  }, [audioText]);

  if (!audioText) return null;
  const nums = parseAudioNumbers(audioText);
  if (!nums.length) return <div className="audio-badge" style={{ fontSize: big ? 16 : 13 }}>🎵 {audioText}</div>;

  return (
    <div className="audio-wrap">
      {nums.map((n) => {
        const song = songsMap[n];
        const hasLyrics = !!song?.lyrics?.trim();
        const lyricsOpen = openLyrics === n && hasLyrics;
        return (
          <div key={n} className="audio-badge" style={{ fontSize: big ? 16 : 13 }}>
            <span>🎵 TR#{n}{song ? ` ${song.title}` : ''}</span>
            {song?.audio_url ? (
              <audio
                controls
                src={song.audio_url}
                preload="none"
                onPlay={() => hasLyrics && setOpenLyrics(n)}
                onEnded={() => setOpenLyrics(null)}
              />
            ) : <em>(no audio yet)</em>}
            {hasLyrics && (
              <button
                type="button"
                className="link-btn"
                onClick={() => setOpenLyrics((current) => current === n ? null : n)}
                style={{ marginLeft: 8 }}
              >
                {lyricsOpen ? 'Lyrics ▴' : 'Lyrics ▾'}
              </button>
            )}
            {lyricsOpen && (
              <div
                className="lyrics-panel"
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: big ? 18 : 14,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,.82)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.55,
                  maxHeight: big ? '38vh' : 260,
                  overflowY: 'auto',
                  fontSize: big ? 20 : 16,
                }}
              >
                {song.lyrics}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function metaFromKey(key) {
  const parts = String(key || '').split('|');
  return {
    type: parts[1] || '',
    course: parts[2] || '',
    story: parts[3] || '',
    day: parts[4] || '',
    title: (parts[5] || 'Special lesson').replace(/_/g, ' '),
  };
}

export default function SpecialLessonLive() {
  const router = useRouter();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState('16:00');
  const [now, setNow] = useState(new Date());
  const [songsMap, setSongsMap] = useState({});
  const [mode, setMode] = useState('live');
  const [manualIdx, setManualIdx] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.mode === 'light') setMode('light');
  }, [router.isReady, router.query.mode]);

  useEffect(() => {
    if (!router.isReady || !router.query.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('lessons').select('id,key,data,created_at').eq('id', router.query.id).maybeSingle();
      setLesson(data || null);
      setManualIdx(null);

      const parsed = metaFromKey(data?.key);
      const courseName = COURSE_NAMES[parsed.course];
      if (courseName) {
        const { data: songs } = await supabase.from('songs').select('track_number,title,audio_url,lyrics').eq('corso', courseName);
        const map = {};
        (songs || []).forEach((song) => { map[song.track_number] = song; });
        setSongsMap(map);
      } else {
        setSongsMap({});
      }
      setLoading(false);
    })();
  }, [router.isReady, router.query.id]);

  const meta = useMemo(() => metaFromKey(lesson?.key), [lesson]);
  const activities = Array.isArray(lesson?.data) ? lesson.data.filter((a) => a.included !== false) : [];
  const [sh, sm] = startTime.split(':').map(Number);
  let cumulative = 0;
  const timed = activities.map((a) => {
    const dur = parseDuration(a.duration);
    const start = sh * 60 + sm + cumulative;
    cumulative += dur;
    const end = sh * 60 + sm + cumulative;
    const fmt = (m) => `${String(Math.floor((m / 60) % 24)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { ...a, startClock: fmt(start), endClock: fmt(end), durationMinutes: dur };
  });

  const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const currentIndex = timed.findIndex((a) => nowSecs >= clockToSeconds(a.startClock) && nowSecs < clockToSeconds(a.endClock));
  const currentAct = currentIndex >= 0 ? timed[currentIndex] : null;
  let remainingSecs = 0;
  if (currentAct) remainingSecs = Math.max(0, clockToSeconds(currentAct.endClock) - nowSecs);

  const autoDisplayIdx = currentIndex >= 0 ? currentIndex : 0;
  const displayIdx = manualIdx !== null ? manualIdx : autoDisplayIdx;
  const displayAct = timed[displayIdx];
  const displayIsCurrent = currentIndex >= 0 && displayIdx === currentIndex;
  const secondsUntilDisplay = displayAct ? Math.max(0, clockToSeconds(displayAct.startClock) - nowSecs) : 0;
  const lightCountdown = displayIsCurrent ? remainingSecs : secondsUntilDisplay;
  const lightCountdownLabel = displayIsCurrent ? 'remaining' : (secondsUntilDisplay > 0 ? 'starts in' : 'finished');

  if (mode === 'light' && !loading && lesson) {
    return (
      <Layout>
        <div className="light-stage">
          <div style={{ position: 'absolute', top: 24, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, fontSize: 18, fontWeight: 800 }}>
            <span>🕒 {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span>{displayAct ? `${displayAct.startClock} – ${displayAct.endClock}` : '—'}</span>
            <span>{displayAct ? `⏱ ${lightCountdownLabel} ${fmtCountdown(lightCountdown)}` : ''}</span>
          </div>
          <div className="light-counter">{timed.length ? `${displayIdx + 1} / ${timed.length}` : '0 / 0'}</div>
          <div className="light-title">{displayAct?.name || '—'}</div>
          {(displayAct?.notes || displayAct?.desc) && <div className="light-note">{renderNotes(displayAct.notes || displayAct.desc)}</div>}
          <AudioBadges key={`light-${displayIdx}`} audioText={displayAct?.audio} songsMap={songsMap} big />
          {displayAct?.materials && <div className="light-materials">🎒 {displayAct.materials}</div>}
          <div className="light-controls">
            <button className="btn secondary dark-btn" disabled={!timed.length || displayIdx <= 0} onClick={() => setManualIdx(Math.max(0, displayIdx - 1))}>◀</button>
            <button className="btn" onClick={() => { setMode('live'); setManualIdx(null); }}>Exit Extra Light</button>
            <button className="btn secondary dark-btn" disabled={!timed.length || displayIdx >= timed.length - 1} onClick={() => setManualIdx(Math.min(timed.length - 1, displayIdx + 1))}>▶</button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="planner-screen">
        <div className="page-eyebrow">Special lesson · Live</div>
        <h1 className="page-title">{meta.title}</h1>
        <p className="page-desc">{meta.type} · {COURSE_NAMES[meta.course] || meta.course}{meta.story ? ` · ${meta.story}` : ''}{meta.day ? ` · ${meta.day}` : ''}</p>
        <div className="section-block no-print">
          <div className="live-tools" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="field compact"><label>Start time</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
            <button className="btn secondary" onClick={() => { setMode('light'); setManualIdx(null); }}>Extra Light</button>
            <a className="btn secondary" href="/special-lessons">← Special Lessons</a>
          </div>
        </div>
        {loading ? <p>Loading…</p> : !lesson ? <div className="section-block">Lezione non trovata.</div> : (
          <div className="live-stage no-print">
            {timed.map((a, i) => (
              <div key={i} className={i === currentIndex ? 'live-card current' : 'live-card'}>
                <div className="live-card-top"><span>{a.startClock} – {a.endClock} · {a.duration || '—'}</span>{i === currentIndex && <span className="live-timer">⏱ {fmtCountdown(remainingSecs)}</span>}</div>
                <div className="live-card-name">{i === currentIndex ? '▶ ' : ''}{a.name}</div>
                <AudioBadges key={`live-${i}-${currentIndex}`} audioText={a.audio} songsMap={songsMap} big={i === currentIndex} />
                {a.materials && <div className="live-materials">🎒 {a.materials}</div>}
                <div className="live-notes">{renderNotes(a.notes || a.desc)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
