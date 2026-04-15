import { HullModel } from "../geometry/HullModel.js";
import {
  exportIGESLike,
  exportProjectJSON,
  exportSTL,
  parseOffsetCSV,
  parseProjectJSON,
} from "../io/ImportExport.js";

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

export class UIController {
  constructor({
    model,
    curveEngine,
    surfaceEngine,
    hydroEngine,
    history,
    renderer2d,
    renderer3d,
  }) {
    this.model = model;
    this.curveEngine = curveEngine;
    this.surfaceEngine = surfaceEngine;
    this.hydroEngine = hydroEngine;
    this.history = history;
    this.renderer2d = renderer2d;
    this.renderer3d = renderer3d;

    this.surface = null;
    this.derivedLines = null;
    this.hydro = null;

    this.viewMode = "body";
    this.geometryDirty = true;
    this.hydroDirty = true;
    this.refreshPending = false;
    this.hasFocused3D = false;

    this.surfaceOptions = {
      longitudinalSamples: 90,
      verticalSamples: 40,
    };

    this.bindUI();
    this.bindModelEvents();
    this.bindRendererEvents();

    this.updateControlRanges();
    this.syncAllPanels();

    this.history.push(this.model.getState());
    this.scheduleRefresh();
  }

  bindModelEvents() {
    this.model.on("change", () => {
      this.geometryDirty = true;
      this.hydroDirty = true;
      this.updateControlRanges();
      this.syncPointEditor();
      this.scheduleRefresh();
    });
  }

  bindRendererEvents() {
    this.renderer2d.setEditCallbacks({
      onEditStarted: () => {
        this.history.push(this.model.getState());
        this.syncPointEditor();
      },
      onGeometryEdited: () => {
        this.geometryDirty = true;
        this.hydroDirty = true;
        this.syncPointEditor();
        this.scheduleRefresh();
      },
      onEditFinished: () => {
        this.syncPointEditor();
      },
    });
  }

  bindUI() {
    const viewSelect = document.getElementById("viewSelect");
    const stationRange = document.getElementById("stationRange");
    const levelRange = document.getElementById("levelRange");
    const sideSelect = document.getElementById("sideSelect");
    const symmetryToggle = document.getElementById("symmetryToggle");
    const snapToggle = document.getElementById("snapToggle");
    const snapStepInput = document.getElementById("snapStep");

    const wireframeToggle = document.getElementById("wireframeToggle");
    const shadedToggle = document.getElementById("shadedToggle");

    const draftInput = document.getElementById("draftInput");
    const applyDimensionsBtn = document.getElementById("applyDimensionsBtn");
    const newHullBtn = document.getElementById("newHullBtn");

    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");

    const sectionToggle = document.getElementById("sliceToggle");
    const sectionRange = document.getElementById("sliceRange");

    const importInput = document.getElementById("importFileInput");
    const exportJsonBtn = document.getElementById("exportJsonBtn");
    const exportStlBtn = document.getElementById("exportStlBtn");
    const exportIgesBtn = document.getElementById("exportIgesBtn");

    const applyPointBtn = document.getElementById("applyPointBtn");

    viewSelect.addEventListener("change", () => {
      this.viewMode = viewSelect.value;
      this.renderer2d.setView(this.viewMode === "3d" ? "body" : this.viewMode);
      this.syncViewVisibility();
      this.scheduleRefresh();
    });

    stationRange.addEventListener("input", () => {
      this.renderer2d.setActiveStation(Number(stationRange.value));
      setText("stationValue", stationRange.value);
      this.syncPointEditor();
    });

    levelRange.addEventListener("input", () => {
      this.renderer2d.setActiveLevel(Number(levelRange.value));
      setText("levelValue", levelRange.value);
      this.syncPointEditor();
    });

    sideSelect.addEventListener("change", () => {
      this.renderer2d.setActiveSide(sideSelect.value);
      this.syncPointEditor();
    });

    symmetryToggle.addEventListener("change", () => {
      this.history.push(this.model.getState());
      this.model.setSymmetry(symmetryToggle.checked);
      this.syncPointEditor();
    });

    snapToggle.addEventListener("change", () => {
      this.renderer2d.setSnap(snapToggle.checked, Number(snapStepInput.value));
    });

    snapStepInput.addEventListener("change", () => {
      this.renderer2d.setSnap(snapToggle.checked, Number(snapStepInput.value));
    });

    wireframeToggle.addEventListener("change", () => {
      this.renderer3d.setDisplayOptions({ showWireframe: wireframeToggle.checked });
    });

    shadedToggle.addEventListener("change", () => {
      this.renderer3d.setDisplayOptions({ showShaded: shadedToggle.checked });
    });

    draftInput.addEventListener("change", () => {
      this.model.setDraft(Number(draftInput.value));
    });

    applyDimensionsBtn.addEventListener("click", () => {
      this.history.push(this.model.getState());
      this.applyDimensionInputs();
    });

    newHullBtn.addEventListener("click", () => {
      this.history.push(this.model.getState());
      this.rebuildDefaultHull();
    });

    undoBtn.addEventListener("click", () => this.undo());
    redoBtn.addEventListener("click", () => this.redo());

    sectionToggle.addEventListener("change", () => {
      this.updateSectionSlice();
    });

    sectionRange.addEventListener("input", () => {
      this.updateSectionSlice();
    });

    importInput.addEventListener("change", async () => {
      if (!importInput.files?.length) {
        return;
      }

      const file = importInput.files[0];
      const text = await file.text();

      this.history.push(this.model.getState());

      try {
        if (file.name.toLowerCase().endsWith(".json")) {
          const parsed = parseProjectJSON(text);
          this.model.setState(parsed);
        } else if (file.name.toLowerCase().endsWith(".csv")) {
          const table = parseOffsetCSV(text);
          this.model.rebuildFromOffsetTable(table);
        } else {
          throw new Error("Supported import formats: .json, .csv");
        }
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      }

      importInput.value = "";
      this.syncAllPanels();
    });

    exportJsonBtn.addEventListener("click", () => {
      exportProjectJSON(this.model.getState());
    });

    exportStlBtn.addEventListener("click", () => {
      if (this.surface) {
        exportSTL(this.surface);
      }
    });

    exportIgesBtn.addEventListener("click", () => {
      if (this.surface) {
        exportIGESLike(this.surface);
      }
    });

    applyPointBtn.addEventListener("click", () => {
      this.history.push(this.model.getState());
      this.applyPointEditor();
    });
  }

