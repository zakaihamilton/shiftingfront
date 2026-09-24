export class MinHeap {
  private xs = new Float64Array(64);
  private ys = new Float64Array(64);
  private gs = new Float64Array(64);
  private fs = new Float64Array(64);
  private seqs = new Float64Array(64);
  private size = 0;
  x = 0;
  y = 0;
  g = 0;
  f = 0;
  seq = 0;

  get length(): number {
    return this.size;
  }

  clear(): void {
    this.size = 0;
  }

  push(x: number, y: number, g: number, f: number, seq: number): void {
    let index = this.size;
    this.ensureCapacity(index + 1);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      const parentF = this.fs[parent]!;
      const parentSeq = this.seqs[parent]!;
      if (parentF < f || (parentF === f && parentSeq <= seq)) break;
      this.xs[index] = this.xs[parent]!;
      this.ys[index] = this.ys[parent]!;
      this.gs[index] = this.gs[parent]!;
      this.fs[index] = parentF;
      this.seqs[index] = parentSeq;
      index = parent;
    }
    this.xs[index] = x;
    this.ys[index] = y;
    this.gs[index] = g;
    this.fs[index] = f;
    this.seqs[index] = seq;
    this.size += 1;
  }

  pop(): boolean {
    const n = this.size;
    if (!n) return false;
    this.x = this.xs[0]!;
    this.y = this.ys[0]!;
    this.g = this.gs[0]!;
    this.f = this.fs[0]!;
    this.seq = this.seqs[0]!;
    const last = n - 1;
    this.size = last;
    if (last === 0) return true;

    const lastX = this.xs[last]!;
    const lastY = this.ys[last]!;
    const lastG = this.gs[last]!;
    const lastF = this.fs[last]!;
    const lastSeq = this.seqs[last]!;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= last) break;
      const right = left + 1;
      let child = left;
      if (right < last) {
        const leftF = this.fs[left]!;
        const rightF = this.fs[right]!;
        if (rightF < leftF || (rightF === leftF && this.seqs[right]! < this.seqs[left]!)) child = right;
      }
      const childF = this.fs[child]!;
      const childSeq = this.seqs[child]!;
      if (childF > lastF || (childF === lastF && childSeq >= lastSeq)) break;
      this.xs[index] = this.xs[child]!;
      this.ys[index] = this.ys[child]!;
      this.gs[index] = this.gs[child]!;
      this.fs[index] = childF;
      this.seqs[index] = childSeq;
      index = child;
    }
    this.xs[index] = lastX;
    this.ys[index] = lastY;
    this.gs[index] = lastG;
    this.fs[index] = lastF;
    this.seqs[index] = lastSeq;
    return true;
  }

  private ensureCapacity(required: number): void {
    if (required <= this.fs.length) return;
    const capacity = Math.max(required, this.fs.length * 2);
    const xs = new Float64Array(capacity);
    const ys = new Float64Array(capacity);
    const gs = new Float64Array(capacity);
    const fs = new Float64Array(capacity);
    const seqs = new Float64Array(capacity);
    xs.set(this.xs);
    ys.set(this.ys);
    gs.set(this.gs);
    fs.set(this.fs);
    seqs.set(this.seqs);
    this.xs = xs;
    this.ys = ys;
    this.gs = gs;
    this.fs = fs;
    this.seqs = seqs;
  }
}
