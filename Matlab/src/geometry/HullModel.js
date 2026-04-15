import { EventEmitter } from "../core/EventEmitter.js";
import { clamp, cloneDeepJSON } from "../utils/math.js";

function buildDefaultStations({ length, beam, depth, stationCount, levelCount }) {
  const stations = [];
  const halfBeam = beam * 0.5;

  for (let si = 0; si < stationCount; si += 1) {
    const xRatio = si / (stationCount - 1);
    const x = xRatio * length;

    const longitudinalFullness =
      Math.pow(Math.sin(Math.PI * xRatio), 0.78) * (0.82 + 0.18 * (1 - xRatio));

    const points = [];

    for (let li = 0; li < levelCount; li += 1) {
      const zRatio = li / (levelCount - 1);
      const z = zRatio * depth;

      const verticalShape = Math.pow(
        Math.max(0, 1 - Math.pow((zRatio - 0.54) / 0.56, 2)),
        0.58
      );

      const deckTaper = 1 - 0.2 * Math.pow(zRatio, 1.8);
      const keelRise = li === 0 ? 0.012 * beam * Math.pow(longitudinalFullness, 0.9) : 0;
      const halfBreadth = Math.max(
        0,
        halfBeam * longitudinalFullness * verticalShape * deckTaper + keelRise
      );

      points.push({
        id: `${si}-${li}`,
        z,
        yStarboard: halfBreadth,
        yPort: -halfBreadth,
      });
    }

    stations.push({
      id: `S${si + 1}`,
      x,
      points,
    });
  }

  return stations;
}

export class HullModel extends EventEmitter {
  constructor(options = {}) {
    super();

    this.meta = {
      name: options.name ?? "New Hull",
      units: options.units ?? "m",
    };

    this.length = options.length ?? 120;
    this.beam = options.beam ?? 18;
    this.depth = options.depth ?? 12;
    this.stationCount = options.stationCount ?? 13;
    this.levelCount = options.levelCount ?? 9;

    this.symmetry = options.symmetry ?? true;
    this.draft = options.draft ?? this.depth * 0.62;

    this.stations = options.stations
      ? cloneDeepJSON(options.stations)
      : buildDefaultStations({
          length: this.length,
          beam: this.beam,
          depth: this.depth,
          stationCount: this.stationCount,
          levelCount: this.levelCount,
        });

    if (this.symmetry) {
      this.enforceSymmetry(false);
    }

    this.version = 0;
  }

  static createDefault(options = {}) {
    return new HullModel(options);
  }

  getState() {
    return {
      meta: cloneDeepJSON(this.meta),
      length: this.length,
      beam: this.beam,
      depth: this.depth,
      stationCount: this.stationCount,
      levelCount: this.levelCount,
      symmetry: this.symmetry,
      draft: this.draft,
      stations: cloneDeepJSON(this.stations),
    };
  }

  setState(nextState, emitChange = true) {
    this.meta = cloneDeepJSON(nextState.meta ?? this.meta);
    this.length = nextState.length;
    this.beam = nextState.beam;
    this.depth = nextState.depth;
    this.stationCount = nextState.stationCount;
    this.levelCount = nextState.levelCount;
    this.symmetry = nextState.symmetry;
    this.draft = nextState.draft;
    this.stations = cloneDeepJSON(nextState.stations);

    if (this.symmetry) {
      this.enforceSymmetry(false);
    }

    this.markChanged(emitChange ? "set-state" : null);
  }

  toJSON() {
    return this.getState();
  }

  markChanged(reason = "geometry") {
    this.version += 1;
    if (reason) {
      this.emit("change", { reason, version: this.version });
    }
  }

  setDraft(draft) {
    this.draft = clamp(draft, 0.01, this.depth * 1.5);
    this.markChanged("draft");
  }

  setSymmetry(enabled) {
    this.symmetry = Boolean(enabled);
    if (this.symmetry) {
      this.enforceSymmetry(false);
    }
    this.markChanged("symmetry");
  }

  enforceSymmetry(emit = true) {
    for (const station of this.stations) {
      for (const point of station.points) {
        point.yPort = -Math.abs(point.yStarboard);
        point.yStarboard = Math.abs(point.yStarboard);
      }
    }

    if (emit) {
      this.markChanged("enforce-symmetry");
    }
  }

  setMainDimensions({ length, beam, depth }, emit = true) {
    if (Number.isFinite(length) && length > 1) {
      this.length = length;
    }
    if (Number.isFinite(beam) && beam > 0.1) {
      this.beam = beam;
    }
    if (Number.isFinite(depth) && depth > 0.1) {
      this.depth = depth;
    }

    this.draft = clamp(this.draft, 0.01, this.depth * 1.5);

    if (emit) {
      this.markChanged("dimensions");
    }
  }

