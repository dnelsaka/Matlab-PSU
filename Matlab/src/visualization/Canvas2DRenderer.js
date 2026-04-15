import { clamp, snap } from "../utils/math.js";

function drawPolyline(ctx, points, project, strokeStyle, lineWidth = 1.2, dash = []) {
  if (!points || points.length < 2) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();

  points.forEach((point, idx) => {
    const p = project(point.u, point.v);
    if (idx === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  });

  ctx.stroke();
  ctx.restore();
}

function drawPoint(ctx, point, project, radius, fillStyle, strokeStyle = "#122", lineWidth = 1) {
  const p = project(point.u, point.v);
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

export class Canvas2DRenderer {
  constructor(canvas, model, curveEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.model = model;
    this.curveEngine = curveEngine;

    this.view = "body";
    this.activeStation = Math.floor(model.stationCount / 2);
    this.activeLevel = Math.floor(model.levelCount / 2);
    this.activeSide = "starboard";

    this.snapEnabled = false;
    this.snapStep = 0.25;

    this.surface = null;
    this.derivedLines = null;

    this.drag = null;
    this.onGeometryEdited = null;
    this.onEditStarted = null;
    this.onEditFinished = null;

    this.viewport = {
      padding: 48,
      body: { zoom: 1, panX: 0, panY: 0 },
      sheer: { zoom: 1, panX: 0, panY: 0 },
      half: { zoom: 1, panX: 0, panY: 0 },
    };

    this.bindEvents();
    this.handleResize();
  }

  bindEvents() {
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.canvas.addEventListener("pointerup", () => this.onPointerUp());
    this.canvas.addEventListener("pointerleave", () => this.onPointerUp());
    this.canvas.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });

    window.addEventListener("resize", () => this.handleResize());
  }

  setEditCallbacks({ onGeometryEdited, onEditStarted, onEditFinished }) {
    this.onGeometryEdited = onGeometryEdited;
    this.onEditStarted = onEditStarted;
    this.onEditFinished = onEditFinished;
  }

  setView(view) {
    this.view = view;
    this.render();
  }

  setActiveStation(index) {
    this.activeStation = clamp(index, 0, this.model.stationCount - 1);
    this.render();
  }

  setActiveLevel(index) {
    this.activeLevel = clamp(index, 0, this.model.levelCount - 1);
    this.render();
  }

  setActiveSide(side) {
    this.activeSide = side === "port" ? "port" : "starboard";
    this.render();
  }

  setSnap(enabled, step = this.snapStep) {
    this.snapEnabled = Boolean(enabled);
    this.snapStep = step;
  }

  setSurfaceData(surface, derivedLines) {
    this.surface = surface;
    this.derivedLines = derivedLines;
    this.render();
  }

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  worldBounds() {
    const beamHalf = this.model.beam * 0.55;
    const zMax = this.model.depth * 1.2;

    if (this.view === "body") {
      return {
        minU: -beamHalf,
        maxU: beamHalf,
        minV: 0,
        maxV: zMax,
      };
    }

    if (this.view === "sheer") {
      return {
        minU: 0,
        maxU: this.model.length,
        minV: 0,
        maxV: zMax,
      };
    }

    return {
      minU: 0,
      maxU: this.model.length,
      minV: -beamHalf,
      maxV: beamHalf,
    };
  }

  currentCamera() {
    return this.viewport[this.view];
  }

  project(u, v) {
    const cam = this.currentCamera();
    const bounds = this.worldBounds();
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const pad = this.viewport.padding;

    const sx = (width - 2 * pad) / Math.max(1e-9, bounds.maxU - bounds.minU);
    const sy = (height - 2 * pad) / Math.max(1e-9, bounds.maxV - bounds.minV);
    const scale = Math.min(sx, sy) * cam.zoom;

    return {
      x: pad + (u - bounds.minU) * scale + cam.panX,
      y: height - pad - (v - bounds.minV) * scale + cam.panY,
      scale,
    };
  }

  unproject(x, y) {
    const cam = this.currentCamera();
    const bounds = this.worldBounds();
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const pad = this.viewport.padding;

    const sx = (width - 2 * pad) / Math.max(1e-9, bounds.maxU - bounds.minU);
    const sy = (height - 2 * pad) / Math.max(1e-9, bounds.maxV - bounds.minV);
    const scale = Math.min(sx, sy) * cam.zoom;

    const u = bounds.minU + (x - pad - cam.panX) / scale;
    const v = bounds.minV + (height - pad - y + cam.panY) / scale;

    return { u, v, scale };
  }

  drawGridAndAxes() {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f9f8f2";
    ctx.fillRect(0, 0, width, height);

    const bounds = this.worldBounds();
    const step = this.model.meta?.units === "m" ? 1 : 1;
    const worldTL = this.unproject(0, 0);
    const worldBR = this.unproject(width, height);

    const minU = Math.min(worldTL.u, worldBR.u);
    const maxU = Math.max(worldTL.u, worldBR.u);
    const minV = Math.min(worldTL.v, worldBR.v);
    const maxV = Math.max(worldTL.v, worldBR.v);

    const startU = Math.floor(minU / step) * step;
    const startV = Math.floor(minV / step) * step;

    ctx.save();
    ctx.strokeStyle = "#d7d5cd";
    ctx.lineWidth = 1;

    for (let u = startU; u <= maxU; u += step) {
      const p0 = this.project(u, minV);
      const p1 = this.project(u, maxV);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    for (let v = startV; v <= maxV; v += step) {
      const p0 = this.project(minU, v);
      const p1 = this.project(maxU, v);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "#7a7569";
    ctx.lineWidth = 1.7;

    if (this.view === "body" || this.view === "half") {
      const left = this.project(bounds.minU, 0);
      const right = this.project(bounds.maxU, 0);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }

    const bottom = this.project(0, bounds.minV);
    const top = this.project(0, bounds.maxV);

    if (this.view !== "body") {
      ctx.beginPath();
      ctx.moveTo(bottom.x, bottom.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
    }

    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#3c3a33";
    ctx.font = "12px 'IBM Plex Sans', sans-serif";

    const label =
      this.view === "body"
        ? "Body Plan (Y-Z)"
        : this.view === "sheer"
          ? "Sheer Plan (X-Z)"
          : "Half-Breadth Plan (X-Y)";

    ctx.fillText(label, 12, 22);
    ctx.restore();
  }

  map3DTo2D(point) {
    if (this.view === "body") {
      return { u: point.y, v: point.z };
    }
    if (this.view === "sheer") {
      return { u: point.x, v: point.z };
    }
    return { u: point.x, v: point.y };
  }

  drawLinesPlan() {
    if (!this.derivedLines) {
      return;
    }

    if (this.view === "body") {
      this.drawBodyPlan();
      return;
    }

    if (this.view === "sheer") {
      this.drawSheerPlan();
      return;
    }

    this.drawHalfBreadthPlan();
  }

  drawBodyPlan() {
    for (const section of this.derivedLines.stations) {
      const isActive = section.stationIndex === this.activeStation;
      const width = isActive ? 2.2 : 1.15;
      const color = isActive ? "#0f6770" : "#6f8797";

      drawPolyline(
        this.ctx,
        section.starboard.map((p) => this.map3DTo2D(p)),
        (u, v) => this.project(u, v),
        color,
        width
      );

      drawPolyline(
        this.ctx,
        section.port.map((p) => this.map3DTo2D(p)),
        (u, v) => this.project(u, v),
        color,
        width
      );
    }

    const activeSection = this.derivedLines.stations[this.activeStation];
    if (!activeSection) {
      return;
    }

    const combBase = activeSection.starboard.map((p) => ({ x: p.y, y: p.z }));
    const comb = this.curveEngine.computeCurvatureComb2D(combBase);

    this.ctx.save();
    this.ctx.strokeStyle = "#9f3f33";
    this.ctx.lineWidth = 1;

    for (const c of comb) {
      const b = this.project(c.base.x, c.base.y);
      const t = this.project(c.tip.x, c.tip.y);
      this.ctx.beginPath();
      this.ctx.moveTo(b.x, b.y);
      this.ctx.lineTo(t.x, t.y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawSheerPlan() {
    for (const buttock of this.derivedLines.buttocks) {
      drawPolyline(
        this.ctx,
        buttock.starboard.map((p) => this.map3DTo2D(p)),
        (u, v) => this.project(u, v),
        "#8e8f76",
        1.1
      );
      drawPolyline(
        this.ctx,
        buttock.port.map((p) => this.map3DTo2D(p)),
        (u, v) => this.project(u, v),
        "#8e8f76",
        1.1,
        [4, 3]
      );
    }

    const deck = this.model.getDeckProfile(this.activeSide);
    const keel = this.model.getKeelProfile(this.activeSide);

    drawPolyline(
      this.ctx,
      deck.map((p) => this.map3DTo2D(p)),
      (u, v) => this.project(u, v),
      "#0f6770",
      2.2
    );

    drawPolyline(
      this.ctx,
      keel.map((p) => this.map3DTo2D(p)),
      (u, v) => this.project(u, v),
      "#1e4e5f",
      1.8
    );

    this.ctx.save();
    this.ctx.strokeStyle = "#b6afa2";
    this.ctx.lineWidth = 1;
    for (const station of this.model.stations) {
      const p0 = this.project(station.x, 0);
      const p1 = this.project(station.x, this.model.depth * 1.1);
      this.ctx.beginPath();
      this.ctx.moveTo(p0.x, p0.y);
      this.ctx.lineTo(p1.x, p1.y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawHalfBreadthPlan() {
    for (const waterline of this.derivedLines.waterlines) {
      drawPolyline(
        this.ctx,
        waterline.starboard.map((p) => this.map3DTo2D(p)),
        (u, v) => this.project(u, v),
        "#5f7f8c",
        1.4
      );

      drawPolyline(
        this.ctx,
        waterline.port.map((p) => this.map3DTo2D(p)),
        (u, v) => this.project(u, v),
        "#5f7f8c",
        1.4
      );
    }

    const selectedWaterline = this.model.getWaterlineControlPoints(this.activeLevel, "starboard");
    drawPolyline(
      this.ctx,
      selectedWaterline.map((p) => this.map3DTo2D(p)),
      (u, v) => this.project(u, v),
      "#0f6770",
      2.2
    );

    const portWaterline = this.model.getWaterlineControlPoints(this.activeLevel, "port");
    drawPolyline(
      this.ctx,
      portWaterline.map((p) => this.map3DTo2D(p)),
      (u, v) => this.project(u, v),
      "#0f6770",
      2.2
    );
  }

  getEditablePoints() {
    const points = [];

    if (this.view === "body") {
      const station = this.model.stations[this.activeStation];
      if (!station) {
        return points;
      }

      for (let li = 0; li < station.points.length; li += 1) {
        const p = station.points[li];
        points.push({
          stationIndex: this.activeStation,
          levelIndex: li,
          side: "starboard",
          u: p.yStarboard,
          v: p.z,
        });

        if (!this.model.symmetry) {
          points.push({
            stationIndex: this.activeStation,
            levelIndex: li,
            side: "port",
            u: p.yPort,
            v: p.z,
          });
        }
      }

      return points;
    }

    if (this.view === "sheer") {
      for (let si = 0; si < this.model.stationCount; si += 1) {
        const station = this.model.stations[si];
        for (let li = 0; li < this.model.levelCount; li += 1) {
          const p = station.points[li];
          points.push({
            stationIndex: si,
            levelIndex: li,
            side: this.activeSide,
            u: station.x,
            v: p.z,
          });
        }
      }
      return points;
    }

    for (let si = 0; si < this.model.stationCount; si += 1) {
      const station = this.model.stations[si];
      for (let li = 0; li < this.model.levelCount; li += 1) {
        const p = station.points[li];
        points.push({
          stationIndex: si,
          levelIndex: li,
          side: "starboard",
          u: station.x,
          v: p.yStarboard,
        });

        if (!this.model.symmetry) {
          points.push({
            stationIndex: si,
            levelIndex: li,
            side: "port",
            u: station.x,
            v: p.yPort,
          });
        }
      }
    }

    return points;
  }

  drawEditablePoints() {
    const points = this.getEditablePoints();

    for (const point of points) {
      const isActiveStation = point.stationIndex === this.activeStation;
      const isActiveLevel = point.levelIndex === this.activeLevel;
      const isActivePoint = isActiveStation && isActiveLevel;

      const color =
        point.side === "port"
          ? isActivePoint
            ? "#d86f4f"
            : "#d2a999"
          : isActivePoint
            ? "#1d91a2"
            : "#9ac3ca";

      drawPoint(
        this.ctx,
        point,
        (u, v) => this.project(u, v),
        isActivePoint ? 4.8 : 3.2,
        color,
        "#203038",
        1
      );
    }
  }

  findNearestEditablePoint(clientX, clientY, radiusPx = 12) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    let best = null;
    let bestDist = radiusPx;

    for (const point of this.getEditablePoints()) {
      const p = this.project(point.u, point.v);
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = point;
      }
    }

    return best;
  }

  onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    this.canvas.setPointerCapture(event.pointerId);
    const hit = this.findNearestEditablePoint(event.clientX, event.clientY);

    if (hit) {
      this.activeStation = hit.stationIndex;
      this.activeLevel = hit.levelIndex;
      this.activeSide = hit.side;

      this.drag = {
        type: "point",
        point: hit,
      };

      if (this.onEditStarted) {
        this.onEditStarted();
      }
    } else {
      this.drag = {
        type: "pan",
        lastX: event.clientX,
        lastY: event.clientY,
      };
    }

    this.render();
  }

  onPointerMove(event) {
    if (!this.drag) {
      return;
    }

    if (this.drag.type === "pan") {
      const cam = this.currentCamera();
      cam.panX += event.clientX - this.drag.lastX;
      cam.panY += event.clientY - this.drag.lastY;
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      this.render();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    let { u, v } = this.unproject(localX, localY);

    if (this.snapEnabled) {
      u = snap(u, this.snapStep);
      v = snap(v, this.snapStep);
    }

    const { stationIndex, levelIndex, side } = this.drag.point;

    if (this.view === "body") {
      this.model.updateControlPoint(stationIndex, levelIndex, side, {
        y: u,
        z: v,
      });
    } else if (this.view === "half") {
      this.model.updateStationX(stationIndex, u, false);
      this.model.updateControlPoint(stationIndex, levelIndex, side, {
        y: v,
      });
    } else {
      this.model.updateStationX(stationIndex, u, false);
      this.model.updateControlPoint(stationIndex, levelIndex, side, {
        z: v,
      });
    }

    if (this.onGeometryEdited) {
      this.onGeometryEdited();
    }

    this.render();
  }

  onPointerUp() {
    if (!this.drag) {
      return;
    }

    const wasPointEdit = this.drag.type === "point";
    this.drag = null;

    if (wasPointEdit && this.onEditFinished) {
      this.onEditFinished();
    }
  }

  onWheel(event) {
    event.preventDefault();
    const cam = this.currentCamera();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    cam.zoom = clamp(cam.zoom * factor, 0.25, 20);
    this.render();
  }

  render() {
    this.drawGridAndAxes();
    this.drawLinesPlan();
    this.drawEditablePoints();
  }
}
