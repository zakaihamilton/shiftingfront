import { describe, expect, it } from "vitest";
import {
  createIsoViewProjMatrix,
  lerpAngle,
  mat4Create,
  mat4FromRotationTranslationScale,
  mat4Identity,
  mat4Multiply,
  quatCreate,
  quatFromAxisAngle,
  quatFromEuler,
  quatSlerp,
} from "../../lib/render/gl/glMath";

describe("glMath 3D math and isometric utilities", () => {
  it("creates identity matrices and multiplies correctly", () => {
    const a = mat4Create();
    const b = mat4Create();
    const out = mat4Create();

    mat4Identity(a);
    mat4Identity(b);
    mat4Multiply(out, a, b);

    expect(out[0]).toBe(1);
    expect(out[5]).toBe(1);
    expect(out[10]).toBe(1);
    expect(out[15]).toBe(1);
  });

  it("handles quaternion rotations and slerp interpolation", () => {
    const qA = quatCreate();
    const qB = quatCreate();
    const qOut = quatCreate();

    quatFromAxisAngle(qA, [0, 0, 1], 0);
    quatFromAxisAngle(qB, [0, 0, 1], Math.PI);

    quatSlerp(qOut, qA, qB, 0.5);
    // At t=0.5 between 0 and PI, angle should be PI/2 (z = sin(PI/4) ~ 0.7071, w = cos(PI/4) ~ 0.7071)
    expect(qOut[2]).toBeCloseTo(Math.SQRT1_2, 3);
    expect(qOut[3]).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("computes Euler angle quaternions properly", () => {
    const q = quatCreate();
    quatFromEuler(q, 0, Math.PI * 0.5, 0);
    expect(q[2]).toBeCloseTo(Math.SQRT1_2, 3);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("smoothly wraps and lerps angles across 0 / 2*PI boundary", () => {
    const a = 0.1;
    const b = Math.PI * 2 - 0.1;
    const mid = lerpAngle(a, b, 0.5);
    // Shortest path between 0.1 and (2*PI - 0.1) is through 0 -> midpoint is 0
    expect(Math.abs(mid) < 0.0001 || Math.abs(mid - Math.PI * 2) < 0.0001).toBe(true);
  });

  it("creates valid isometric View-Projection matrices", () => {
    const vp = mat4Create();
    createIsoViewProjMatrix(vp, 800, 600, 400, 300, 1.0);
    expect(vp.some((val) => isNaN(val))).toBe(false);
    expect(vp[15]).toBe(1);
  });

  it("creates transform matrices from rotation, translation, and scale", () => {
    const mat = mat4Create();
    const q = quatCreate();
    quatFromAxisAngle(q, [0, 0, 1], Math.PI / 2);
    mat4FromRotationTranslationScale(mat, q, [10, 20, 5], [2, 2, 2]);

    expect(mat[12]).toBe(10);
    expect(mat[13]).toBe(20);
    expect(mat[14]).toBe(5);
    expect(mat[15]).toBe(1);
  });
});
