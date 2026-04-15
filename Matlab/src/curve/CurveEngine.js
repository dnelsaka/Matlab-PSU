import { clamp } from "../utils/math.js";

function clonePoint(point) {
  return {
    x: point.x ?? 0,
    y: point.y ?? 0,
    z: point.z ?? 0,
  };
}

function addScaled(a, b, scale) {
  return {
    x: a.x + b.x * scale,
    y: a.y + b.y * scale,
    z: a.z + b.z * scale,
  };
}

function subtract(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

function length2D(v) {
  return Math.hypot(v.x, v.y);
}

function normalize2D(v) {
  const mag = Math.hypot(v.x, v.y) || 1;
  return {
    x: v.x / mag,
    y: v.y / mag,
  };
}

export class CurveEngine {
  sampleBezier(controlPoints, samples = 40) {
    if (!controlPoints || controlPoints.length < 2) {
      return [];
    }

    const result = [];
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      result.push(this.evaluateBezier(controlPoints, t));
    }
    return result;
  }

  evaluateBezier(controlPoints, t) {
    const pts = controlPoints.map(clonePoint);
    const n = pts.length;

    for (let r = 1; r < n; r += 1) {
      for (let i = 0; i < n - r; i += 1) {
        pts[i] = {
          x: (1 - t) * pts[i].x + t * pts[i + 1].x,
          y: (1 - t) * pts[i].y + t * pts[i + 1].y,
          z: (1 - t) * pts[i].z + t * pts[i + 1].z,
        };
      }
    }

    return pts[0];
  }

  sampleBSpline(controlPoints, degree = 3, samples = 60) {
    if (!controlPoints || controlPoints.length < 2) {
      return [];
    }

    if (controlPoints.length <= degree) {
      return this.sampleLinear(controlPoints, samples);
    }

    const result = [];
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      result.push(this.evaluateBSpline(controlPoints, degree, t));
    }

    return result;
  }

  sampleLinear(controlPoints, samples = 40) {
    const result = [];
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const scaled = t * (controlPoints.length - 1);
      const idx = Math.floor(scaled);
      const next = Math.min(controlPoints.length - 1, idx + 1);
      const localT = scaled - idx;
      const p0 = clonePoint(controlPoints[idx]);
      const p1 = clonePoint(controlPoints[next]);
      result.push({
        x: p0.x + (p1.x - p0.x) * localT,
        y: p0.y + (p1.y - p0.y) * localT,
        z: p0.z + (p1.z - p0.z) * localT,
      });
    }
    return result;
  }

  evaluateBSpline(controlPoints, degree = 3, t = 0) {
    const n = controlPoints.length - 1;
    const d = Math.min(degree, n);
    const knots = this.buildClampedUniformKnots(n, d);
    const uMin = knots[d];
    const uMax = knots[n + 1];

    const u = uMin + clamp(t, 0, 1) * (uMax - uMin);
    const span = this.findKnotSpan(n, d, u, knots);

    const deBoorPoints = [];
    for (let j = 0; j <= d; j += 1) {
      deBoorPoints.push(clonePoint(controlPoints[span - d + j]));
    }

    for (let r = 1; r <= d; r += 1) {
      for (let j = d; j >= r; j -= 1) {
        const idx = span - d + j;
        const left = knots[idx];
        const right = knots[idx + d - r + 1];
        const denom = right - left;
        const alpha = Math.abs(denom) < 1e-9 ? 0 : (u - left) / denom;
        const pA = deBoorPoints[j - 1];
        const pB = deBoorPoints[j];
        deBoorPoints[j] = addScaled(
          {
            x: pA.x * (1 - alpha),
            y: pA.y * (1 - alpha),
            z: pA.z * (1 - alpha),
          },
          pB,
          alpha
        );
      }
    }

    return deBoorPoints[d];
  }

  buildClampedUniformKnots(n, degree) {
    const knotCount = n + degree + 2;
    const knots = new Array(knotCount).fill(0);
    const maxInternal = n - degree;

    for (let i = 0; i < knotCount; i += 1) {
      if (i <= degree) {
        knots[i] = 0;
      } else if (i >= n + 1) {
        knots[i] = 1;
      } else {
        knots[i] = (i - degree) / (maxInternal + 1);
      }
    }

    return knots;
  }

  findKnotSpan(n, degree, u, knots) {
    if (u >= knots[n + 1]) {
      return n;
    }

    let low = degree;
    let high = n + 1;
    let mid = Math.floor((low + high) / 2);

    while (u < knots[mid] || u >= knots[mid + 1]) {
      if (u < knots[mid]) {
        high = mid;
      } else {
        low = mid;
      }
      mid = Math.floor((low + high) / 2);
    }

    return mid;
  }

  computeCurvatureComb2D(points, scale = 0.35, maxLength = 0.8) {
    if (!points || points.length < 3) {
      return [];
    }

    const comb = [];

    for (let i = 1; i < points.length - 1; i += 1) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];

      const v1 = subtract(p1, p0);
      const v2 = subtract(p2, p1);
      const chord = subtract(p2, p0);

      const a = Math.max(1e-9, length2D(v1));
      const b = Math.max(1e-9, length2D(v2));
      const c = Math.max(1e-9, length2D(chord));

      const area2 = v1.x * v2.y - v1.y * v2.x;
      const curvature = (2 * area2) / (a * b * c);

      const tangent = normalize2D(chord);
      const normal = {
        x: -tangent.y,
        y: tangent.x,
      };

      const rawLength = curvature * scale;
      const combLength = clamp(rawLength, -maxLength, maxLength);

      comb.push({
        base: { x: p1.x, y: p1.y },
        tip: {
          x: p1.x + normal.x * combLength,
          y: p1.y + normal.y * combLength,
        },
        curvature,
      });
    }

    return comb;
  }
}
