import { useState } from "react";

import { useApp } from "@/store/app";

export function Login() {
  const doLogin = useApp((s) => s.doLogin);
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await doLogin(username, password);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-obs-surface">
      <form
        onSubmit={submit}
        className="bg-white border border-obs-border shadow-sm rounded p-6 w-80"
      >
        <h1 className="text-lg font-semibold text-obs-navy mb-4">netviz</h1>
        <p className="text-obs-mute text-xs mb-4">
          Sign in with your Observium account.
        </p>
        <label className="block text-xs text-obs-mute mb-1">Username</label>
        <input
          autoFocus
          className="w-full mb-3 px-2 py-1 border border-obs-border rounded text-sm"
          value={username}
          onChange={(e) => setU(e.target.value)}
        />
        <label className="block text-xs text-obs-mute mb-1">Password</label>
        <input
          type="password"
          className="w-full mb-4 px-2 py-1 border border-obs-border rounded text-sm"
          value={password}
          onChange={(e) => setP(e.target.value)}
        />
        {err && (
          <div className="text-obs-danger text-xs mb-3">{err}</div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-obs-blue hover:bg-obs-blueDark text-white text-sm py-1.5 rounded disabled:opacity-50"
        >
          {busy ? "Signing in\u2026" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
