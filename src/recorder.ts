export class CanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly fps: number,
  ) {}

  get isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  start(): void {
    if (this.isRecording) return;
    if (!('MediaRecorder' in window) || !this.canvas.captureStream) {
      throw new Error('このブラウザはCanvas録画に対応していません。ChromeまたはEdgeを利用してください。');
    }

    this.chunks = [];
    const stream = this.canvas.captureStream(this.fps);
    const mimeType = this.pickMimeType();
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start(500);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === 'inactive') {
        reject(new Error('録画は開始されていません。'));
        return;
      }
      const recorder = this.recorder;
      recorder.addEventListener(
        'stop',
        () => resolve(new Blob(this.chunks, { type: recorder.mimeType || 'video/webm' })),
        { once: true },
      );
      recorder.stop();
    });
  }

  download(blob: Blob, filename = 'sim-base-experiment.webm'): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  private pickMimeType(): string {
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
  }
}
