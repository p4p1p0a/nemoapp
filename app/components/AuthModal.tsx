"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

interface AuthModalProps {
  onClose: () => void;
}

export const AuthModal = ({ onClose }: AuthModalProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        setMessage({ type: 'error', text: "登録エラー: " + error.message });
      } else {
        setMessage({ type: 'success', text: "アカウントを作成しました！そのままログインできます。" });
        setMode('login');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setMessage({ type: 'error', text: "ログインエラー: " + error.message });
      } else {
        onClose(); // ログイン成功
      }
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md px-4" onClick={onClose}>
      <div 
        className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-sm flex flex-col gap-6 animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {mode === 'login' ? 'サインイン' : 'アカウント作成'}
          </h2>
          <p className="text-sm text-white/40">
            {mode === 'login' 
              ? 'メールアドレスとパスワードでログインします。' 
              : '新しいアカウントを作成して同期を開始します。'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest ml-1">Email Address</label>
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/60 transition-all"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest ml-1">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/60 transition-all"
            />
          </div>

          {message && (
            <div className={`text-xs p-3 rounded-lg border ${
              message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 text-white font-bold py-3 rounded-xl shadow-lg transition-all active:scale-[0.98] mt-2"
          >
            {loading ? "処理中..." : (mode === 'login' ? 'サインイン' : 'アカウント作成')}
          </button>
        </form>

        <div className="flex flex-col items-center gap-4">
          <button 
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {mode === 'login' ? 'アカウントを新規作成する' : '既にアカウントをお持ちの方'}
          </button>
          
          <button 
            onClick={onClose}
            className="text-xs text-white/20 hover:text-white/40 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};
