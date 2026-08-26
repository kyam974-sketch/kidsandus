import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('Login failed. Please check your email and password.');
      return;
    }
    router.replace('/');
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="day-strip">
          {['M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} className={i === 2 ? 'active' : ''} />
          ))}
        </div>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Kids&amp;Us Hub</h1>
        <p className="page-desc" style={{ marginBottom: 24 }}>Personal access — for you only.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  );
}
