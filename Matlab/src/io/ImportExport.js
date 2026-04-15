import { triangleNormal } from "../utils/math.js";

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

export function parseOffsetCSV(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must include a header and at least one data row.");
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
  const idxStation = headers.findIndex((h) => h === "station" || h === "stationindex");
  const idxX = headers.findIndex((h) => h === "x" || h === "stationx");
  const idxZ = headers.findIndex((h) => h === "z" || h === "levelz");
  const idxYStar = headers.findIndex(
    (h) => h === "ystarboard" || h === "starboard" || h === "y"
  );
  const idxYPort = headers.findIndex((h) => h === "yport" || h === "port");

  if (idxX < 0 || idxZ < 0 || idxYStar < 0) {
    throw new Error(
      "CSV columns required: x, z, yStarboard. Optional: station, yPort."
    );
  }

  const stationMap = new Map();

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCSVLine(lines[i]);
    const x = parseNumber(values[idxX]);
    const z = parseNumber(values[idxZ]);
    const yS = parseNumber(values[idxYStar]);
    const yP = idxYPort >= 0 ? parseNumber(values[idxYPort]) : null;

    if (x === null || z === null || yS === null) {
      continue;
    }

    const stationKeyRaw = idxStation >= 0 ? values[idxStation] : `${x.toFixed(6)}`;
    const stationKey = stationKeyRaw.length > 0 ? stationKeyRaw : `${x.toFixed(6)}`;

    if (!stationMap.has(stationKey)) {
      stationMap.set(stationKey, {
        x,
        rows: [],
      });
    }

    stationMap.get(stationKey).rows.push({
      z,
      yStarboard: yS,
      yPort: yP,
    });
  }

  const stations = [...stationMap.values()].sort((a, b) => a.x - b.x);
  if (stations.length === 0) {
    throw new Error("No valid offsets found in CSV.");
  }

  const zSet = new Set();
  for (const station of stations) {
    for (const row of station.rows) {
      zSet.add(row.z);
    }
  }
  const zLevels = [...zSet].sort((a, b) => a - b);

  const stationXs = stations.map((station) => station.x);
  const starboardOffsets = stationXs.map(() => Array.from({ length: zLevels.length }, () => 0));
  const portOffsets = stationXs.map(() => Array.from({ length: zLevels.length }, () => 0));

  stations.forEach((station, si) => {
    const rowMap = new Map(station.rows.map((row) => [row.z, row]));
    zLevels.forEach((z, zi) => {
      const row = rowMap.get(z);
      if (!row) {
        return;
      }
      starboardOffsets[si][zi] = Math.max(0, row.yStarboard);
      portOffsets[si][zi] = Number.isFinite(row.yPort)
        ? Math.min(0, row.yPort)
        : -Math.max(0, row.yStarboard);
    });
  });

  return {
    stationXs,
    zLevels,
    starboardOffsets,
    portOffsets,
  };
}

export function parseProjectJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !parsed.stations || !Array.isArray(parsed.stations)) {
    throw new Error("Invalid JSON project format.");
  }
  return parsed;
}

function downloadBlob(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportProjectJSON(modelState, fileName = "hull-project.json") {
  downloadBlob(JSON.stringify(modelState, null, 2), fileName, "application/json");
}

export function buildAsciiSTL(surface, solidName = "hull") {
  const lines = [`solid ${solidName}`];
  const verts = surface.vertices;
  const indices = surface.indices;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const a = { x: verts[i0], y: verts[i0 + 1], z: verts[i0 + 2] };
    const b = { x: verts[i1], y: verts[i1 + 1], z: verts[i1 + 2] };
    const c = { x: verts[i2], y: verts[i2 + 1], z: verts[i2 + 2] };

    const n = triangleNormal(a, b, c);

    lines.push(`  facet normal ${n.x} ${n.y} ${n.z}`);
    lines.push("    outer loop");
    lines.push(`      vertex ${a.x} ${a.y} ${a.z}`);
    lines.push(`      vertex ${b.x} ${b.y} ${b.z}`);
    lines.push(`      vertex ${c.x} ${c.y} ${c.z}`);
    lines.push("    endloop");
    lines.push("  endfacet");
  }

  lines.push(`endsolid ${solidName}`);
  return lines.join("\n");
}

export function exportSTL(surface, fileName = "hull.stl") {
  const stl = buildAsciiSTL(surface, "hull_surface");
  downloadBlob(stl, fileName, "model/stl");
}

export function buildIGESLike(surface) {
  const lines = [
    "BEGIN_IGES_LIKE",
    "UNITS,METERS",
    `VERTICES,${surface.vertices.length / 3}`,
  ];

  for (let i = 0; i < surface.vertices.length; i += 3) {
    const id = i / 3 + 1;
    lines.push(
      `POINT,${id},${surface.vertices[i]},${surface.vertices[i + 1]},${surface.vertices[i + 2]}`
    );
  }

  lines.push(`FACES,${surface.indices.length / 3}`);

  for (let i = 0; i < surface.indices.length; i += 3) {
    const id = i / 3 + 1;
    const a = surface.indices[i] + 1;
    const b = surface.indices[i + 1] + 1;
    const c = surface.indices[i + 2] + 1;
    lines.push(`FACE,${id},${a},${b},${c}`);
  }

  lines.push("END_IGES_LIKE");
  return lines.join("\n");
}

export function exportIGESLike(surface, fileName = "hull.igs.txt") {
  const content = buildIGESLike(surface);
  downloadBlob(content, fileName, "text/plain");
}
