import { describe, it, expect } from "vitest";

import {
  float32ToPcm16,
  pcm16ToFloat32,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "./audio";

describe("float32ToPcm16", () => {
  it("converts silence (zeros) correctly", () => {
    const input = new Float32Array([0, 0, 0]);
    const result = new Int16Array(float32ToPcm16(input));
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
  });

  it("converts max positive value", () => {
    const input = new Float32Array([1.0]);
    const result = new Int16Array(float32ToPcm16(input));
    expect(result[0]).toBe(0x7fff);
  });

  it("converts max negative value", () => {
    const input = new Float32Array([-1.0]);
    const result = new Int16Array(float32ToPcm16(input));
    expect(result[0]).toBe(-0x8000);
  });

  it("clamps values above 1.0", () => {
    const input = new Float32Array([2.0]);
    const result = new Int16Array(float32ToPcm16(input));
    expect(result[0]).toBe(0x7fff);
  });

  it("clamps values below -1.0", () => {
    const input = new Float32Array([-2.0]);
    const result = new Int16Array(float32ToPcm16(input));
    expect(result[0]).toBe(-0x8000);
  });
});

describe("pcm16ToFloat32", () => {
  it("converts silence correctly", () => {
    const pcm = new Int16Array([0, 0]).buffer;
    const result = pcm16ToFloat32(pcm);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
  });

  it("roundtrips with float32ToPcm16 within tolerance", () => {
    const original = new Float32Array([0.5, -0.5, 0.0, 0.25]);
    const pcm = float32ToPcm16(original);
    const roundtripped = pcm16ToFloat32(pcm);
    for (let i = 0; i < original.length; i++) {
      const orig = original[i] ?? 0;
      const rt = roundtripped[i] ?? 0;
      expect(Math.abs(orig - rt)).toBeLessThan(0.001);
    }
  });
});

describe("arrayBufferToBase64 and base64ToArrayBuffer", () => {
  it("roundtrips a buffer correctly", () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const base64 = arrayBufferToBase64(original.buffer);
    expect(base64).toBe("SGVsbG8=");

    const decoded = new Uint8Array(base64ToArrayBuffer(base64));
    expect(decoded).toEqual(original);
  });

  it("handles empty buffer", () => {
    const original = new Uint8Array([]);
    const base64 = arrayBufferToBase64(original.buffer);
    expect(base64).toBe("");

    const decoded = new Uint8Array(base64ToArrayBuffer(base64));
    expect(decoded.length).toBe(0);
  });
});
