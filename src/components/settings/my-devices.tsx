"use client";

import { Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import type { DeviceView } from "./profiles-admin";
import { DeviceList } from "./device-list";

export function MyDevices({ devices }: { devices: DeviceView[] }) {
  const router = useRouter();
  async function revoke(id: string) {
    await fetch(`/api/profiles/sessions/${id}`, { method: "DELETE" });
    router.refresh();
  }
  return (
    <DeviceList items={devices.map((device) => ({ key: device.id, node: <><Smartphone size={13} /> {device.device} <span className="muted small">· vu le {new Date(device.lastSeenAt).toLocaleDateString("fr-FR")}</span> <button type="button" className="btn btn-ghost" onClick={() => void revoke(device.id)}>Déconnecter</button></> }))} />
  );
}
