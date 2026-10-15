// Web stand-in for react-native-ble-plx: no Bluetooth in the browser, so it stays "unsupported"
export enum State {
  Unknown = 'Unknown',
  Resetting = 'Resetting',
  Unsupported = 'Unsupported',
  Unauthorized = 'Unauthorized',
  PoweredOff = 'PoweredOff',
  PoweredOn = 'PoweredOn',
}
export const ScanMode = { Opportunistic: -1, LowPower: 0, Balanced: 1, LowLatency: 2 } as const;
export type Device ={ id: string; rssi: number | null; name: string | null; manufacturerData: string | null; serviceData: Record<string, string> | null };
export class BleManager {
  onStateChange(cb: (s: State) => void) {
    cb(State.Unsupported);
    return { remove() {} };
  }
  startDeviceScan() {}
  stopDeviceScan() {}
}
