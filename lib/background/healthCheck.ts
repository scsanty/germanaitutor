import type { SpeechProvider } from '../speech/speechProvider';
import type { NotificationSink } from '../services/audioService';

// Spec: the worker checks the speech service every 60 s. Review Focus 1: repeated failed checks raise
// one speech_down problem (raise is idempotent while open); a healthy check resolves it.
export async function runHealthCheck(
  provider: Pick<SpeechProvider, 'health'>,
  notifications: NotificationSink,
  url: string
): Promise<boolean> {
  let ok = false;
  try {
    ok = (await provider.health()).ok;
  } catch {
    ok = false;
  }
  if (ok) {
    await notifications.resolve('speech_down');
  } else {
    await notifications.raise(
      'speech_down',
      'speech_down',
      'Speech service is down',
      `Cannot reach the speech service at ${url}. Start it with: docker compose up -d speech`
    );
  }
  return ok;
}
