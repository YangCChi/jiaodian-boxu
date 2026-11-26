import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, LineString, Point } from 'geojson';
import {
  Compass,
  Layers,
  MapPinPlus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  XIPU_CENTER,
  campusBoundaryGeoJSON,
  campusBuildingsGeoJSON,
  campusGreenGeoJSON,
  campusLabelsGeoJSON,
  campusRoadsGeoJSON,
  campusWaterGeoJSON,
} from '../data/xipuCampus';
import {
  type DayScenario,
  type GovernanceRules,
  type ParkingZone,
  type WorkOrder,
  type ZombieBike,
  getZoneOccupancy,
} from '../data/parkingData';

export type MapMode = 'tidal' | 'zombie';

interface CampusMap3DProps {
  zones: ParkingZone[];
  rules: GovernanceRules;
  mode: MapMode;
  hour: number;
  scenario: DayScenario;
  selectedZoneId: string | null;
  dispatchedZoneIds: Set<string>;
  zombieBikes: ZombieBike[];
  workOrders: WorkOrder[];
  reportPickMode: boolean;
  onSelectZone: (zoneId: string) => void;
  onPickReportLocation: (coords: [number, number], nearestZoneId: string) => void;
  onToggleReportPickMode: () => void;
  onNotify: (msg: string) => void;
}

/** 计算建筑外环质心，供楼栋搜索飞行定位使用 */
function getBuildingCenter(
  feat: (typeof campusBuildingsGeoJSON.features)[number],
): [number, number] | null {
  const geom = feat.geometry;
  const ring =
    geom.type === 'Polygon'
      ? geom.coordinates[0]
      : geom.type === 'MultiPolygon'
        ? geom.coordinates[0]?.[0]
        : null;
  if (!ring || ring.length < 3) return null;
  const n = ring.length - 1;
  let lon = 0;
  let lat = 0;
  for (let i = 0; i < n; i++) {
    lon += ring[i][0];
    lat += ring[i][1];
  }
  return [+(lon / n).toFixed(6), +(lat / n).toFixed(6)];
}

/** 生成两点间的柔和二次贝塞尔弧线 */
function makeCurve(
  from: [number, number],
  to: [number, number],
  bend = 0.0008,
  steps = 24,
): [number, number][] {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * bend;
  const cy = my + (dx / len) * bend;

  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    pts.push([
      inv * inv * from[0] + 2 * inv * t * cx + t * t * to[0],
      inv * inv * from[1] + 2 * inv * t * cy + t * t * to[1],
    ]);
  }
  return pts;
}

/**
 * 精简为 3 条互不交叉的校园主干潮汐走廊（位于建筑白模下方，绝不遮挡楼栋与浮标）
 */
function buildTidalFlowGeoJSON(
  mode: MapMode,
  hour: number,
  scenario: DayScenario,
  showFlows: boolean,
): FeatureCollection<LineString, { color: string }> {
  if (mode !== 'tidal' || !showFlows || scenario === 'weekend') {
    return { type: 'FeatureCollection', features: [] };
  }

  const isToClass =
    (hour >= 7.0 && hour <= 9.2) || (hour >= 13.4 && hour <= 14.8);
  const isToDorm = hour >= 20.5 && hour <= 23.25;

  if (!isToClass && !isToDorm) {
    return { type: 'FeatureCollection', features: [] };
  }

  const pairs: [[number, number], [number, number], number][] = isToClass
    ? [
        // 北区宿舍 -> 8-9 教
        [[103.9778, 30.7697], [103.9823, 30.7706], 0.0006],
        // 南区宿舍 -> 1-3 教广场
        [[103.9826, 30.7636], [103.9854, 30.7661], -0.0005],
        // 1-3 教 -> 4-6 教连廊延伸
        [[103.9854, 30.7661], [103.9870, 30.7674], -0.0004],
      ]
    : [
        // 晚课回寝：8-9 教 -> 北区宿舍
        [[103.9823, 30.7706], [103.9778, 30.7697], -0.0006],
        // 图书馆 -> 天佑斋中北
        [[103.9834, 30.7684], [103.9785, 30.7690], 0.0005],
        // 1-3 教 -> 南区宿舍
        [[103.9854, 30.7661], [103.9826, 30.7636], 0.0005],
      ];

  const color = isToClass ? '#2563eb' : '#ea580c';

  return {
    type: 'FeatureCollection',
    features: pairs.map(([from, to, bend]) => ({
      type: 'Feature',
      properties: { color },
      geometry: {
        type: 'LineString',
        coordinates: makeCurve(from, to, bend),
      },
    })),
  };
}

