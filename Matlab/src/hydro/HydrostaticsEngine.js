import { interpolateAtZ } from "../utils/math.js";

function integrateSectionAtDraft(starSection, portSection, draft, verticalSlices = 120) {
  const zMin = Math.min(starSection[0].z, portSection[0].z);
  const zMax = Math.min(
    Math.max(starSection[starSection.length - 1].z, portSection[portSection.length - 1].z),
    draft
  );

  if (zMax <= zMin + 1e-9) {
    return {
      area: 0,
      zCentroid: 0,
      yCentroid: 0,
      waterplaneWidth: 0,
    };
  }

  const dz = (zMax - zMin) / verticalSlices;

  let area = 0;
  let firstMomentZ = 0;
  let firstMomentY = 0;

  for (let i = 0; i <= verticalSlices; i += 1) {
    const z = zMin + dz * i;
    const yStar = interpolateAtZ(starSection, z, "y");
    const yPort = interpolateAtZ(portSection, z, "y");
    const breadth = yStar - yPort;

    const weight = i === 0 || i === verticalSlices ? 0.5 : 1;
    area += breadth * weight;
    firstMomentZ += z * breadth * weight;

    // For a strip at z, centroid in y uses integral of y dA across breadth.
    // Integrating dy from yPort to yStar gives 0.5 * (yStar^2 - yPort^2).
    firstMomentY += 0.5 * (yStar * yStar - yPort * yPort) * weight;
  }

  area *= dz;
  firstMomentZ *= dz;
  firstMomentY *= dz;

  const zCentroid = area > 1e-9 ? firstMomentZ / area : 0;
  const yCentroid = area > 1e-9 ? firstMomentY / area : 0;

  const yStarDraft = interpolateAtZ(starSection, zMax, "y");
  const yPortDraft = interpolateAtZ(portSection, zMax, "y");
  const waterplaneWidth = yStarDraft - yPortDraft;

  return {
    area,
    zCentroid,
    yCentroid,
    waterplaneWidth,
  };
}

export class HydrostaticsEngine {
  compute(model, surface, options = {}) {
    const density = options.waterDensity ?? 1.025;
    const draft = options.draft ?? model.draft;

    const sectionData = [];

    for (let j = 0; j < surface.longitudinalSamples; j += 1) {
      const starSection = [...surface.starboardGrid[j]].sort((a, b) => a.z - b.z);
      const portSection = [...surface.portGrid[j]].sort((a, b) => a.z - b.z);

      const x = starSection[Math.floor(starSection.length * 0.5)].x;
      const section = integrateSectionAtDraft(starSection, portSection, draft);
      sectionData.push({
        x,
        ...section,
      });
    }

    let volume = 0;
    let firstMomentX = 0;
    let firstMomentZ = 0;
    let firstMomentY = 0;
    let waterplaneArea = 0;

    for (let i = 0; i < sectionData.length - 1; i += 1) {
      const a = sectionData[i];
      const b = sectionData[i + 1];
      const dx = b.x - a.x;

      const avgArea = 0.5 * (a.area + b.area);
      volume += avgArea * dx;

      firstMomentX += 0.5 * (a.x * a.area + b.x * b.area) * dx;
      firstMomentZ += 0.5 * (a.zCentroid * a.area + b.zCentroid * b.area) * dx;
      firstMomentY += 0.5 * (a.yCentroid * a.area + b.yCentroid * b.area) * dx;

      waterplaneArea += 0.5 * (a.waterplaneWidth + b.waterplaneWidth) * dx;
    }

    const lcb = volume > 1e-9 ? firstMomentX / volume : 0;
    const vcb = volume > 1e-9 ? firstMomentZ / volume : 0;
    const tcb = volume > 1e-9 ? firstMomentY / volume : 0;

    return {
      draft,
      density,
      volume,
      displacement: volume * density,
      waterplaneArea,
      lcb,
      vcb,
      tcb,
      sectionData,
    };
  }
}
