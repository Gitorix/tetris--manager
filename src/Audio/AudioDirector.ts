export type GameSfx =
  | "tap"
  | "success"
  | "warning"
  | "line"
  | "delivery"
  | "analysis"
  | "special"
  | "combo";

type AudioContextType = typeof AudioContext;

const NOTE = {
  E3: 164.81, G3: 196, A3: 220, B3: 246.94, C4: 261.63, D4: 293.66,
  E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25,
  D5: 587.33, E5: 659.25, G5: 783.99,
} as const;

// A compact folk-dance motif arranged for this game. It evokes classic falling-block
// arcade music without using a recording or arrangement from another game.
const MELODY = [
  NOTE.E5, NOTE.B4, NOTE.C5, NOTE.D5, NOTE.C5, NOTE.B4, NOTE.A4, NOTE.A4,
  NOTE.C5, NOTE.E5, NOTE.D5, NOTE.C5, NOTE.B4, NOTE.C5, NOTE.D5, NOTE.E5,
  NOTE.C5, NOTE.A4, NOTE.A4, NOTE.D5, NOTE.F4, NOTE.A4, NOTE.G4, NOTE.F4,
  NOTE.E4, NOTE.C4, NOTE.E4, NOTE.D4, NOTE.C4, NOTE.B3, NOTE.B3, NOTE.C4,
] as const;
const BASS = [NOTE.A3, NOTE.A3, NOTE.G3, NOTE.G3, NOTE.F4 / 2, NOTE.F4 / 2, NOTE.E3, NOTE.E3] as const;

