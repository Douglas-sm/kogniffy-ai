import { MEMORY_BUTTONS } from "@/game/memory/panelConfig";

interface ToneOptions {
  durationMs: number;
  gain: number;
  type?: OscillatorType;
  glideTo?: number;
}

export class PanelAudio {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  prime() {
    const context = this.ensureContext();

    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      void context.resume();
    }
  }

  playButton(index: number, emphasis = 1) {
    const config = MEMORY_BUTTONS[index];

    if (!config) {
      return;
    }

    this.playTone(config.frequency, {
      durationMs: 180,
      gain: 0.045 * emphasis,
      type: "triangle",
      glideTo: config.frequency * 1.05
    });
  }

  playCorrect(index: number) {
    const config = MEMORY_BUTTONS[index];

    if (!config) {
      return;
    }

    this.playTone(config.frequency * 1.26, {
      durationMs: 110,
      gain: 0.028,
      type: "sine",
      glideTo: config.frequency * 1.42
    });
  }

  playError() {
    this.playTone(210, {
      durationMs: 320,
      gain: 0.052,
      type: "sawtooth",
      glideTo: 118
    });
  }

  playUnlock() {
    const context = this.ensureContext();

    if (!context || !this.masterGain) {
      return;
    }

    const startAt = context.currentTime;
    const notes = [392, 494, 659];

    notes.forEach((frequency, index) => {
      this.playToneAt(startAt + index * 0.08, frequency, {
        durationMs: 220,
        gain: 0.032,
        type: "triangle",
        glideTo: frequency * 1.04
      });
    });
  }

  private ensureContext() {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.context) {
      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextCtor) {
        return null;
      }

      this.context = new AudioContextCtor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.9;
      this.masterGain.connect(this.context.destination);
    }

    return this.context;
  }

  private playTone(frequency: number, options: ToneOptions) {
    const context = this.ensureContext();

    if (!context) {
      return;
    }

    this.playToneAt(context.currentTime, frequency, options);
  }

  private playToneAt(startAt: number, frequency: number, options: ToneOptions) {
    const context = this.ensureContext();

    if (!context || !this.masterGain) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const durationSeconds = options.durationMs / 1000;
    const stopAt = startAt + durationSeconds;

    oscillator.type = options.type ?? "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt);

    if (options.glideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.glideTo), stopAt);
    }

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain), startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(startAt);
    oscillator.stop(stopAt + 0.02);
  }
}
