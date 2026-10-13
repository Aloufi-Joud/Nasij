// In-app alert: vibrate and beep (assets/alert.wav), even with the silent switch on: a lost child can't wait.
// Builds without expo-audio (installs before 2026-10-13) only vibrate.
import { Vibration } from 'react-native';

type Player = { seekTo: (s: number) => Promise<void>; play: () => void };
let player: Player | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const audio = require('expo-audio');
  audio.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
  player = audio.createAudioPlayer(require('../../assets/alert.wav'));
} catch {}

export function alarm(pattern: number[]) {
  Vibration.vibrate(pattern);
  player?.seekTo(0).then(() => player?.play()).catch(() => {});
}
