class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.samples = 0;
    this.chunkSamples = Math.max(1, Math.round(sampleRate * 0.1));
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) return true;

    this.chunks.push(channel.slice(0));
    this.samples += channel.length;

    while (this.samples >= this.chunkSamples) {
      const out = new Float32Array(this.chunkSamples);
      let filled = 0;
      while (filled < this.chunkSamples && this.chunks.length > 0) {
        const head = this.chunks[0];
        const need = this.chunkSamples - filled;
        if (head.length <= need) {
          out.set(head, filled);
          filled += head.length;
          this.samples -= head.length;
          this.chunks.shift();
        } else {
          out.set(head.subarray(0, need), filled);
          this.chunks[0] = head.subarray(need);
          this.samples -= need;
          filled += need;
        }
      }
      this.port.postMessage(out, [out.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