/**
 * 贴地柔光热力圆环数据源（位于 3D 建筑底层，彻底杜绝方柱穿模！）
 */
function buildZoneHeatGeoJSON(
  zones: ParkingZone[],
  rules: GovernanceRules,
  mode: MapMode,
  hour: number,
  scenario: DayScenario,
  dispatchedZoneIds: Set<string>,
  zombieBikes: ZombieBike[],
): FeatureCollection<
  Point,
  { id: string; radius: number; ringRadius: number; color: string; opacity: number }
> {
  return {
    type: 'FeatureCollection',
    features: zones.map((zone) => {
      let radius = 26;
      let ringRadius = 15;
      let color = '#10b981';
      let opacity = 0.28;

      if (mode === 'tidal') {
        const { ratio, level } = getZoneOccupancy(
          zone,
          hour,
          dispatchedZoneIds,
          scenario,
          rules,
        );
        radius = Math.round(22 + Math.min(1.25, ratio) * 28);
        ringRadius = Math.round(12 + Math.min(1.25, ratio) * 14);
        color =
          level === 'congested'
            ? '#ef4444'
            : level === 'warning'
              ? '#f59e0b'
              : '#10b981';
        opacity = level === 'congested' ? 0.42 : level === 'warning' ? 0.34 : 0.24;
      } else {
        const activeCount = zombieBikes.filter(
          (b) =>
            b.zoneId === zone.id &&
            (b.status === 'suspect' || b.status === 'tagged'),
        ).length;
        radius = activeCount === 0 ? 16 : 26 + activeCount * 10;
        ringRadius = activeCount === 0 ? 9 : 14 + activeCount * 5;
        color =
          activeCount >= 2
            ? '#e11d48'
            : activeCount === 1
              ? '#f59e0b'
              : '#94a3b8';
        opacity = activeCount === 0 ? 0.14 : 0.4;
      }

      return {
        type: 'Feature',
        properties: { id: zone.id, radius, ringRadius, color, opacity },
        geometry: {
          type: 'Point',
          coordinates: zone.coordinates,
        },
      };
    }),
  };
}

/** 校园重点消防通道禁停红线（可在图层开关中按需开启） */
const FIRE_LANES_GEOJSON: FeatureCollection<LineString, { name: string }> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: '1-3 教南侧消防通道' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [103.9840, 30.7668],
          [103.9852, 30.7655],
          [103.9866, 30.7644],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { name: '4-6 教连廊消防通道' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [103.9858, 30.7689],
          [103.9873, 30.7673],
          [103.9888, 30.7656],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { name: '天佑斋北区消防通道' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [103.9756, 30.7703],
          [103.9776, 30.7694],
          [103.9793, 30.7696],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { name: '一二食堂消防通道' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [103.9810, 30.7634],
          [103.9822, 30.7619],
          [103.9826, 30.7604],
        ],
      },
    },
  ],
};

function findNearestZone(zones: ParkingZone[], coords: [number, number]): ParkingZone {
  let best = zones[0];
  let bestDist = Infinity;
  for (const z of zones) {
    const d = Math.hypot(
      z.coordinates[0] - coords[0],
      z.coordinates[1] - coords[1],
    );
    if (d < bestDist) {
      bestDist = d;
      best = z;
    }
  }
  return best;
}

