import {
  float32ToPcm16Base64,
  pcm16Base64ToFloat32,
  resampleLinear,
  TARGET_RATE,
  toTargetRate,
} from "./pcm";

export class PhoneAudio {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private mute: GainNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private nextTime = 0;
  private activeSources = 0;
  private playGeneration = 0;
  private idleResolvers: Array<() => void> = [];
  private stopped = false;
  private onChunk: ((base64: string) => void) | null = null;
  private micReady: Promise<void> | null = null;

  /** Call synchronously inside the click handler, before any await. */
  unlock(): void {
    if (this.context) return;
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.context = new AudioContextCtor({ sampleRate: TARGET_RATE });
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[voice] AudioContext sampleRate",
        this.context.sampleRate,
        "target",
        TARGET_RATE,
      );
    }
  }

  async resume(): Promise<void> {
    if (this.context && this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  beginCapture(onChunk: (base64: string) => void): Promise<void> {
    this.onChunk = onChunk;
    this.stopped = false;
    this.micReady = this.startCapture();
    return this.micReady;
  }

  private async startCapture(): Promise<void> {
    if (!this.context || !this.onChunk) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (this.stopped) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      return;
    }
    await this.resume();
    await this.context.audioWorklet.addModule("/pcm-capture-worklet.js");
    this.source = this.context.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.context, "pcm-capture");
    this.mute = this.context.createGain();
    this.mute.gain.value = 0;
    this.worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!this.context || !this.onChunk) return;
      const samples = toTargetRate(event.data, this.context.sampleRate);
      this.onChunk(float32ToPcm16Base64(samples));
    };
    this.source.connect(this.worklet);
    this.worklet.connect(this.mute);
    this.mute.connect(this.context.destination);
  }

  playBase64(base64: string): void {
    if (!this.context || this.stopped || !base64) return;
    const generation = this.playGeneration;
    const samples = pcm16Base64ToFloat32(base64);
    const playback = resampleLinear(samples, TARGET_RATE, this.context.sampleRate);
    if (playback.length === 0) return;
    const buffer = this.context.createBuffer(1, playback.length, this.context.sampleRate);
    buffer.getChannelData(0).set(playback);
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.connect(this.context.destination);
    const now = this.context.currentTime;
    if (this.nextTime < now + 0.02) this.nextTime = now + 0.02;
    node.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.activeSources += 1;
    this.sources.push(node);
    node.onended = () => {
      if (generation !== this.playGeneration) return;
      this.sources = this.sources.filter((item) => item !== node);
      this.activeSources = Math.max(0, this.activeSources - 1);
      if (this.activeSources === 0) this.resolveIdle();
    };
  }

  stopPlayback(): void {
    this.playGeneration += 1;
    for (const node of this.sources) {
      node.onended = null;
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
      node.disconnect();
    }
    this.sources = [];
    this.nextTime = 0;
    this.activeSources = 0;
    this.resolveIdle();
  }

  waitUntilIdle(): Promise<void> {
    if (this.activeSources === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  setMicEnabled(enabled: boolean): void {
    this.stream?.getTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.stopPlayback();
    this.onChunk = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.worklet?.disconnect();
    this.source?.disconnect();
    this.mute?.disconnect();
    this.worklet = null;
    this.source = null;
    this.mute = null;
    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = null;
    }
  }

  private resolveIdle(): void {
    const waiting = this.idleResolvers.splice(0);
    for (const resolve of waiting) resolve();
  }
}
