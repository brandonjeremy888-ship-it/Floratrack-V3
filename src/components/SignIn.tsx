import { useState } from 'react';
import { Leaf, Loader as Loader2, CircleAlert as AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function SignIn({ onSignedIn }: { onSignedIn?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      onSignedIn?.();
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden">
          <div className="bg-emerald-900 text-white p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-800 rounded-full mb-4">
              <Leaf size={32} className="text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">FloraTrack</h1>
            <p className="text-emerald-200 text-sm mt-1">Nursery Batch Tracking System</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@nursery.org"
                className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                autoComplete="email"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="flex items-start text-sm bg-red-50 text-red-700 p-3 rounded-lg border border-red-200">
                <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium py-2.5 rounded-lg flex items-center justify-center transition-colors"
            >
              {loading && <Loader2 size={18} className="mr-2 animate-spin" />}
              Sign In
            </button>
          </form>
        </div>
        <p className="text-center text-stone-500 text-xs mt-6">
          Authorized users only. Contact your administrator for credentials.
        </p>
      </div>
    </div>
  );
}
