"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { clearOfflineData } from "@/components/offline/connection";

export function LogoutButton({ name, label }: { name: string; label?: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    await clearOfflineData();
    router.replace("/connexion");
    router.refresh();
  }
  return (
    <button type="button" className="btn btn-ghost profile-chip" onClick={() => void logout()} title={`Connecté en tant que ${name} : se déconnecter`} aria-label={`Se déconnecter (${name})`}>
      <span className="profile-name">{label ?? name}</span>
      <LogOut size={14} />
    </button>
  );
}
