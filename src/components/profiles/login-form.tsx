"use client";

import { useState } from "react";

/** Prénom + code personnel. Le navigateur peut les mémoriser (champs identifiant / mot de passe). */
export function LoginForm() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Clavier à chiffres par défaut (code invité) ; code long à lettres (Bastien, anciens codes) sur demande.
  const [letters, setLetters] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code }) });
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
        <span>Ton prénom</span>
        <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="username" autoCapitalize="words" autoCorrect="off" spellCheck={false} placeholder="ex. Marie" required />
      </label>
      <label className="field">
        <span>Ton code</span>
        <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="current-password" inputMode={letters ? "text" : "numeric"} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={letters ? "xxxx-xxxx-xxxx-xxxx-xxxx" : "6 chiffres"} required />
      </label>
      <button type="button" className="link-button" onClick={() => setLetters((value) => !value)}>{letters ? "Mon code est à 6 chiffres" : "Mon code contient des lettres"}</button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={busy || name.trim().length < 2 || code.trim().length < 6}>{busy ? "Connexion…" : "Entrer"}</button>
    </form>
  );
}
