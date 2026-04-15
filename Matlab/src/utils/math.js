export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function inverseLerp(a, b, value) {
  if (Math.abs(b - a) < 1e-9) {
    return 0;
  }
  return (value - a) / (b - a);
}

export function snap(value, step) {
  if (!step || step <= 0) {
    return value;
  }
  return Math.round(value / step) * step;
}

export function integrateTrapezoid(xs, ys) {
  if (!xs || !ys || xs.length !== ys.length || xs.length < 2) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const dx = xs[i + 1] - xs[i];
    sum += 0.5 * (ys[i] + ys[i + 1]) * dx;
  }
  return sum;
}

export function interpolateAtZ(points, zTarget, valueKey = "y") {
  if (!points || points.length < 2) {
    return 0;
  }

  const zMin = points[0].z;
  const zMax = points[points.length - 1].z;

  if (zTarget <= zMin) {
    return points[0][valueKey];
  }

  if (zTarget >= zMax) {
    return points[points.length - 1][valueKey];
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (zTarget >= p1.z && zTarget <= p2.z) {
      const t = inverseLerp(p1.z, p2.z, zTarget);
      return lerp(p1[valueKey], p2[valueKey], t);
    }
  }

  return points[points.length - 1][valueKey];
}

export function vecSub(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

export function vecCross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vecNormalize(v) {
  const mag = Math.hypot(v.x, v.y, v.z) || 1;
  return {
    x: v.x / mag,
    y: v.y / mag,
    z: v.z / mag,
  };
}

export function triangleNormal(a, b, c) {
  const ab = vecSub(b, a);
  const ac = vecSub(c, a);
  return vecNormalize(vecCross(ab, ac));
}

export function cloneDeepJSON(value) {
  return JSON.parse(JSON.stringify(value));
}
