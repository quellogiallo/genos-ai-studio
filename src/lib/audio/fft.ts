/** FFT radix-2 in-place (reale+immaginaria), con tabelle precalcolate per dimensione. */
export class FFT {
  readonly n: number
  private cos: Float32Array
  private sin: Float32Array
  private rev: Uint32Array
  readonly window: Float32Array

  constructor(n: number) {
    if (n & (n - 1)) throw new Error('FFT: la dimensione deve essere potenza di 2')
    this.n = n
    this.cos = new Float32Array(n / 2)
    this.sin = new Float32Array(n / 2)
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n)
      this.sin[i] = -Math.sin((2 * Math.PI * i) / n)
    }
    this.rev = new Uint32Array(n)
    const bits = Math.log2(n)
    for (let i = 0; i < n; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
      this.rev[i] = r
    }
    // finestra di Hann
    this.window = new Float32Array(n)
    for (let i = 0; i < n; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  }

  transform(re: Float32Array, im: Float32Array) {
    const n = this.n
    for (let i = 0; i < n; i++) {
      const j = this.rev[i]
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t
        t = im[i]; im[i] = im[j]; im[j] = t
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1
      const step = n / size
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half
          const tr = re[b] * this.cos[k] - im[b] * this.sin[k]
          const ti = re[b] * this.sin[k] + im[b] * this.cos[k]
          re[b] = re[a] - tr; im[b] = im[a] - ti
          re[a] += tr; im[a] += ti
        }
      }
    }
  }

  /** Spettro di potenza (|X|²) del frame finestrato, bin 0..n/2. */
  power(src: Float32Array, offset: number, out: Float32Array, re: Float32Array, im: Float32Array) {
    const n = this.n
    for (let i = 0; i < n; i++) {
      const idx = offset + i
      re[i] = (idx < src.length ? src[idx] : 0) * this.window[i]
      im[i] = 0
    }
    this.transform(re, im)
    for (let i = 0; i <= n / 2; i++) out[i] = re[i] * re[i] + im[i] * im[i]
  }
}
