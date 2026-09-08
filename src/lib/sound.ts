/**
 * High-definition notification chime synthesized via Web Audio API.
 * 100% self-contained: No external audio files, zero network latency, instant 0ms playback.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Plays a warm, Slack/Apple-inspired harmonic double-tone ping when a mention arrives.
 */
export function playNotificationChime() {
  try {
    // Check if user disabled sounds in localStorage
    const soundEnabled = localStorage.getItem('mindshare_sound_enabled') !== 'false';
    if (!soundEnabled) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: Warm crystal chime (D5 - 587.3 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.4);

    // Tone 2: Harmonious high ping (A5 - 880.0 Hz) slightly staggered
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.08);

    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.10);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.55);
  } catch (err) {
    console.debug('[Audio] Notification sound skipped:', err);
  }
}

export function isSoundEnabled(): boolean {
  return localStorage.getItem('mindshare_sound_enabled') !== 'false';
}

export function toggleSoundEnabled(): boolean {
  const current = isSoundEnabled();
  const next = !current;
  localStorage.setItem('mindshare_sound_enabled', next ? 'true' : 'false');
  if (next) {
    playNotificationChime(); // Preview sound when turned on
  }
  return next;
}
