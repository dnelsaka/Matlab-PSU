import { clamp, interpolateAtZ } from "../utils/math.js";

function sortByZ(points) {
  return [...points].sort((a, b) => a.z - b.z);
}

function interpolateByY(points, yTarget) {
  if (!points || points.length < 2) {
    return null;
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const y1 = p1.y;
    const y2 = p2.y;

    if ((yTarget >= y1 && yTarget <= y2) || (yTarget <= y1 && yTarget >= y2)) {
      const denom = y2 - y1;
      const t = Math.abs(denom) < 1e-9 ? 0 : (yTarget - y1) / denom;
      return {
        x: p1.x + (p2.x - p1.x) * t,
        y: yTarget,
        z: p1.z + (p2.z - p1.z) * t,
      };
    }
  }

  return null;
}

export class SurfaceEngine {
  constructor() {
    this.cache = {
      version: -1,
      optionsKey: "",
      surface: null,
      derived: null,
    };
  }

  generateSurface(model, curveEngine, options = {}) {
    const longitudinalSamples = options.longitudinalSamples ?? 80;
    const verticalSamples = options.verticalSamples ?? 36;
    const optionsKey = `${longitudinalSamples}-${verticalSamples}`;

    if (
      this.cache.version === model.version &&
      this.cache.optionsKey === optionsKey &&
      this.cache.surface
    ) {
      return this.cache.surface;
    }

    const stationSections = model.stations.map((station, stationIndex) => {
      const starControls = model.getSectionControlPoints(stationIndex, "starboard");
      const portControls = model.getSectionControlPoints(stationIndex, "port");

      const sampledStar = sortByZ(
        curveEngine.sampleBSpline(starControls, 3, Math.max(2, verticalSamples - 1))
      );
      const sampledPort = sortByZ(
        curveEngine.sampleBSpline(portControls, 3, Math.max(2, verticalSamples - 1))
      );

      return {
        stationIndex,
        x: station.x,
        starboard: sampledStar,
        port: sampledPort,
      };
    });

    const rowsStar = [];
    const rowsPort = [];

    for (let k = 0; k < verticalSamples; k += 1) {
      const rowControlsStar = stationSections.map((section) => section.starboard[k]);
      const rowControlsPort = stationSections.map((section) => section.port[k]);

      rowsStar.push(
        curveEngine.sampleBSpline(rowControlsStar, 3, Math.max(2, longitudinalSamples - 1))
      );
      rowsPort.push(
        curveEngine.sampleBSpline(rowControlsPort, 3, Math.max(2, longitudinalSamples - 1))
      );
    }

    const starboardGrid = Array.from({ length: longitudinalSamples }, () =>
      Array.from({ length: verticalSamples })
    );
    const portGrid = Array.from({ length: longitudinalSamples }, () =>
      Array.from({ length: verticalSamples })
    );

    for (let j = 0; j < longitudinalSamples; j += 1) {
      for (let k = 0; k < verticalSamples; k += 1) {
        starboardGrid[j][k] = rowsStar[k][j];
        portGrid[j][k] = rowsPort[k][j];
      }
    }

    const mesh = this.buildClosedMesh(starboardGrid, portGrid);

    const surface = {
      stationSections,
      starboardGrid,
      portGrid,
      vertices: mesh.vertices,
      indices: mesh.indices,
      longitudinalSamples,
      verticalSamples,
      bounds: this.computeBounds(starboardGrid, portGrid),
    };

    this.cache = {
      version: model.version,
      optionsKey,
      surface,
      derived: null,
    };

    return surface;
  }

