class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSize = 1600; // 100 ms at 16 kHz.
    this.chunk = new Int16Array(this.chunkSize);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let index = 0; index < channel.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, channel[index]));
      this.chunk[this.offset] = sample < 0 ? sample * 32768 : sample * 32767;
      this.offset += 1;

      if (this.offset === this.chunkSize) {
        const completedChunk = this.chunk;
        this.chunk = new Int16Array(this.chunkSize);
        this.offset = 0;
        this.port.postMessage(completedChunk.buffer, [completedChunk.buffer]);
      }
    }

    return true;
  }
}

registerProcessor('qa-pcm-capture', PcmCaptureProcessor);