class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private scheduler: number | null = null;
  private nextBeatAt = 0;
  private step = 0;
  private intensity = 0;
  private currentBpm = 104;
  private targetBpm = 104;
  private musicEnabled = true;
  private effectsEnabled = true;
  private musicVolume = 0.42;
  private effectsVolume = 0.7;
  private playing = false;

  configure(options: { musicEnabled: boolean; effectsEnabled: boolean; musicVolume: number; effectsVolume: number }) {
    this.musicEnabled = options.musicEnabled;
    this.effectsEnabled = options.effectsEnabled;
    this.musicVolume = Math.max(0, Math.min(1, options.musicVolume));
    this.effectsVolume = Math.max(0, Math.min(1, options.effectsVolume));
    if (this.music) this.music.gain.setTargetAtTime(this.musicEnabled ? this.musicVolume : 0, this.now(), 0.04);
    if (this.effects) this.effects.gain.setTargetAtTime(this.effectsEnabled ? this.effectsVolume : 0, this.now(), 0.02);
  }

  async unlock() {
    this.ensureContext();
    if (this.context?.state === "suspended") await this.context.resume();
  }

  async startMusic() {
    await this.unlock();
    if (this.playing) return;
    this.playing = true;
    this.nextBeatAt = this.now() + 0.05;
    this.scheduler = window.setInterval(() => this.scheduleMusic(), 45);
  }

  pauseMusic() {
    this.playing = false;
    if (this.scheduler !== null) window.clearInterval(this.scheduler);
    this.scheduler = null;
  }

  stopMusic() {
    this.pauseMusic();
    this.step = 0;
  }

  setDanger(danger: number) {
    this.intensity = Math.max(0, Math.min(1, danger / 100));
    this.targetBpm = 104 + this.intensity * 72;
  }

  play(kind: GameSfx) {
    if (!this.effectsEnabled) return;
    this.ensureContext();
    if (!this.context || this.context.state !== "running" || !this.effects) return;
    const t = this.now();
    if (kind === "special" || kind === "combo") {
      this.playFinisher(t, kind === "combo");
      return;
    }
    const notes: Record<GameSfx, Array<[number, number, OscillatorType]>> = {
      tap: [[660, .045, "square"]],
      success: [[523.25, .08, "triangle"], [783.99, .14, "triangle"]],
      warning: [[180, .12, "sawtooth"], [130, .18, "square"]],
      line: [[392, .07, "square"], [523.25, .08, "square"], [783.99, .16, "triangle"]],
      delivery: [[330, .1, "triangle"], [494, .12, "square"], [988, .24, "triangle"]],
      analysis: [[220, .08, "sine"], [440, .1, "sine"], [880, .12, "triangle"], [1320, .22, "sine"]],
      special: [],
      combo: [],
    };
    notes[kind].forEach(([frequency, duration, type], index) => this.voice(frequency, t + index * .055, duration, type, .13, this.effects!));
    if (["delivery", "analysis"].includes(kind)) this.noise(t, .38, kind === "analysis" ? 1800 : 700);
  }

  private ensureContext() {
    if (this.context) return;
    const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextType }).webkitAudioContext;
    if (!AudioCtor) return;
    this.context = new AudioCtor();
    this.master = this.context.createGain();
    this.music = this.context.createGain();
    this.effects = this.context.createGain();
    this.master.gain.value = .82;
    this.music.gain.value = this.musicEnabled ? this.musicVolume : 0;
    this.effects.gain.value = this.effectsEnabled ? this.effectsVolume : 0;
    this.music.connect(this.master);
    this.effects.connect(this.master);
    this.master.connect(this.context.destination);
  }

  private now() { return this.context?.currentTime ?? 0; }

  private scheduleMusic() {
    if (!this.playing || !this.context || !this.music) return;
    this.currentBpm += (this.targetBpm - this.currentBpm) * .08;
    while (this.nextBeatAt < this.now() + .16) {
      const beatDuration = 60 / this.currentBpm / 2;
      const melody = MELODY[this.step % MELODY.length];
      this.voice(melody, this.nextBeatAt, beatDuration * .72, "square", .055 + this.intensity * .018, this.music);
      if (this.step % 2 === 0) {
        const bass = BASS[Math.floor(this.step / 2) % BASS.length];
        this.voice(bass, this.nextBeatAt, beatDuration * 1.55, "triangle", .07, this.music);
      }
      if (this.intensity > .48 && this.step % 2 === 1) this.tick(this.nextBeatAt, .018 + this.intensity * .018);
      this.step += 1;
      this.nextBeatAt += beatDuration;
    }
  }

  private voice(frequency: number, start: number, duration: number, type: OscillatorType, volume: number, output: AudioNode) {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }

  private tick(start: number, volume: number) {
    if (!this.context || !this.music) return;
    this.voice(2200, start, .025, "square", volume, this.music);
  }

  private playFinisher(start: number, combo: boolean) {
    if (!this.context || !this.effects) return;

    // Pull the regular track back so the finisher reads as a deliberate,
    // arcade-style attack instead of another note layered over the BGM.
    if (this.music && this.musicEnabled) {
      const gain = this.music.gain;
      gain.cancelScheduledValues(start);
      gain.setValueAtTime(Math.max(.0001, gain.value), start);
      gain.exponentialRampToValueAtTime(.035, start + .045);
      gain.setValueAtTime(.035, start + (combo ? .78 : .58));
      gain.exponentialRampToValueAtTime(Math.max(.0001, this.musicVolume), start + (combo ? 1.12 : .9));
    }

    // Siren-like charge, sub-bass dive and a hard metallic strike.
    this.sweep(190, combo ? 1480 : 1120, start, combo ? .42 : .32, "sawtooth", .2);
    this.sweep(95, 42, start + .12, combo ? .78 : .58, "sawtooth", .3);
    this.sweep(2100, 115, start + (combo ? .4 : .31), .22, "square", .24);
    this.noise(start + (combo ? .39 : .3), combo ? .72 : .52, 980);
    this.noise(start + (combo ? .44 : .35), combo ? .48 : .34, 2900);

    const impact = start + (combo ? .42 : .33);
    [55, 82.41, 110, 220].forEach((frequency, index) => {
      this.voice(frequency, impact + index * .012, combo ? .58 : .42, index < 2 ? "sawtooth" : "square", combo ? .25 : .2, this.effects!);
    });
    [1760, 1320, 880, 440].forEach((frequency, index) => {
      this.voice(frequency, impact + index * .035, .12 + index * .035, "square", .15, this.effects!);
    });

    if (combo) {
      // The team finisher lands twice and ends in a bright victory chord.
      const second = start + .72;
      this.sweep(150, 55, second, .48, "sawtooth", .3);
      this.noise(second, .58, 1250);
      [65.41, 130.81, 261.63, 523.25, 1046.5].forEach((frequency, index) => {
        this.voice(frequency, second + index * .018, .5, index < 2 ? "sawtooth" : "square", .2, this.effects!);
      });
    }
  }

  private sweep(from: number, to: number, start: number, duration: number, type: OscillatorType, volume: number) {
    if (!this.context || !this.effects) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .018);
    gain.gain.setValueAtTime(volume, start + duration * .62);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(this.effects);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
  }

  private noise(start: number, duration: number, cutoff: number) {
    if (!this.context || !this.effects) return;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(.12, start);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.effects);
    source.start(start);
  }
}

export const audioDirector = new AudioDirector();