  computeBounds(starGrid, portGrid) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const section of starGrid) {
      for (const p of section) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
    }

    for (const section of portGrid) {
      for (const p of section) {
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
    };
  }

  buildClosedMesh(starboardGrid, portGrid) {
    const longCount = starboardGrid.length;
    const vertCount = starboardGrid[0].length;

    const vertices = [];
    const indices = [];

    const addVertex = (point) => {
      vertices.push(point.x, point.y, point.z);
      return vertices.length / 3 - 1;
    };

    const addQuad = (p0, p1, p2, p3, flip = false) => {
      const i0 = addVertex(p0);
      const i1 = addVertex(p1);
      const i2 = addVertex(p2);
      const i3 = addVertex(p3);

      if (!flip) {
        indices.push(i0, i1, i3, i1, i2, i3);
      } else {
        indices.push(i0, i3, i1, i1, i3, i2);
      }
    };

    for (let j = 0; j < longCount - 1; j += 1) {
      for (let k = 0; k < vertCount - 1; k += 1) {
        addQuad(
          starboardGrid[j][k],
          starboardGrid[j + 1][k],
          starboardGrid[j + 1][k + 1],
          starboardGrid[j][k + 1],
          false
        );

        addQuad(
          portGrid[j][k],
          portGrid[j + 1][k],
          portGrid[j + 1][k + 1],
          portGrid[j][k + 1],
          true
        );
      }
    }

    const kDeck = vertCount - 1;
    const kKeel = 0;

    for (let j = 0; j < longCount - 1; j += 1) {
      addQuad(
        starboardGrid[j][kDeck],
        starboardGrid[j + 1][kDeck],
        portGrid[j + 1][kDeck],
        portGrid[j][kDeck],
        false
      );

      addQuad(
        starboardGrid[j][kKeel],
        portGrid[j][kKeel],
        portGrid[j + 1][kKeel],
        starboardGrid[j + 1][kKeel],
        false
      );
    }

    this.addCap(starboardGrid, portGrid, 0, addVertex, indices, true);
    this.addCap(starboardGrid, portGrid, longCount - 1, addVertex, indices, false);

    return { vertices, indices };
  }

  addCap(starboardGrid, portGrid, sectionIndex, addVertex, indices, reverse) {
    const ring = [];

    for (const point of starboardGrid[sectionIndex]) {
      ring.push(point);
    }
    for (let i = portGrid[sectionIndex].length - 1; i >= 0; i -= 1) {
      ring.push(portGrid[sectionIndex][i]);
    }

    const centroid = ring.reduce(
      (acc, p) => ({
        x: acc.x + p.x / ring.length,
        y: acc.y + p.y / ring.length,
        z: acc.z + p.z / ring.length,
      }),
      { x: 0, y: 0, z: 0 }
    );

    const cIdx = addVertex(centroid);

    for (let i = 0; i < ring.length; i += 1) {
      const aIdx = addVertex(ring[i]);
      const bIdx = addVertex(ring[(i + 1) % ring.length]);
      if (reverse) {
        indices.push(cIdx, bIdx, aIdx);
      } else {
        indices.push(cIdx, aIdx, bIdx);
      }
    }
  }

  getSectionAtLongitudinalIndex(surface, index) {
    const idx = clamp(index, 0, surface.longitudinalSamples - 1);
    return {
      starboard: surface.starboardGrid[idx],
      port: surface.portGrid[idx],
    };
  }

  getInterpolatedSectionAtX(surface, xTarget) {
    const longCount = surface.longitudinalSamples;
    const x0 = surface.starboardGrid[0][0].x;
    const x1 = surface.starboardGrid[longCount - 1][0].x;
    const tGlobal = clamp((xTarget - x0) / Math.max(1e-9, x1 - x0), 0, 1);

    const scaled = tGlobal * (longCount - 1);
    const i0 = Math.floor(scaled);
    const i1 = Math.min(longCount - 1, i0 + 1);
    const localT = scaled - i0;

    const interpolateSection = (grid) =>
      grid[i0].map((p, k) => {
        const q = grid[i1][k];
        return {
          x: p.x + (q.x - p.x) * localT,
          y: p.y + (q.y - p.y) * localT,
          z: p.z + (q.z - p.z) * localT,
        };
      });

    return {
      starboard: interpolateSection(surface.starboardGrid),
      port: interpolateSection(surface.portGrid),
    };
  }

  getWaterlineCurve(surface, zTarget) {
    const starboard = [];
    const port = [];

    for (let j = 0; j < surface.longitudinalSamples; j += 1) {
      const starSection = sortByZ(surface.starboardGrid[j]);
      const portSection = sortByZ(surface.portGrid[j]);

      const x = starSection[Math.floor(starSection.length * 0.5)].x;
      const yStar = interpolateAtZ(starSection, zTarget, "y");
      const yPort = interpolateAtZ(portSection, zTarget, "y");

      starboard.push({ x, y: yStar, z: zTarget });
      port.push({ x, y: yPort, z: zTarget });
    }

    return { starboard, port, z: zTarget };
  }

  getButtockCurve(surface, yTarget, side = "starboard") {
    const curve = [];
    const signedTarget = side === "port" ? -Math.abs(yTarget) : Math.abs(yTarget);

    for (let j = 0; j < surface.longitudinalSamples; j += 1) {
      const section = side === "port" ? surface.portGrid[j] : surface.starboardGrid[j];
      const point = interpolateByY(section, signedTarget);
      if (point) {
        curve.push(point);
      }
    }

    return curve;
  }

  buildDerivedLines(model, curveEngine, surface, options = {}) {
    const waterlineCount = options.waterlineCount ?? 7;
    const buttockCount = options.buttockCount ?? 6;

    const stationCurves = model.stations.map((_, stationIndex) => ({
      stationIndex,
      x: model.stations[stationIndex].x,
      starboard: curveEngine.sampleBSpline(
        model.getSectionControlPoints(stationIndex, "starboard"),
        3,
        70
      ),
      port: curveEngine.sampleBSpline(
        model.getSectionControlPoints(stationIndex, "port"),
        3,
        70,
      ),
    }));

    const waterlines = [];
    for (let i = 1; i <= waterlineCount; i += 1) {
      const z = (i / (waterlineCount + 1)) * model.depth;
      waterlines.push(this.getWaterlineCurve(surface, z));
    }

    const buttocks = [];
    const maxHalfBreadth = model.beam * 0.5;

    for (let i = 1; i <= buttockCount; i += 1) {
      const y = (i / (buttockCount + 1)) * maxHalfBreadth;
      buttocks.push({
        y,
        starboard: this.getButtockCurve(surface, y, "starboard"),
        port: this.getButtockCurve(surface, y, "port"),
      });
    }

    return {
      stations: stationCurves,
      waterlines,
      buttocks,
    };
  }
}
