"use client";

import { useState } from "react";

export function LoginForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const body = (await response.json().catch(() => null)) as { error?: string; onboarding?: boolean } | null;
    if (response.ok) {
      window.location.assign(body?.onboarding ? "/bienvenue" : "/");
      return;
    }
    setError(body?.error ?? "Connexion impossible.");
    setBusy(false);
  }

  return (
    <form className="login-form" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>Code d&apos;accès</span>
        <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="xxxx-xxxx-xxxx-xxxx-xxxx" required />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={busy || code.trim().length < 10}>{busy ? "Connexion…" : "Entrer"}</button>
    </form>
  );
}