  updateStationX(stationIndex, xValue, emit = true) {
    const station = this.stations[stationIndex];
    if (!station) {
      return;
    }

    const minSpacing = this.length / (this.stationCount * 4);
    const prevX = stationIndex > 0 ? this.stations[stationIndex - 1].x + minSpacing : 0;
    const nextX =
      stationIndex < this.stationCount - 1
        ? this.stations[stationIndex + 1].x - minSpacing
        : this.length;

    station.x = clamp(xValue, prevX, nextX);

    if (emit) {
      this.markChanged("station-x");
    }
  }

  updateControlPoint(stationIndex, levelIndex, side, updates = {}, emit = true) {
    const station = this.stations[stationIndex];
    if (!station) {
      return;
    }

    const point = station.points[levelIndex];
    if (!point) {
      return;
    }

    if (Number.isFinite(updates.z)) {
      const lower =
        levelIndex > 0 ? station.points[levelIndex - 1].z + this.depth * 0.01 : 0;
      const upper =
        levelIndex < this.levelCount - 1
          ? station.points[levelIndex + 1].z - this.depth * 0.01
          : this.depth * 1.35;
      point.z = clamp(updates.z, lower, upper);
    }

    if (Number.isFinite(updates.y)) {
      if (side === "port") {
        point.yPort = Math.min(0, updates.y);
        if (this.symmetry) {
          point.yStarboard = Math.abs(point.yPort);
        }
      } else {
        point.yStarboard = Math.max(0, updates.y);
        if (this.symmetry) {
          point.yPort = -Math.abs(point.yStarboard);
        }
      }
    }

    if (emit) {
      this.markChanged("control-point");
    }
  }

  updateLevelAcrossStations(levelIndex, side, updater) {
    if (levelIndex < 0 || levelIndex >= this.levelCount) {
      return;
    }

    for (let stationIndex = 0; stationIndex < this.stationCount; stationIndex += 1) {
      const station = this.stations[stationIndex];
      const point = station.points[levelIndex];
      const next = updater({ stationIndex, point: cloneDeepJSON(point), station });
      if (!next) {
        continue;
      }

      this.updateControlPoint(stationIndex, levelIndex, side, next, false);
    }

    this.markChanged("level-edit");
  }

  getControlPoint(stationIndex, levelIndex) {
    const station = this.stations[stationIndex];
    if (!station) {
      return null;
    }
    const point = station.points[levelIndex];
    if (!point) {
      return null;
    }

    return {
      stationIndex,
      levelIndex,
      x: station.x,
      z: point.z,
      yStarboard: point.yStarboard,
      yPort: point.yPort,
    };
  }

  getSectionControlPoints(stationIndex, side = "starboard") {
    const station = this.stations[stationIndex];
    if (!station) {
      return [];
    }

    return station.points.map((point) => ({
      x: station.x,
      y: side === "port" ? point.yPort : point.yStarboard,
      z: point.z,
    }));
  }

  getWaterlineControlPoints(levelIndex, side = "starboard") {
    if (levelIndex < 0 || levelIndex >= this.levelCount) {
      return [];
    }

    return this.stations.map((station) => {
      const point = station.points[levelIndex];
      return {
        x: station.x,
        y: side === "port" ? point.yPort : point.yStarboard,
        z: point.z,
      };
    });
  }

  getDeckProfile(side = "starboard") {
    const idx = this.levelCount - 1;
    return this.getWaterlineControlPoints(idx, side);
  }

  getKeelProfile(side = "starboard") {
    return this.getWaterlineControlPoints(0, side);
  }

  rebuildFromOffsetTable(offsetTable) {
    const { stationXs, zLevels, starboardOffsets, portOffsets } = offsetTable;
    if (!stationXs?.length || !zLevels?.length || !starboardOffsets?.length) {
      throw new Error("Offset table is incomplete.");
    }

    this.stationCount = stationXs.length;
    this.levelCount = zLevels.length;
    this.length = Math.max(...stationXs);
    this.depth = Math.max(...zLevels);

    this.stations = stationXs.map((x, si) => ({
      id: `S${si + 1}`,
      x,
      points: zLevels.map((z, li) => {
        const yS = Number(starboardOffsets[si][li] ?? 0);
        const yP = portOffsets?.[si]?.[li];
        return {
          id: `${si}-${li}`,
          z,
          yStarboard: Math.max(0, yS),
          yPort: Number.isFinite(yP) ? Math.min(0, yP) : -Math.max(0, yS),
        };
      }),
    }));

    this.beam = this.stations.reduce((maxBeam, station) => {
      const stationBeam = station.points.reduce(
        (maxPoint, p) => Math.max(maxPoint, p.yStarboard - p.yPort),
        0
      );
      return Math.max(maxBeam, stationBeam);
    }, 0);

    if (this.symmetry) {
      this.enforceSymmetry(false);
    }

    this.draft = clamp(this.draft, 0.01, this.depth * 1.5);
    this.markChanged("offset-table");
  }
}
