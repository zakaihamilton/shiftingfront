export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export function mat4Create(): Mat4 {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function mat4Identity(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function mat4Copy(out: Mat4, a: Mat4): Mat4 {
  out.set(a);
  return out;
}

export function mat4Multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  return out;
}

export function mat4Ortho(
  out: Mat4,
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Mat4 {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = -2 * lr;
  out[5] = -2 * bt;
  out[10] = 2 * nf;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}

export function mat4FromRotationTranslationScale(
  out: Mat4,
  q: Quat,
  v: Vec3,
  s: Vec3,
): Mat4 {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const sx = s[0], sy = s[1], sz = s[2];

  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}

export function quatCreate(): Quat {
  return [0, 0, 0, 1];
}

export function quatFromYawPitchRoll(out: Quat, yaw: number, pitch = 0, roll = 0): Quat {
  const halfYaw = yaw * 0.5;
  const halfPitch = pitch * 0.5;
  const halfRoll = roll * 0.5;

  const cy = Math.cos(halfYaw);
  const sy = Math.sin(halfYaw);
  const cp = Math.cos(halfPitch);
  const sp = Math.sin(halfPitch);
  const cr = Math.cos(halfRoll);
  const sr = Math.sin(halfRoll);

  // Qz(yaw) * Qy(pitch) * Qx(roll)
  out[0] = sy * sp * cr + cy * cp * sr;
  out[1] = cy * sp * cr + sy * cp * sr;
  out[2] = sy * cp * cr - cy * sp * sr;
  out[3] = cy * cp * cr - sy * sp * sr;
  return out;
}

export function quatFromEuler(out: Quat, pitch: number, yaw: number, roll: number): Quat {
  return quatFromYawPitchRoll(out, yaw, pitch, roll);
}

export function quatFromAxisAngle(out: Quat, axis: Vec3, rad: number): Quat {
  const half = rad * 0.5;
  const s = Math.sin(half);
  out[0] = s * axis[0];
  out[1] = s * axis[1];
  out[2] = s * axis[2];
  out[3] = Math.cos(half);
  return out;
}

export function quatSlerp(out: Quat, a: Quat, b: Quat, t: number): Quat {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];

  let cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw;
  if (cosHalfTheta < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    cosHalfTheta = -cosHalfTheta;
  }

  if (Math.abs(cosHalfTheta) >= 1.0) {
    out[0] = ax;
    out[1] = ay;
    out[2] = az;
    out[3] = aw;
    return out;
  }

  const halfTheta = Math.acos(cosHalfTheta);
  const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);
  if (Math.abs(sinHalfTheta) < 0.001) {
    out[0] = ax * 0.5 + bx * 0.5;
    out[1] = ay * 0.5 + by * 0.5;
    out[2] = az * 0.5 + bz * 0.5;
    out[3] = aw * 0.5 + bw * 0.5;
    return out;
  }

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
  out[0] = ax * ratioA + bx * ratioB;
  out[1] = ay * ratioA + by * ratioB;
  out[2] = az * ratioA + bz * ratioB;
  out[3] = aw * ratioA + bw * ratioB;
  return out;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}

/**
 * Creates an orthographic camera View-Projection matrix that projects 3D world coordinates
 * (where +X is right-down tile axis, +Y is left-down tile axis, and +Z is elevation up)
 * directly into WebGL clip space matching the 2D canvas isometric view.
 */
export function createIsoViewProjMatrix(
  out: Mat4,
  screenW: number,
  screenH: number,
  camX: number,
  camY: number,
  zoom: number,
): Mat4 {
  const ortho = mat4Create();
  mat4Ortho(ortho, 0, screenW, screenH, 0, -3000, 3000);

  const view = mat4Create();
  // Pixel mapping:
  // sx = (x - y) * 32 * zoom + camX
  // sy = (x + y) * 16 * zoom + camY - z * 22 * zoom
  // depth = (x + y) * 10 - z * 20
  view[0] = 32 * zoom;
  view[1] = 16 * zoom;
  view[2] = 10;
  view[3] = 0;

  view[4] = -32 * zoom;
  view[5] = 16 * zoom;
  view[6] = 10;
  view[7] = 0;

  view[8] = 0;
  view[9] = -22 * zoom;
  view[10] = -20;
  view[11] = 0;

  view[12] = camX;
  view[13] = camY;
  view[14] = 0;
  view[15] = 1;

  mat4Multiply(out, ortho, view);
  return out;
}
