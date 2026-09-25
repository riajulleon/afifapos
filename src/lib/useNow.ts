import { useEffect, useState } from 'react';
import { api } from '../api/queries';

// Offset between this device and the server clock (DEAL-06): countdowns and price switches
// follow the server's Rome time even when the device clock is wrong.
let offsetMs = 0;
let synced = false;

async function sync() {
  const t0 = Date.now();
  const server = new Date(await api.serverTime()).getTime();
  const t1 = Date.now();
  offsetMs = server - (t0 + t1) / 2;
  synced = true;
}

export const serverNow = () => new Date(Date.now() + offsetMs);

/** Re-renders every `intervalMs` with the server-corrected current time. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!synced) sync().then(() => setNow(serverNow())).catch(() => {});
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
