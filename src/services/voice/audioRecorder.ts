/**
 * Foundry Audio Recorder
 * Captures microphone audio using standard Web Audio API / MediaDevices,
 * computes live audio RMS levels for visual feedback,
 * and encodes recorded audio into a 16kHz 16-bit mono PCM WAV buffer suitable for Whisper.
 */

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private pcmChunks: Float32Array[] = [];
  private isRecording = false;
  private onAudioLevelCallback?: (level: number) => void;

  public isRecordingActive(): boolean {
    return this.isRecording;
  }

  public setAudioLevelCallback(cb?: (level: number) => void) {
    this.onAudioLevelCallback = cb;
  }

  /**
   * Start recording from the user's default microphone.
   */
  public async start(): Promise<void> {
    if (this.isRecording) return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this environment.');
    }

    this.pcmChunks = [];

    // Request audio stream with speech-optimized constraints
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioContextClass({ sampleRate: 16000 });

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Buffer size 4096 gives ~250ms chunks at 16kHz
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this.isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      this.pcmChunks.push(copy);

      // Compute RMS volume for live visualizer
      if (this.onAudioLevelCallback) {
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        this.onAudioLevelCallback(Math.min(1, rms * 5));
      }
    };

    this.sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
    this.isRecording = true;
  }

  /**
   * Stop recording and return a 16kHz 16-bit mono PCM WAV byte array.
   */
  public async stop(): Promise<Uint8Array> {
    this.isRecording = false;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    const actualSampleRate = this.audioContext?.sampleRate || 16000;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }

    if (this.pcmChunks.length === 0) {
      throw new Error('No audio was captured from the microphone.');
    }

    // Merge PCM chunks
    const totalSamples = this.pcmChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of this.pcmChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.pcmChunks = [];

    // Encode to standard 16-bit PCM WAV (16kHz mono)
    return this.encodeWav(merged, actualSampleRate);
  }

  /**
   * Cancel and discard current recording.
   */
  public cancel() {
    this.isRecording = false;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.pcmChunks = [];
  }

  /**
   * Encodes float samples into a 16-bit PCM WAV buffer.
   * If source sample rate is not 16000, resamples to 16000.
   */
  private encodeWav(samples: Float32Array, inputSampleRate: number): Uint8Array {
    let finalSamples = samples;
    const targetSampleRate = 16000;

    // Linear resampling if hardware gave non-16kHz
    if (inputSampleRate !== targetSampleRate && inputSampleRate > 0) {
      const ratio = targetSampleRate / inputSampleRate;
      const newLength = Math.round(samples.length * ratio);
      finalSamples = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const originIndex = i / ratio;
        const low = Math.floor(originIndex);
        const high = Math.min(low + 1, samples.length - 1);
        const weight = originIndex - low;
        finalSamples[i] = samples[low] * (1 - weight) + samples[high] * weight;
      }
    }

    const numChannels = 1;
    const bytesPerSample = 2; // 16-bit
    const dataSize = finalSamples.length * bytesPerSample;
    const wavBuffer = new Uint8Array(44 + dataSize);
    const view = new DataView(wavBuffer.buffer);

    // RIFF chunk descriptor
    this.writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeAscii(view, 8, 'WAVE');

    // "fmt " sub-chunk
    this.writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size for PCM
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, targetSampleRate, true);
    view.setUint32(28, targetSampleRate * numChannels * bytesPerSample, true); // ByteRate
    view.setUint16(32, numChannels * bytesPerSample, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // "data" sub-chunk
    this.writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write 16-bit signed PCM samples
    let byteOffset = 44;
    for (let i = 0; i < finalSamples.length; i++) {
      const s = Math.max(-1, Math.min(1, finalSamples[i]));
      view.setInt16(byteOffset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      byteOffset += 2;
    }

    return wavBuffer;
  }

  private writeAscii(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}

export const audioRecorder = new AudioRecorder();
