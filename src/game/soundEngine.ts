/**
 * Gen 4 Chiptune & Sound Engine using Web Audio API
 * Recreates the nostalgic Nintendo DS / GBA sound font feel:
 * town themes, energetic battle music, gym battle themes, attack SFX, and fanfares!
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private currentBgm: string | null = null;
  private bgmTimer: number | null = null;
  private isPlayingBgm: boolean = false;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopBgm();
    } else if (this.currentBgm) {
      this.playBgm(this.currentBgm);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public playTone(freq: number, duration: number, type: OscillatorType = 'square', vol = 0.15) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // AudioContext fallback
    }
  }

  // --- SOUND EFFECTS ---
  public playSelect() {
    this.playTone(880, 0.05, 'triangle', 0.1);
  }

  public playConfirm() {
    this.playTone(587.33, 0.06, 'triangle', 0.12);
    setTimeout(() => this.playTone(880, 0.08, 'triangle', 0.12), 60);
  }

  public playCancel() {
    this.playTone(440, 0.06, 'triangle', 0.1);
    setTimeout(() => this.playTone(330, 0.08, 'triangle', 0.1), 60);
  }

  public playCollision() {
    this.playTone(130, 0.06, 'square', 0.1);
  }

  public playGrassRustle() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const bufferSize = this.ctx.sampleRate * 0.1;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
    } catch {}
  }

  public playHit(superEffective = false, critical = false) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      // Impact thud
      this.playTone(140, 0.12, 'square', 0.25);
      if (critical) {
        setTimeout(() => this.playTone(440, 0.1, 'triangle', 0.2), 40);
      }
      if (superEffective) {
        setTimeout(() => {
          this.playTone(660, 0.15, 'sawtooth', 0.2);
          this.playTone(880, 0.18, 'square', 0.18);
        }, 80);
      }
    } catch {}
  }

  public playHeal() {
    // Pokemon Center 6-tone recovery jingle!
    const notes = [440, 440, 440, 392, 440, 523.25];
    const times = [0, 150, 300, 450, 600, 750];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.2, 'triangle', 0.2);
      }, times[i]);
    });
  }

  public playLevelUp() {
    const notes = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.12, 'triangle', 0.2);
      }, i * 70);
    });
  }

  public playCatchSuccess() {
    const notes = [523, 659, 783, 1046, 880, 1046];
    const delays = [0, 120, 240, 360, 500, 700];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 0.25, 'triangle', 0.22);
      }, delays[idx]);
    });
  }

  public playBallShake() {
    this.playTone(330, 0.08, 'sine', 0.15);
    setTimeout(() => this.playTone(260, 0.08, 'sine', 0.15), 60);
  }

  public playFlee() {
    this.playTone(600, 0.1, 'sawtooth', 0.15);
    setTimeout(() => this.playTone(800, 0.1, 'sawtooth', 0.15), 100);
    setTimeout(() => this.playTone(1200, 0.15, 'sawtooth', 0.15), 200);
  }

  // --- BACKGROUND MUSIC ENGINE (Procedural Loop) ---
  public playBgm(type: string) {
    if (this.currentBgm === type && this.isPlayingBgm) return;
    this.stopBgm();
    this.currentBgm = type;
    if (this.isMuted) return;

    this.initCtx();
    this.isPlayingBgm = true;

    let step = 0;
    const intervalMs = type.includes('battle') ? 140 : 220;

    const tick = () => {
      if (!this.isPlayingBgm || this.isMuted) return;

      if (type === 'town') {
        // Twinleaf & Sandgem gentle town theme (C-E-G-B mellow piano/synth)
        const melody = [
          261.63, 0, 329.63, 392.00, 0, 329.63, 392.00, 523.25,
          440.00, 0, 349.23, 392.00, 329.63, 0, 261.63, 0,
          293.66, 0, 349.23, 440.00, 392.00, 0, 329.63, 0,
          261.63, 0, 293.66, 329.63, 261.63, 0, 0, 0
        ];
        const note = melody[step % melody.length];
        if (note > 0) {
          this.playTone(note, 0.24, 'triangle', 0.09);
        }
        if (step % 4 === 0) {
          this.playTone(130.81, 0.35, 'sine', 0.1); // bass
        }
      } else if (type === 'route') {
        // Route 201 upbeat jaunty walking theme
        const routeNotes = [
          329.63, 392.00, 440.00, 523.25, 493.88, 440.00, 392.00, 329.63,
          349.23, 440.00, 523.25, 587.33, 523.25, 440.00, 392.00, 0,
          440.00, 523.25, 587.33, 659.25, 587.33, 523.25, 440.00, 392.00,
          329.63, 392.00, 349.23, 293.66, 261.63, 0, 293.66, 0
        ];
        const note = routeNotes[step % routeNotes.length];
        if (note > 0) {
          this.playTone(note, 0.18, 'square', 0.08);
        }
        if (step % 2 === 0) {
          this.playTone(164.81, 0.18, 'triangle', 0.11);
        }
      } else if (type === 'city') {
        // Oreburgh City energetic mining town beat
        const cityNotes = [
          392.00, 440.00, 523.25, 0, 523.25, 587.33, 659.25, 0,
          587.33, 523.25, 440.00, 392.00, 440.00, 0, 392.00, 0,
          329.63, 392.00, 440.00, 0, 392.00, 329.63, 293.66, 0,
          261.63, 293.66, 329.63, 392.00, 329.63, 0, 0, 0
        ];
        const note = cityNotes[step % cityNotes.length];
        if (note > 0) {
          this.playTone(note, 0.18, 'sawtooth', 0.07);
        }
        if (step % 2 === 0) {
          this.playTone(130.81, 0.18, 'square', 0.1);
        }
      } else if (type === 'cave') {
        // Oreburgh Gate mysterious cave resonance
        const caveNotes = [
          196.00, 0, 233.08, 0, 261.63, 0, 293.66, 0,
          261.63, 0, 233.08, 0, 196.00, 0, 174.61, 0,
        ];
        const note = caveNotes[step % caveNotes.length];
        if (note > 0) {
          this.playTone(note, 0.4, 'sine', 0.15);
        }
      } else if (type === 'battle_wild') {
        // Sinnoh Wild Battle high-energy driving battle track!
        const bassLine = [146.83, 146.83, 220.00, 146.83, 130.81, 130.81, 196.00, 130.81];
        const leadLine = [
          587.33, 0, 659.25, 698.46, 587.33, 0, 880.00, 783.99,
          698.46, 659.25, 587.33, 523.25, 587.33, 0, 0, 0,
          698.46, 0, 783.99, 880.00, 698.46, 0, 1046.5, 880.00,
          783.99, 698.46, 659.25, 587.33, 523.25, 587.33, 659.25, 0
        ];
        const lead = leadLine[step % leadLine.length];
        const bass = bassLine[step % bassLine.length];
        if (lead > 0) {
          this.playTone(lead, 0.13, 'square', 0.1);
        }
        this.playTone(bass, 0.12, 'sawtooth', 0.09);
      } else if (type === 'battle_trainer' || type === 'battle_gym') {
        // Sinnoh Gym Leader / Rival Roark Battle Rock-Chiptune
        const bassLine = [110.00, 110.00, 164.81, 110.00, 130.81, 110.00, 146.83, 110.00];
        const leadLine = [
          440.00, 493.88, 523.25, 587.33, 659.25, 587.33, 523.25, 493.88,
          523.25, 659.25, 783.99, 880.00, 783.99, 659.25, 587.33, 523.25,
          659.25, 0, 783.99, 0, 880.00, 0, 1046.5, 0,
          880.00, 783.99, 659.25, 587.33, 523.25, 440.00, 392.00, 440.00
        ];
        const lead = leadLine[step % leadLine.length];
        const bass = bassLine[step % bassLine.length];
        if (lead > 0) {
          this.playTone(lead, 0.12, 'sawtooth', 0.12);
        }
        this.playTone(bass, 0.12, 'square', 0.11);
      }

      step++;
      this.bgmTimer = window.setTimeout(tick, intervalMs);
    };

    tick();
  }

  public stopBgm() {
    this.isPlayingBgm = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const sound = new SoundEngine();