  applyDimensionInputs() {
    const length = Number(document.getElementById("lengthInput").value);
    const beam = Number(document.getElementById("beamInput").value);
    const depth = Number(document.getElementById("depthInput").value);
    const stations = Number(document.getElementById("stationsInput").value);
    const levels = Number(document.getElementById("levelsInput").value);

    if (Number.isFinite(length) && Number.isFinite(beam) && Number.isFinite(depth)) {
      this.model.setMainDimensions({ length, beam, depth }, false);
    }

    if (Number.isFinite(stations) && Number.isFinite(levels)) {
      const replacement = HullModel.createDefault({
        name: this.model.meta.name,
        units: this.model.meta.units,
        length: this.model.length,
        beam: this.model.beam,
        depth: this.model.depth,
        stationCount: Math.max(4, stations),
        levelCount: Math.max(4, levels),
        symmetry: this.model.symmetry,
        draft: this.model.draft,
      });

      this.model.setState(replacement.getState(), false);
    }

    this.model.markChanged("apply-dimensions");
    this.syncAllPanels();
  }

  rebuildDefaultHull() {
    const replacement = HullModel.createDefault({
      name: this.model.meta.name,
      units: this.model.meta.units,
      length: Number(document.getElementById("lengthInput").value) || this.model.length,
      beam: Number(document.getElementById("beamInput").value) || this.model.beam,
      depth: Number(document.getElementById("depthInput").value) || this.model.depth,
      stationCount: Number(document.getElementById("stationsInput").value) || this.model.stationCount,
      levelCount: Number(document.getElementById("levelsInput").value) || this.model.levelCount,
      symmetry: document.getElementById("symmetryToggle").checked,
      draft: Number(document.getElementById("draftInput").value) || this.model.draft,
    });

    this.model.setState(replacement.getState());
    this.history.clear();
    this.history.push(this.model.getState());
    this.syncAllPanels();
  }

  applyPointEditor() {
    const stationIndex = Number(document.getElementById("cpStation").value);
    const levelIndex = Number(document.getElementById("cpLevel").value);
    const side = document.getElementById("cpSide").value;

    const x = Number(document.getElementById("cpX").value);
    const y = Number(document.getElementById("cpY").value);
    const z = Number(document.getElementById("cpZ").value);

    this.model.updateStationX(stationIndex, x, false);
    this.model.updateControlPoint(stationIndex, levelIndex, side, { y, z }, false);
    this.model.markChanged("point-editor");

    this.renderer2d.setActiveStation(stationIndex);
    this.renderer2d.setActiveLevel(levelIndex);
    this.renderer2d.setActiveSide(side);

    document.getElementById("stationRange").value = stationIndex;
    document.getElementById("levelRange").value = levelIndex;
    document.getElementById("sideSelect").value = side;

    this.syncPointEditor();
  }

  undo() {
    const state = this.history.undo(this.model.getState());
    if (!state) {
      return;
    }
    this.model.setState(state);
    this.syncAllPanels();
  }

