import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const CORSI = ['Mousy', 'Linda', 'Sam', 'Emma', 'Oliver', 'Marcia', 'Pam & Paul', 'Ben & Brenda'];

export default function Songs() {
  const [corso, setCorso] = useState('Mousy');
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openTrack, setOpenTrack] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [uploadError, setUploadError] = useState('');

  async function loadSongs() {
    setLoading(true);
    const { data } = await supabase.from('songs').select('*').eq('corso', corso).order('track_number');
    setSongs(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadSongs();
    setOpenTrack(null);
  }, [corso]);

  async function handleUpload(song, file) {
    if (!file) return;
    setUploadError('');
    setUploadingId(song.id);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${song.corso.toLowerCase().replace(/[^a-z0-9]/g, '')}/${song.track_number}_${safeName}`;

    const { error: upErr } = await supabase.storage.from('songs-audio').upload(path, file, {
      upsert: true,
      contentType: file.type || 'audio/mpeg',
    });
    if (upErr) {
      setUploadError('Upload error: ' + upErr.message);
      setUploadingId(null);
      return;
    }
    const { data: pub } = supabase.storage.from('songs-audio').getPublicUrl(path);
    const { error: updErr } = await supabase.from('songs').update({ audio_path: path, audio_url: pub.publicUrl }).eq('id', song.id);
    if (updErr) setUploadError('Save error: ' + updErr.message);
    setUploadingId(null);
    await loadSongs();
  }

  async function handleRemoveAudio(song) {
    if (!window.confirm('Remove the audio file from this track?')) return;
    if (song.audio_path) await supabase.storage.from('songs-audio').remove([song.audio_path]);
    await supabase.from('songs').update({ audio_path: null, audio_url: null }).eq('id', song.id);
    await loadSongs();
  }

  return (
    <Layout>
      <div className="page-eyebrow">Active module</div>
      <h1 className="page-title">Songs</h1>
      <p className="page-desc">Lyrics and audio for songs, organised by course.</p>

      <div className="section-block">
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="corso-select">Course</label>
          <select id="corso-select" value={corso} onChange={(e) => setCorso(e.target.value)}>
            {CORSI.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {uploadError && <div className="error-text">{uploadError}</div>}

        {loading ? (
          <p className="page-desc">Loading…</p>
        ) : songs.length === 0 ? (
          <p className="page-desc">No songs added yet for {corso}.</p>
        ) : (
          <div>
            {songs.map((s) => {
              const isOpen = openTrack === s.id;
              return (
                <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 10, marginBottom: 8, background: '#fff', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', cursor: 'pointer' }} onClick={() => setOpenTrack(isOpen ? null : s.id)}>
                    <span style={{ fontSize: 14 }}>
                      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--ink-soft)', marginRight: 8 }}>#{s.track_number}</span>
                      <strong>{s.title}</strong>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '0 14px 14px 14px', borderTop: '1px solid var(--line)' }}>
                      <div style={{ marginTop: 12, marginBottom: 12 }}>
                        {s.audio_url ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <audio controls src={s.audio_url} style={{ maxWidth: '100%' }} />
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveAudio(s); }} style={{ border: 'none', background: 'none', color: '#e1573a', cursor: 'pointer', fontSize: 12.5 }}>remove audio</button>
                          </div>
                        ) : (
                          <div>
                            <label className="btn secondary" style={{ display: 'inline-block', fontSize: 13, cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
                              {uploadingId === s.id ? 'Uploading…' : '🎵 Upload audio (mp3)'}
                              <input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,audio/mpeg,audio/mp4,audio/x-m4a" style={{ display: 'none' }} disabled={uploadingId === s.id} onChange={(e) => { e.stopPropagation(); handleUpload(s, e.target.files?.[0]); }} onClick={(e) => e.stopPropagation()} />
                            </label>
                          </div>
                        )}
                      </div>
                      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{s.lyrics || '(lyrics not added yet)'}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
