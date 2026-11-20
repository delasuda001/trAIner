"use client";

import { createContext, useContext } from "react";
import { vouvoyer, type Register } from "@/lib/register";

/**
 * Registre de langue du profil connecté (« tu » pour Bastien, « vous » pour un invité),
 * fourni par le layout. Les composants serveur ne peuvent pas lire un contexte : ils
 * passent par `<Say>`, les composants client par `useRegister`.
 */
const RegisterContext = createContext<Register>("tu");

export function RegisterProvider({ register, children }: { register: Register; children: React.ReactNode }) {
  return <RegisterContext.Provider value={register}>{children}</RegisterContext.Provider>;
}

export function useRegister(): Register {
  return useContext(RegisterContext);
}

/** Texte dans les deux registres, ou phrase du moteur (au « tu ») à vouvoyer pour un invité. */
export function useSay(): (tu: string, vous?: string) => string {
  const register = useRegister();
  return (tu, vous) => (register === "tu" ? tu : vous ?? vouvoyer(tu));
}

export function Say({ tu, vous }: { tu: string; vous?: string }) {
  const say = useSay();
  return <>{say(tu, vous)}</>;
}