  redo() {
    const state = this.history.redo(this.model.getState());
    if (!state) {
      return;
    }
    this.model.setState(state);
    this.syncAllPanels();
  }

  updateControlRanges() {
    const stationRange = document.getElementById("stationRange");
    const levelRange = document.getElementById("levelRange");

    stationRange.max = this.model.stationCount - 1;
    levelRange.max = this.model.levelCount - 1;

    stationRange.value = Math.min(Number(stationRange.value), this.model.stationCount - 1);
    levelRange.value = Math.min(Number(levelRange.value), this.model.levelCount - 1);

    this.renderer2d.setActiveStation(Number(stationRange.value));
    this.renderer2d.setActiveLevel(Number(levelRange.value));

    setText("stationValue", stationRange.value);
    setText("levelValue", levelRange.value);
  }

  syncAllPanels() {
    document.getElementById("lengthInput").value = this.model.length.toFixed(3);
    document.getElementById("beamInput").value = this.model.beam.toFixed(3);
    document.getElementById("depthInput").value = this.model.depth.toFixed(3);
    document.getElementById("stationsInput").value = this.model.stationCount;
    document.getElementById("levelsInput").value = this.model.levelCount;
    document.getElementById("symmetryToggle").checked = this.model.symmetry;
    document.getElementById("draftInput").value = this.model.draft.toFixed(3);

    const snapEnabled = document.getElementById("snapToggle").checked;
    const snapStep = Number(document.getElementById("snapStep").value);
    this.renderer2d.setSnap(snapEnabled, snapStep);

    this.syncPointEditor();
    this.syncViewVisibility();
  }

  syncPointEditor() {
    const stationIndex = this.renderer2d.activeStation;
    const levelIndex = this.renderer2d.activeLevel;
    const side = this.renderer2d.activeSide;
    const cp = this.model.getControlPoint(stationIndex, levelIndex);

    if (!cp) {
      return;
    }

    document.getElementById("cpStation").value = stationIndex;
    document.getElementById("cpLevel").value = levelIndex;
    document.getElementById("cpSide").value = side;
    document.getElementById("cpX").value = cp.x.toFixed(3);
    document.getElementById("cpY").value = (side === "port" ? cp.yPort : cp.yStarboard).toFixed(3);
    document.getElementById("cpZ").value = cp.z.toFixed(3);

    document.getElementById("sideSelect").value = side;
  }

  syncViewVisibility() {
    const canvasPane = document.getElementById("linesCanvas");
    const pane3d = document.getElementById("threePane");

    if (this.viewMode === "3d") {
      canvasPane.style.display = "none";
      pane3d.style.display = "block";
      this.renderer3d.handleResize();
    } else {
      canvasPane.style.display = "block";
      pane3d.style.display = "none";
      this.renderer2d.setView(this.viewMode);
    }
  }

  updateSectionSlice() {
    const enabled = document.getElementById("sliceToggle").checked;
    const ratio = Number(document.getElementById("sliceRange").value) / 100;
    const x = this.model.length * ratio;

    this.renderer3d.setSectionSliceX(enabled ? x : null);
  }

  scheduleRefresh() {
    if (this.refreshPending) {
      return;
    }

    this.refreshPending = true;
    requestAnimationFrame(() => {
      this.refreshPending = false;
      this.refresh();
    });
  }

  refresh() {
    if (this.geometryDirty) {
      this.surface = this.surfaceEngine.generateSurface(
        this.model,
        this.curveEngine,
        this.surfaceOptions
      );

      this.derivedLines = this.surfaceEngine.buildDerivedLines(
        this.model,
        this.curveEngine,
        this.surface,
        {
          waterlineCount: 8,
          buttockCount: 8,
        }
      );

      this.renderer2d.setSurfaceData(this.surface, this.derivedLines);
      this.renderer3d.updateHull(this.surface);

      if (!this.hasFocused3D) {
        this.renderer3d.focusOnBounds(this.surface.bounds);
        this.hasFocused3D = true;
      }

      this.geometryDirty = false;
      this.hydroDirty = true;
    }

    if (this.hydroDirty && this.surface) {
      this.hydro = this.hydroEngine.compute(this.model, this.surface, {
        draft: this.model.draft,
      });
      this.updateHydroPanel();
      this.hydroDirty = false;
    }

    this.syncPointEditor();
  }

  updateHydroPanel() {
    if (!this.hydro) {
      return;
    }

    setText("hydroVolume", this.hydro.volume.toFixed(3));
    setText("hydroDisp", this.hydro.displacement.toFixed(3));
    setText("hydroWaterplane", this.hydro.waterplaneArea.toFixed(3));
    setText("hydroLCB", this.hydro.lcb.toFixed(3));
    setText("hydroVCB", this.hydro.vcb.toFixed(3));
    setText("hydroTCB", this.hydro.tcb.toFixed(3));
  }
}