export function CampusMap3D({
  zones,
  rules,
  mode,
  hour,
  scenario,
  selectedZoneId,
  dispatchedZoneIds,
  zombieBikes,
  workOrders,
  reportPickMode,
  onSelectZone,
  onPickReportLocation,
  onToggleReportPickMode,
  onNotify,
}: CampusMap3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const markersRef = useRef<
    Map<string, { marker: maplibregl.Marker; el: HTMLButtonElement }>
  >(new Map());
  const violationMarkersRef = useRef<maplibregl.Marker[]>([]);

  const onSelectZoneRef = useRef(onSelectZone);
  onSelectZoneRef.current = onSelectZone;
  const onPickRef = useRef(onPickReportLocation);
  onPickRef.current = onPickReportLocation;
  const pickModeRef = useRef(reportPickMode);
  pickModeRef.current = reportPickMode;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const [is3D, setIs3D] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [showFlows, setShowFlows] = useState(true);
  const [showViolations, setShowViolations] = useState(true);
  const [showFireLanes, setShowFireLanes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoverBuilding, setHoverBuilding] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);

  // 可搜索的真实犀浦校区楼栋清单
  const searchableBuildings = useMemo(() => {
    const list: { name: string; coords: [number, number] }[] = [];
    const seen = new Set<string>();
    for (const feat of campusBuildingsGeoJSON.features) {
      const name = feat.properties?.name?.trim();
      if (!name || name.length < 2 || seen.has(name)) continue;
      const center = getBuildingCenter(feat);
      if (!center) continue;
      seen.add(name);
      list.push({ name, coords: center });
    }
    return list;
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return searchableBuildings
      .filter((b) => b.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [searchQuery, searchableBuildings]);

  // 初始化真实 OSM 数据的离线 MapLibre 3D 白模地图
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: XIPU_CENTER,
      zoom: 14.85,
      pitch: 48,
      bearing: -22,
      minZoom: 13.8,
      maxZoom: 18.2,
      attributionControl: false,
      style: {
        version: 8,
        light: {
          anchor: 'viewport',
          color: '#ffffff',
          intensity: 0.48,
          position: [1.35, 195, 36],
        },
        sources: {
          boundary: { type: 'geojson', data: campusBoundaryGeoJSON },
          green: { type: 'geojson', data: campusGreenGeoJSON },
          water: { type: 'geojson', data: campusWaterGeoJSON },
          roads: { type: 'geojson', data: campusRoadsGeoJSON },
          fireLanes: { type: 'geojson', data: FIRE_LANES_GEOJSON },
          buildings: { type: 'geojson', data: campusBuildingsGeoJSON },
          flows: {
            type: 'geojson',
            data: buildTidalFlowGeoJSON(mode, hour, scenario, showFlows),
          },
          zoneHeat: {
            type: 'geojson',
            data: buildZoneHeatGeoJSON(
              zones,
              rules,
              mode,
              hour,
              scenario,
              dispatchedZoneIds,
              zombieBikes,
            ),
          },
        },
        layers: [
          {
            id: 'bg',
            type: 'background',
            paint: { 'background-color': '#ebeff4' },
          },
          {
            id: 'campus-base',
            type: 'fill',
            source: 'boundary',
            paint: {
              'fill-color': '#f8fafc',
              'fill-outline-color': '#cbd5e1',
            },
          },
          {
            id: 'campus-park',
            type: 'fill',
            source: 'green',
            filter: ['==', ['get', 'kind'], 'park'],
            paint: { 'fill-color': '#e5f3e9' },
          },
          {
            id: 'campus-field',
            type: 'fill',
            source: 'green',
            filter: ['==', ['get', 'kind'], 'field'],
            paint: {
              'fill-color': '#dcefe2',
              'fill-outline-color': '#bfd7c7',
            },
          },
          {
            id: 'campus-water',
            type: 'fill',
            source: 'water',
            paint: { 'fill-color': '#c7e5fc' },
          },
          {
            id: 'roads-path',
            type: 'line',
            source: 'roads',
            filter: ['==', ['get', 'level'], 'path'],
            paint: {
              'line-color': '#e5e9f0',
              'line-width': 1.5,
            },
          },
          {
            id: 'roads-primary',
            type: 'line',
            source: 'roads',
            filter: ['==', ['get', 'level'], 'primary'],
            paint: {
              'line-color': '#ffffff',
              'line-width': 4,
            },
          },
          {
            id: 'roads-major',
            type: 'line',
            source: 'roads',
            filter: ['==', ['get', 'level'], 'major'],
            paint: {
              'line-color': '#ffffff',
              'line-width': 8,
            },
          },
          // 消防通道禁停红线（默认隐藏，保卫科检查时一键开启）
          {
            id: 'fire-lanes-line',
            type: 'line',
            source: 'fireLanes',
            layout: {
              visibility: 'none',
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#dc2626',
              'line-width': 3.5,
              'line-opacity': 0.85,
              'line-dasharray': [1.8, 1.4],
            },
          },
          // 1. 潮汐走廊弧线置于建筑下方，柔和不杂乱
          {
            id: 'tidal-flows-glow',
            type: 'line',
            source: 'flows',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': 7,
              'line-opacity': 0.1,
            },
          },
          {
            id: 'tidal-flows-dash',
            type: 'line',
            source: 'flows',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': 2.2,
              'line-opacity': 0.55,
              'line-dasharray': [2, 2.5],
            },
          },
          // 2. 贴地柔光热力圆环置于建筑白模下方（永不穿模！）
          {
            id: 'zones-halo',
            type: 'circle',
            source: 'zoneHeat',
            paint: {
              'circle-radius': ['get', 'radius'],
              'circle-color': ['get', 'color'],
              'circle-blur': 0.72,
              'circle-opacity': ['get', 'opacity'],
              'circle-pitch-alignment': 'map',
            },
          },
          {
            id: 'zones-ring',
            type: 'circle',
            source: 'zoneHeat',
            paint: {
              'circle-radius': ['get', 'ringRadius'],
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.18,
              'circle-stroke-width': 2,
              'circle-stroke-color': ['get', 'color'],
              'circle-stroke-opacity': 0.65,
              'circle-pitch-alignment': 'map',
            },
          },
          // 3. 258 栋真实犀浦校区 3D 建筑白模（完整立于地表与光晕之上）
          {
            id: 'buildings-3d',
            type: 'fill-extrusion',
            source: 'buildings',
            paint: {
              'fill-extrusion-color': [
                'match',
                ['get', 'category'],
                'library',
                '#cfe3ff',
                'admin',
                '#d6dfff',
                'teaching',
                '#dce5f2',
                'dorm',
                '#eaeef5',
                'canteen',
                '#ebe7fb',
                '#e4e9f0',
              ],
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.94,
              'fill-extrusion-vertical-gradient': true,
            },
          },
        ],
      },
    });

    map.on('load', () => {
      for (const feat of campusLabelsGeoJSON.features) {
        const tag = document.createElement('div');
        tag.className = `campus-tag ${
          feat.properties.kind === 'gate' ? 'is-gate' : ''
        }`;
        tag.textContent = feat.properties.name;
        new maplibregl.Marker({ element: tag, anchor: 'center' })
          .setLngLat(feat.geometry.coordinates as [number, number])
          .addTo(map);
      }

      for (const zone of zonesRef.current) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'zone-pin';
        btn.dataset.zoneId = zone.id;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (pickModeRef.current) {
            onPickRef.current(zone.coordinates, zone.id);
          } else {
            onSelectZoneRef.current(zone.id);
          }
        });

        const marker = new maplibregl.Marker({ element: btn, anchor: 'bottom' })
          .setLngLat(zone.coordinates)
          .addTo(map);
        markersRef.current.set(zone.id, { marker, el: btn });
      }

      map.on('click', (e) => {
        if (pickModeRef.current) {
          const coords: [number, number] = [
            +e.lngLat.lng.toFixed(6),
            +e.lngLat.lat.toFixed(6),
          ];
          onPickRef.current(coords, findNearestZone(zonesRef.current, coords).id);
        }
      });

      // 点击真实楼栋：自动定位到该栋楼最近的停车泊位区
      map.on('click', 'buildings-3d', (e) => {
        if (pickModeRef.current) return;
        const name = e.features?.[0]?.properties?.name;
        const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const nearest = findNearestZone(zonesRef.current, coords);
        onSelectZoneRef.current(nearest.id);
        if (typeof name === 'string' && name.trim().length > 0) {
          onNotifyRef.current(`已定位「${name}」最近泊车区：${nearest.name}`);
        }
      });

      map.on('mousemove', 'buildings-3d', (e) => {
        const name = e.features?.[0]?.properties?.name;
        if (typeof name === 'string' && name.trim().length > 0) {
          if (!pickModeRef.current) map.getCanvas().style.cursor = 'pointer';
          setHoverBuilding({
            name,
            x: e.point.x,
            y: e.point.y,
          });
        } else {
          if (!pickModeRef.current) map.getCanvas().style.cursor = '';
          setHoverBuilding(null);
        }
      });

      map.on('mouseleave', 'buildings-3d', () => {
        if (!pickModeRef.current) map.getCanvas().style.cursor = '';
        setHoverBuilding(null);
      });

      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      violationMarkersRef.current.forEach((m) => m.remove());
      violationMarkersRef.current = [];
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 上报违停拾取模式改变鼠标样式
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
    canvas.style.cursor = reportPickMode ? 'crosshair' : '';
  }, [reportPickMode]);

  // 同步更新热力圆环、潮汐走廊与浮标
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      const heatSource = map.getSource('zoneHeat') as
        | maplibregl.GeoJSONSource
        | undefined;
      heatSource?.setData(
        buildZoneHeatGeoJSON(
          zones,
          rules,
          mode,
          hour,
          scenario,
          dispatchedZoneIds,
          zombieBikes,
        ),
      );

      const flowSource = map.getSource('flows') as
        | maplibregl.GeoJSONSource
        | undefined;
      flowSource?.setData(
        buildTidalFlowGeoJSON(mode, hour, scenario, showFlows),
      );

      // 切换消防通道红线显隐
      if (map.getLayer('fire-lanes-line')) {
        map.setLayoutProperty(
          'fire-lanes-line',
          'visibility',
          showFireLanes ? 'visible' : 'none',
        );
      }

      // 随时间轴平滑变化的 3D 校园自然太阳光影
      const sunAzimuth = 110 + ((hour - 6) / 17.5) * 160;
      const isMorning = hour < 9.5;
      const isEvening = hour >= 19.5;
      map.setLight({
        anchor: 'viewport',
        color: isMorning ? '#fff9ef' : isEvening ? '#e2ecff' : '#ffffff',
        intensity: isEvening ? 0.38 : 0.48,
        position: [1.35, sunAzimuth, isEvening ? 24 : 38],
      });
    }

    const updatePin = (zone: ParkingZone) => {
      const item = markersRef.current.get(zone.id);
      if (!item) return;

      const { el } = item;
      el.classList.toggle('is-selected', selectedZoneId === zone.id);

      if (mode === 'tidal') {
        const { ratio, level } = getZoneOccupancy(
          zone,
          hour,
          dispatchedZoneIds,
          scenario,
          rules,
        );
        const dotColor =
          level === 'congested'
            ? '#ef4444'
            : level === 'warning'
              ? '#f59e0b'
              : '#10b981';
        const pct = `${Math.round(ratio * 100)}%`;
        el.innerHTML = `<span class="pin-dot" style="background:${dotColor}"></span><span>${zone.shortName}</span><span class="pin-metric">${pct}</span>`;
      } else {
        const activeCount = zombieBikes.filter(
          (b) =>
            b.zoneId === zone.id &&
            (b.status === 'suspect' || b.status === 'tagged'),
        ).length;
        const dotColor =
          activeCount >= 2
            ? '#e11d48'
            : activeCount === 1
              ? '#f59e0b'
              : '#94a3b8';
        el.innerHTML = `<span class="pin-dot" style="background:${dotColor}"></span><span>${zone.shortName}</span><span class="pin-metric">${activeCount} 辆</span>`;
      }
    };

    zones.forEach(updatePin);
  }, [
    mapReady,
    zones,
    rules,
    mode,
    hour,
    scenario,
    showFlows,
    showFireLanes,
    selectedZoneId,
    dispatchedZoneIds,
    zombieBikes,
  ]);

  // 渲染进行中的违停标点
  useEffect(() => {
    const map = mapRef.current;
    violationMarkersRef.current.forEach((m) => m.remove());
    violationMarkersRef.current = [];
    if (!map || !mapReady || !showViolations) return;

    const activeViolations = workOrders.filter(
      (o) =>
        o.type === 'violation' && o.status !== 'resolved' && o.coordinates,
    );

    for (const order of activeViolations) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'violation-pin';
      el.title = order.title;
      el.textContent = '!';
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onSelectZoneRef.current(order.zoneId);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(order.coordinates!)
        .addTo(map);
      violationMarkersRef.current.push(marker);
    }
  }, [mapReady, workOrders, showViolations]);

  // 选中停车区时轻柔平移视角
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedZoneId) return;
    const target = zones.find((z) => z.id === selectedZoneId);
    if (!target) return;
    map.easeTo({
      center: target.coordinates,
      duration: 480,
    });
  }, [selectedZoneId, zones]);

  const handleJumpToBuilding = (item: { name: string; coords: [number, number] }) => {
    setSearchQuery('');
    mapRef.current?.easeTo({
      center: item.coords,
      zoom: 16.2,
      duration: 550,
    });
    const nearest = findNearestZone(zones, item.coords);
    onSelectZone(nearest.id);
    onNotify(`已定位「${item.name}」· 最近泊车区：${nearest.shortName}`);
  };

  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3D;
    setIs3D(next);
    map.easeTo({
      pitch: next ? 48 : 0,
      bearing: next ? -22 : 0,
      duration: 450,
    });
  };

  const resetView = () => {
    mapRef.current?.easeTo({
      center: XIPU_CENTER,
      zoom: 14.85,
      pitch: is3D ? 48 : 0,
      bearing: is3D ? -22 : 0,
      duration: 500,
    });
  };

  return (
    <div className="map-stage">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 轻量楼栋快搜浮岛（定位 1-9 教 / 图书馆 / 天佑斋任意楼栋） */}
      <div className="map-search-wrap no-print">
        <label className="map-search glass-pill">
          <Search size={13} />
          <input
            type="search"
            placeholder="搜楼栋（如 2号教学楼、天佑斋16）"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="搜索犀浦校区楼栋"
          />
        </label>
        {searchResults.length > 0 && (
          <ul className="search-dropdown glass-pill" role="listbox">
            {searchResults.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={() => handleJumpToBuilding(item)}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 悬停真实 OSM 建筑时的轻量标签 */}
      {hoverBuilding && !reportPickMode && (
        <div
          className="building-tooltip"
          style={{ left: hoverBuilding.x + 12, top: hoverBuilding.y - 12 }}
        >
          {hoverBuilding.name}
        </div>
      )}

      {/* 拾取违停坐标时的顶部轻量提示 */}
      {reportPickMode && (
        <div className="pick-banner glass-pill" role="status">
          <span>请在 3D 校园地图上点击违停位置（按 Esc 或再次点击取消）</span>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={onToggleReportPickMode}
          >
            取消
          </button>
        </div>
      )}

      {/* 右下角地图工具条 */}
      <div className="map-controls glass-pill" aria-label="地图视角与图层控制">
        <button
          type="button"
          className={reportPickMode ? 'is-active' : ''}
          onClick={onToggleReportPickMode}
          title="在地图上点选上报违停"
          aria-label="在地图上点选上报违停"
        >
          <MapPinPlus size={16} />
        </button>
        <button
          type="button"
          popoverTarget="map-layers-popover"
          title="图层开关"
          aria-label="图层开关"
        >
          <SlidersHorizontal size={16} />
        </button>
        <button
          type="button"
          onClick={toggle3D}
          title={is3D ? '切换为 2D 俯视' : '切换为 3D 白模'}
          aria-label={is3D ? '切换为 2D 俯视' : '切换为 3D 白模'}
        >
          <Layers size={16} />
        </button>
        <button
          type="button"
          onClick={resetView}
          title="复位犀浦校区全景"
          aria-label="复位犀浦校区全景"
        >
          <Compass size={16} />
        </button>
      </div>

      {/* 原生 Popover 图层开关 */}
      <div id="map-layers-popover" popover="auto" className="layers-popover">
        <h3>地图图层</h3>
        <label className="layer-toggle">
          <input
            type="checkbox"
            checked={showFlows}
            onChange={(e) => setShowFlows(e.target.checked)}
          />
          <span>高峰潮汐走廊</span>
        </label>
        <label className="layer-toggle">
          <input
            type="checkbox"
            checked={showViolations}
            onChange={(e) => setShowViolations(e.target.checked)}
          />
          <span>违停占道事件标点</span>
        </label>
        <label className="layer-toggle">
          <input
            type="checkbox"
            checked={showFireLanes}
            onChange={(e) => setShowFireLanes(e.target.checked)}
          />
          <span>消防通道禁停红线</span>
        </label>
      </div>
    </div>
  );
}
