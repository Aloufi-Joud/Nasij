// One Bluetooth scan shared by every screen. The family and volunteer screens stay
// mounted together, and the phone allows only one scan, so they subscribe here.
// The app only listens to broadcasts; it never connects to a bracelet.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { LOST_AFTER_MS, WINDOW, braceletMac, summarize, type Signal } from './signal';

const manager = new BleManager();
const listeners = new Set<(device: Device) => void>();
const stateListeners = new Set<(state: State) => void>();
let btState: State = State.Unknown;
let scanning = false;

function sync() {
  const want = btState === State.PoweredOn && listeners.size > 0;
  if (want && !scanning) {
    scanning = true;
    manager.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
      if (error || !device || device.rssi == null) return;
      listeners.forEach((l) => l(device));
    });
  } else if (!want && scanning) {
    scanning = false;
    manager.stopDeviceScan();
  }
}

// Back on screen: restart the scan. After the background, iOS can keep merging repeated packets
// from the same bracelet, so only the first one arrives and the bracelet looks lost after a moment.
AppState.addEventListener('change', (state) => {
  if (state !== 'active' || !scanning) return;
  manager.stopDeviceScan().catch(() => {}).finally(() => {
    scanning = false;
    sync();
  });
});

manager.onStateChange((state) => {
  btState = state;
  stateListeners.forEach((l) => l(state));
  sync();
}, true);

// Every packet heard (rssi is never null here). Returns unsubscribe.
export function listen(cb: (device: Device) => void) {
  listeners.add(cb);
  sync();
  return () => {
    listeners.delete(cb);
    sync();
  };
}

export function onBluetoothState(cb: (state: State) => void) {
  stateListeners.add(cb);
  cb(btState);
  return () => {
    stateListeners.delete(cb);
  };
}

// Live signal of one bracelet by its number (MAC), refreshed twice a second.
// null mac = not listening. Same shape as the volunteer's fake signal.
export function useBraceletSignal(mac: string | null) {
  // Tagged with its bracelet, so a new mac shows nothing until its own first reading
  const [state, setState] = useState<{ mac: string; signal: Signal | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!mac) return;
    // iPhone hides the MAC: learn the phone-side id from EA00, then match the other packets by id
    const ids = new Set<string>();
    let history: number[] = [];
    let latest: Signal | null = null;

    const stop = listen((d) => {
      if (braceletMac(d) === mac) ids.add(d.id);
      if (!ids.has(d.id) || d.rssi == null) return;
      const t = Date.now();
      if (latest && t - latest.lastSeen > LOST_AFTER_MS) history = []; // back after being lost: start fresh
      history = [...history, d.rssi].slice(-WINDOW);
      latest = { rssi: d.rssi, ...summarize(history), lastSeen: t };
    });
    const timer = setInterval(() => {
      setNow(Date.now());
      setState({ mac, signal: latest });
    }, 500);

    return () => {
      stop();
      clearInterval(timer);
    };
  }, [mac]);
  const signal = state && state.mac === mac ? state.signal : null;

  return { signal, now };
}
