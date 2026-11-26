import fs from 'node:fs';
import path from 'node:path';

// 西南交通大学（犀浦校区）真实 OSM 边界 bbox (south, west, north, east)
const BBOX = '30.7575,103.9740,30.7748,103.9932';

const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  way(207566638);
  way["building"](${BBOX});
  relation["building"](${BBOX});
  way["building:part"](${BBOX});
  way["natural"="water"](${BBOX});
  relation["natural"="water"](${BBOX});
  way["waterway"](${BBOX});
  way["leisure"~"pitch|track|park|stadium|garden"](${BBOX});
  way["landuse"~"grass|meadow|recreation_ground"](${BBOX});
  way["highway"~"primary|secondary|tertiary|unclassified|residential|service|footway|cycleway|path|pedestrian"](${BBOX});
  node["barrier"="gate"](${BBOX});
  node["name"]["amenity"](${BBOX});
);
out body;
>;
out skel qt;
`;

async function fetchOverpass() {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  for (const url of endpoints) {
    try {
      console.log(`Fetching OSM data from ${url}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'jiaodian-boxu-campus-map/1.0',
        },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      });
      if (!res.ok) {
        console.warn(`HTTP ${res.status} from ${url}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      console.warn(`Error from ${url}:`, err.message);
    }
  }
  throw new Error('All Overpass endpoints failed');
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function isClosedRing(coords) {
  return coords.length >= 4 && samePoint(coords[0], coords[coords.length - 1]);
}

/**
 * 将由多条 OSM way 拼接而成的 outer/inner 线段合并成闭合环
 */
function stitchRings(wayCoordsList) {
  const remaining = wayCoordsList.map((c) => [...c]);
  const rings = [];

  while (remaining.length > 0) {
    let current = remaining.shift();
    if (isClosedRing(current)) {
      rings.push(current);
      continue;
    }

    let progressed = true;
    while (progressed && !isClosedRing(current)) {
      progressed = false;
      const head = current[0];
      const tail = current[current.length - 1];

      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const sHead = seg[0];
        const sTail = seg[seg.length - 1];

        if (samePoint(tail, sHead)) {
          current.push(...seg.slice(1));
          remaining.splice(i, 1);
          progressed = true;
          break;
        } else if (samePoint(tail, sTail)) {
          current.push(...seg.slice(0, -1).reverse());
          remaining.splice(i, 1);
          progressed = true;
          break;
        } else if (samePoint(head, sTail)) {
          current = [...seg.slice(0, -1), ...current];
          remaining.splice(i, 1);
          progressed = true;
          break;
        } else if (samePoint(head, sHead)) {
          current = [...seg.slice(1).reverse(), ...current];
          remaining.splice(i, 1);
          progressed = true;
          break;
        }
      }
    }

    if (isClosedRing(current)) {
      rings.push(current);
    }
  }

  return rings;
}

function centroid(coords) {
  const n = coords.length - 1;
  let lon = 0;
  let lat = 0;
  for (let i = 0; i < n; i++) {
    lon += coords[i][0];
    lat += coords[i][1];
  }
  return [+(lon / n).toFixed(6), +(lat / n).toFixed(6)];
}

function inferHeight(tags) {
  if (tags.height) {
    const parsed = parseFloat(tags.height);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  if (tags['building:levels']) {
    const levels = parseFloat(tags['building:levels']);
    if (!Number.isNaN(levels) && levels > 0) return Math.round(levels * 3.8);
  }
  const name = tags.name || '';
  if (name.includes('图书馆')) return 36;
  if (name.includes('综合楼') || name.includes('行政')) return 32;
  if (name.includes('教学') || /X[1-9]/i.test(name)) return 24;
  if (name.includes('天佑斋') || name.includes('鸿哲斋') || name.includes('宿舍') || tags.building === 'dormitory') return 20;
  if (name.includes('食堂') || name.includes('餐厅')) return 14;
  if (tags.building === 'university' || tags.building === 'school') return 22;
  return 14;
}

function inferCategory(tags) {
  const name = tags.name || '';
  if (name.includes('图书馆')) return 'library';
  if (name.includes('综合') || name.includes('行政')) return 'admin';
  if (name.includes('教学') || /X[1-9]/i.test(name) || name.includes('实验')) return 'teaching';
  if (name.includes('天佑斋') || name.includes('鸿哲斋') || name.includes('宿舍') || name.includes('公寓') || tags.building === 'dormitory') return 'dorm';
  if (name.includes('食堂') || name.includes('餐厅')) return 'canteen';
  return 'other';
}

const raw = await fetchOverpass();
const nodeMap = new Map();
const wayMap = new Map();

for (const el of raw.elements) {
  if (el.type === 'node') {
    nodeMap.set(el.id, [el.lon, el.lat]);
  }
}

for (const el of raw.elements) {
  if (el.type === 'way' && el.nodes) {
    const coords = el.nodes.map((id) => nodeMap.get(id)).filter(Boolean);
    wayMap.set(el.id, { ...el, coords });
  }
}

const campusBoundary = [];
const buildings = [];
const water = [];
const green = [];
const roads = [];
const labels = [];

// 1. 先处理 multipolygon relation（教学楼 1-9 号、综合楼、带岛水系等）
const relationMemberWayIds = new Set();

for (const el of raw.elements) {
  if (el.type !== 'relation' || !el.members) continue;
  const tags = el.tags || {};
  const isBuilding = Boolean(tags.building);
  const isWater = tags.natural === 'water';
  if (!isBuilding && !isWater) continue;

  const outerWays = [];
  const innerWays = [];

  for (const m of el.members) {
    if (m.type !== 'way') continue;
    const w = wayMap.get(m.ref);
    if (!w || w.coords.length < 2) continue;
    relationMemberWayIds.add(m.ref);
    if (m.role === 'inner') innerWays.push(w.coords);
    else outerWays.push(w.coords);
  }

  const outerRings = stitchRings(outerWays);
  const innerRings = stitchRings(innerWays);
  if (outerRings.length === 0) continue;

  const geometry =
    outerRings.length === 1
      ? { type: 'Polygon', coordinates: [outerRings[0], ...innerRings] }
      : {
          type: 'MultiPolygon',
          coordinates: outerRings.map((ring, idx) =>
            idx === 0 ? [ring, ...innerRings] : [ring],
          ),
        };

  if (isBuilding) {
    const cat = inferCategory(tags);
    const height = inferHeight(tags);
    buildings.push({
      type: 'Feature',
      properties: {
        id: `osm-rel-${el.id}`,
        name: tags.name || '',
        category: cat,
        height,
      },
      geometry,
    });
    if (tags.name) {
      labels.push({
        type: 'Feature',
        properties: { name: tags.name, kind: 'building', category: cat },
        geometry: { type: 'Point', coordinates: centroid(outerRings[0]) },
      });
    }
  } else if (isWater) {
    water.push({
      type: 'Feature',
      properties: { name: tags.name || '' },
      geometry,
    });
  }
}

// 2. 处理普通 way
for (const el of raw.elements) {
  if (el.type === 'way' && el.nodes) {
    const w = wayMap.get(el.id);
    const coords = w?.coords || [];
    if (coords.length < 2) continue;
    const tags = el.tags || {};

    if (el.id === 207566638 && isClosedRing(coords)) {
      campusBoundary.push({
        type: 'Feature',
        properties: { name: tags.name || '西南交通大学（犀浦校区）', kind: 'campus' },
        geometry: { type: 'Polygon', coordinates: [coords] },
      });
      continue;
    }

    if ((tags.building || tags['building:part']) && isClosedRing(coords)) {
      if (relationMemberWayIds.has(el.id) && !tags.building) continue;
      const cat = inferCategory(tags);
      const height = inferHeight(tags);
      buildings.push({
        type: 'Feature',
        properties: {
          id: `osm-${el.id}`,
          name: tags.name || '',
          category: cat,
          height,
        },
        geometry: { type: 'Polygon', coordinates: [coords] },
      });

      if (tags.name) {
        labels.push({
          type: 'Feature',
          properties: { name: tags.name, kind: 'building', category: cat },
          geometry: { type: 'Point', coordinates: centroid(coords) },
        });
      }
      continue;
    }

    if (tags.natural === 'water' && isClosedRing(coords)) {
      water.push({
        type: 'Feature',
        properties: { name: tags.name || '' },
        geometry: { type: 'Polygon', coordinates: [coords] },
      });
      continue;
    }

    if (
      (tags.leisure || tags.landuse) &&
      isClosedRing(coords) &&
      !tags.building
    ) {
      const kind =
        tags.leisure === 'pitch' || tags.leisure === 'track' || tags.leisure === 'stadium'
          ? 'field'
          : 'park';
      green.push({
        type: 'Feature',
        properties: { name: tags.name || '', kind },
        geometry: { type: 'Polygon', coordinates: [coords] },
      });
      continue;
    }

    if (tags.highway) {
      const level =
        ['primary', 'secondary', 'tertiary'].includes(tags.highway)
          ? 'major'
          : ['unclassified', 'residential', 'service'].includes(tags.highway)
            ? 'primary'
            : 'path';
      roads.push({
        type: 'Feature',
        properties: { level, name: tags.name || '' },
        geometry: { type: 'LineString', coordinates: coords },
      });
    }
  } else if (el.type === 'node' && el.tags?.name) {
    if (el.tags.barrier === 'gate' || el.tags.name.includes('门')) {
      labels.push({
        type: 'Feature',
        properties: { name: el.tags.name, kind: 'gate', category: 'gate' },
        geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
      });
    }
  }
}

const outDir = path.resolve('src/data');
const outFile = path.join(outDir, 'xipuOsmData.json');
const payload = {
  meta: {
    source: 'OpenStreetMap (Overpass API, ways + multipolygon relations)',
    campus: '西南交通大学（犀浦校区）',
    osmWayId: 207566638,
    center: [103.9832, 30.7668],
    fetchedAt: new Date().toISOString(),
    counts: {
      campusBoundary: campusBoundary.length,
      buildings: buildings.length,
      water: water.length,
      green: green.length,
      roads: roads.length,
      labels: labels.length,
    },
  },
  campusBoundary: { type: 'FeatureCollection', features: campusBoundary },
  buildings: { type: 'FeatureCollection', features: buildings },
  water: { type: 'FeatureCollection', features: water },
  green: { type: 'FeatureCollection', features: green },
  roads: { type: 'FeatureCollection', features: roads },
  labels: { type: 'FeatureCollection', features: labels },
};

fs.writeFileSync(outFile, JSON.stringify(payload));
console.log('Saved complete real OSM data:', payload.meta.counts);
console.log(
  'Restored relation buildings:',
  buildings
    .filter((b) => b.properties.id.startsWith('osm-rel-'))
    .map((b) => `${b.properties.name} (${b.geometry.type}, rings=${b.geometry.type === 'Polygon' ? b.geometry.coordinates.length : b.geometry.coordinates.length})`)
    .join('\n'),
);
