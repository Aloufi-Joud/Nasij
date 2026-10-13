// Locked-phone warning (iOS only, see ios/NasijBeaconModule.swift). Missing on builds made before it: then it does nothing.
import { requireOptionalNativeModule } from 'expo';

const native = requireOptionalNativeModule<{ watch(messages: Record<string, string>): Promise<void> }>('NasijBeacon');

// messages: bracelet MAC → text of the lock-screen warning. Pass every linked bracelet each time; {} stops watching.
export const watchBracelets = (messages: Record<string, string>) => native?.watch(messages).catch(() => {});
