import fs from 'node:fs';
import path from 'node:path';

const BBOX = '30.7575,103.9740,30.7748,103.9932';

const OVERPASS_QUERY = `
[out:json][timeout:30];
(
  relation["building"](${BBOX});
  relation["natural"="water"](${BBOX});
  way["building:part"](${BBOX});
);
out body;
>;
out skel qt;
`;

async function fetchWithRetry() {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of endpoints) {
      try {
        console.log(`Fetching missing relations from ${url}...`);
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
  }
  throw new Error('All Overpass endpoints failed');
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function isClosedRing(coords) {
  return coords.length >= 4 && samePoint(coords[0], coords[coords.length - 1]);
}

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
  if (name.includes('综合楼')) return 32;
  if (name.includes('教学')) return 24;
  return 20;
}

function inferCategory(tags) {
  const name = tags.name || '';
  if (name.includes('综合')) return 'admin';
  if (name.includes('教学') || name.includes('实验')) return 'teaching';
  return 'other';
}

const raw = await fetchWithRetry();
const nodeMap = new Map();
const wayMap = new Map();

for (const el of raw.elements) {
  if (el.type === 'node') nodeMap.set(el.id, [el.lon, el.lat]);
}
for (const el of raw.elements) {
  if (el.type === 'way' && el.nodes) {
    const coords = el.nodes.map((id) => nodeMap.get(id)).filter(Boolean);
    wayMap.set(el.id, { ...el, coords });
  }
}

const dataPath = path.resolve('src/data/xipuOsmData.json');
const existing = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// 移除旧的 relation 记录避免重复
existing.buildings.features = existing.buildings.features.filter(
  (f) => !String(f.properties.id).startsWith('osm-rel-') && !String(f.properties.id).startsWith('osm-part-'),
);

const addedBuildings = [];
let addedWater = 0;

for (const el of raw.elements) {
  if (el.type === 'relation' && el.members) {
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
      const feat = {
        type: 'Feature',
        properties: {
          id: `osm-rel-${el.id}`,
          name: tags.name || '',
          category: inferCategory(tags),
          height: inferHeight(tags),
        },
        geometry,
      };
      existing.buildings.features.push(feat);
      addedBuildings.push(`${feat.properties.name || feat.properties.id} (${geometry.type})`);
    } else if (isWater) {
      existing.water.features.push({
        type: 'Feature',
        properties: { name: tags.name || '' },
        geometry,
      });
      addedWater += 1;
    }
  } else if (el.type === 'way' && el.tags?.['building:part']) {
    const w = wayMap.get(el.id);
    if (w && isClosedRing(w.coords)) {
      existing.buildings.features.push({
        type: 'Feature',
        properties: {
          id: `osm-part-${el.id}`,
          name: el.tags.name || '',
          category: inferCategory(el.tags),
          height: inferHeight(el.tags),
        },
        geometry: { type: 'Polygon', coordinates: [w.coords] },
      });
    }
  }
}

existing.meta.counts.buildings = existing.buildings.features.length;
existing.meta.counts.water = existing.water.features.length;
fs.writeFileSync(dataPath, JSON.stringify(existing));

console.log('Merged successfully! Total buildings:', existing.buildings.features.length, 'Added water:', addedWater);
console.log('Restored multipolygon buildings:\n' + addedBuildings.join('\n'));
