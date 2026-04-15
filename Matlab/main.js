import { CurveEngine } from "./src/curve/CurveEngine.js";
import { HullModel } from "./src/geometry/HullModel.js";
import { UndoRedoManager } from "./src/geometry/UndoRedoManager.js";
import { HydrostaticsEngine } from "./src/hydro/HydrostaticsEngine.js";
import { SurfaceEngine } from "./src/surface/SurfaceEngine.js";
import { UIController } from "./src/ui/UIController.js";
import { Canvas2DRenderer } from "./src/visualization/Canvas2DRenderer.js";
import { Hull3DRenderer } from "./src/visualization/ThreeRenderer.js";

const model = HullModel.createDefault({
  name: "Hull Design Project",
  units: "m",
  length: 120,
  beam: 18,
  depth: 12,
  stationCount: 13,
  levelCount: 9,
  symmetry: true,
});

const curveEngine = new CurveEngine();
const surfaceEngine = new SurfaceEngine();
const hydroEngine = new HydrostaticsEngine();
const history = new UndoRedoManager(180);

const linesCanvas = document.getElementById("linesCanvas");
const threePane = document.getElementById("threePane");

const renderer2d = new Canvas2DRenderer(linesCanvas, model, curveEngine);
const renderer3d = new Hull3DRenderer(threePane);

const app = new UIController({
  model,
  curveEngine,
  surfaceEngine,
  hydroEngine,
  history,
  renderer2d,
  renderer3d,
});

window.hullDesignApp = app;
