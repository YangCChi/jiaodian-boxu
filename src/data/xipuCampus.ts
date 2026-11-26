import type { FeatureCollection, Polygon, MultiPolygon, LineString, Point } from 'geojson';
import osmRaw from './xipuOsmData.json';

/**
 * 西南交通大学（犀浦校区）真实 OpenStreetMap 离线矢量数据
 * 数据来源：OpenStreetMap Overpass API（way/207566638 + 全部建筑 way 与 multipolygon relation）
 * 包含 258 栋真实建筑轮廓（含 1–9 号教学楼与综合楼中庭结构）、378 条真实路网、98 处绿地/球场、9 处水系。
 */

export const XIPU_CENTER: [number, number] = [103.9826, 30.7668];

export const campusBoundaryGeoJSON =
  osmRaw.campusBoundary as FeatureCollection<Polygon>;

export const campusGreenGeoJSON =
  osmRaw.green as FeatureCollection<Polygon>;

export const campusWaterGeoJSON =
  osmRaw.water as FeatureCollection<Polygon | MultiPolygon>;

export const campusRoadsGeoJSON =
  osmRaw.roads as FeatureCollection<LineString>;

export const campusBuildingsGeoJSON =
  osmRaw.buildings as FeatureCollection<
    Polygon | MultiPolygon,
    { id: string; name: string; category: string; height: number }
  >;

/**
 * 精选核心地标与校门标注（保持画面极简，避免视觉过载）
 */
export const campusLabelsGeoJSON: FeatureCollection<
  Point,
  { name: string; kind: 'gate' | 'building' }
> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: '南门', kind: 'gate' }, geometry: { type: 'Point', coordinates: [103.98979, 30.76297] } },
    { type: 'Feature', properties: { name: '东门', kind: 'gate' }, geometry: { type: 'Point', coordinates: [103.99123, 30.77179] } },
    { type: 'Feature', properties: { name: '西南门', kind: 'gate' }, geometry: { type: 'Point', coordinates: [103.98254, 30.75996] } },
    { type: 'Feature', properties: { name: '西北一门', kind: 'gate' }, geometry: { type: 'Point', coordinates: [103.97519, 30.76994] } },
    { type: 'Feature', properties: { name: '风洞门', kind: 'gate' }, geometry: { type: 'Point', coordinates: [103.98014, 30.77311] } },
    { type: 'Feature', properties: { name: '图书馆', kind: 'building' }, geometry: { type: 'Point', coordinates: [103.98304, 30.76880] } },
    { type: 'Feature', properties: { name: '综合楼', kind: 'building' }, geometry: { type: 'Point', coordinates: [103.98525, 30.77067] } },
    { type: 'Feature', properties: { name: '体育馆', kind: 'building' }, geometry: { type: 'Point', coordinates: [103.98116, 30.76710] } },
    { type: 'Feature', properties: { name: '后勤保卫处', kind: 'building' }, geometry: { type: 'Point', coordinates: [103.98256, 30.76124] } },
  ],
};
