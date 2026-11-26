/** Random-access, read-only bytes: a file, a Blob, a PAK entry or memory. */
export interface ByteSource {
  readonly size: number;
  /** Reads exactly `length` bytes at `offset`; throws if the range is outside the source. */
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function checkRange(offset: number, length: number, size: number): void {
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > size) {
    throw new RangeError(`range ${offset}+${length} is outside ${size} bytes`);
  }
}

export function memorySource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    async read(offset, length) {
      checkRange(offset, length, bytes.length);
      return bytes.subarray(offset, offset + length);
    },
  };
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(offset, length) {
      checkRange(offset, length, blob.size);
      return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
    },
  };
}

/** A window into another source, e.g. one file inside a PAK. */
export function sliceSource(parent: ByteSource, start: number, size: number): ByteSource {
  checkRange(start, size, parent.size);
  return {
    size,
    async read(offset, length) {
      checkRange(offset, length, size);
      return parent.read(start + offset, length);
    },
  };
}

/** Little-endian accessor. Every read is bounds checked by DataView. */
export class View {
  readonly bytes: Uint8Array;
  private readonly data: DataView;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.length;
  }

  /** True when `length` bytes starting at `offset` lie inside the buffer. */
  has(offset: number, length: number): boolean {
    return offset >= 0 && length >= 0 && offset + length <= this.length;
  }

  u8(offset: number): number {
    return this.data.getUint8(offset);
  }
  i16(offset: number): number {
    return this.data.getInt16(offset, true);
  }
  u16(offset: number): number {
    return this.data.getUint16(offset, true);
  }
  i32(offset: number): number {
    return this.data.getInt32(offset, true);
  }
  u32(offset: number): number {
    return this.data.getUint32(offset, true);
  }
  f32(offset: number): number {
    return this.data.getFloat32(offset, true);
  }

  /** NUL-terminated byte string in a fixed-width field (Latin-1, no replacement). */
  cstring(offset: number, width: number): { text: string; terminated: boolean } {
    checkRange(offset, width, this.length);
    let text = "";
    for (let i = offset; i < offset + width; i++) {
      const c = this.bytes[i]!;
      if (c === 0) return { text, terminated: true };
      text += String.fromCharCode(c);
    }
    return { text, terminated: false };
  }
}

export function hexPreview(bytes: Uint8Array, count = 16): string {
  return Array.from(bytes.subarray(0, count), (b) => b.toString(16).padStart(2, "0")).join(" ");
}
