export type ZoneCategory = 'teaching' | 'dorm' | 'library' | 'canteen' | 'buffer';

export type ZombieStatus = 'suspect' | 'tagged' | 'claimed' | 'cleared';

export type DayScenario = 'weekday' | 'rainy' | 'weekend';

export interface ZombieBike {
  id: string;
  zoneId: string;
  vehicleType: '自行车' | '电动车';
  description: string;
  idleDays: number;
  status: ZombieStatus;
  noticeDaysLeft?: number;
  spotNote: string;
  registeredAt: string;
  clearedAt?: string;
  warehouseSlot?: string;
  photoDataUrl?: string;
}

export type OrderStatus = 'pending' | 'in_progress' | 'resolved';
export type OrderType = 'congestion' | 'violation' | 'zombie_clear';

export interface WorkOrder {
  id: string;
  type: OrderType;
  zoneId: string;
  title: string;
  detail: string;
  assignee: string;
  status: OrderStatus;
  createdAt: string;
  resolvedAt?: string;
  coordinates?: [number, number];
}

export interface ParkingZone {
  id: string;
  name: string;
  shortName: string;
  category: ZoneCategory;
  capacity: number;
  hasShelter: boolean;
  coordinates: [number, number];
  bounds: [number, number, number, number];
  overflowTarget: string;
  patrolTeam: string;
  hourlyProfile: Record<number, number>;
}

function padBounds(
  lon: number,
  lat: number,
  dx = 0.00038,
  dy = 0.00024,
): [number, number, number, number] {
  return [lon - dx, lat - dy, lon + dx, lat + dy];
}

export interface GovernanceRules {
  warningThreshold: number; // 默认 72 (%)
  congestedThreshold: number; // 默认 92 (%)
  zombieSuspectDays: number; // 默认 30 天
  noticePeriodDays: number; // 默认 15 天
}

export interface PatrolTeam {
  id: string;
  name: string;
  leader: string;
  phone: string;
  channel: string;
  onDuty: boolean;
}

export interface AuditLogEntry {
  id: string;
  time: string;
  actor: string;
  action: string;
  detail: string;
}

export const DEFAULT_GOVERNANCE_RULES: GovernanceRules = {
  warningThreshold: 72,
  congestedThreshold: 92,
  zombieSuspectDays: 30,
  noticePeriodDays: 15,
};

export const INITIAL_PATROL_TEAMS: PatrolTeam[] = [
  {
    id: 'team-1',
    name: '南区巡逻一组（教学楼片区）',
    leader: '张建国',
    phone: '138-8021-4410',
    channel: '对讲 1 频道',
    onDuty: true,
  },
  {
    id: 'team-2',
    name: '北区巡逻二组（天佑斋片区）',
    leader: '李明辉',
    phone: '139-8045-2218',
    channel: '对讲 2 频道',
    onDuty: true,
  },
  {
    id: 'team-3',
    name: '食堂与主干道机动班',
    leader: '王志强',
    phone: '136-7809-1135',
    channel: '对讲 3 频道',
    onDuty: true,
  },
  {
    id: 'team-4',
    name: '后勤清运专项车队',
    leader: '陈师傅',
    phone: '135-5120-8874',
    channel: '后勤调度 5 频道',
    onDuty: true,
  },
];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'LOG-001',
    time: '07:42',
    actor: '南区巡逻一组',
    action: '上报违停',
    detail: '2 号教学楼南门消防通道违停占道，已生成工单 WO-2026-081',
  },
  {
    id: 'LOG-002',
    time: '07:30',
    actor: '系统巡检规则',
    action: '公示到期提醒',
    detail: 'SW-26-0163（天佑斋 21 栋）15 天公示已满，自动转入清运工单 WO-2026-082',
  },
];

export const PATROL_TEAMS = INITIAL_PATROL_TEAMS.map((t) => t.name);

// 全部锚定在西南交通大学（犀浦校区）真实 OSM GPS 坐标上
export const PARKING_ZONES: ParkingZone[] = [
  {
    id: 'z-x2',
    name: '1–3 号教学楼南广场',
    shortName: '1-3 教广场',
    category: 'teaching',
    capacity: 240,
    hasShelter: false,
    coordinates: [103.9854, 30.7661],
    bounds: padBounds(103.9854, 30.7661, 0.00045, 0.00026),
    overflowTarget: '南门内侧临时潮汐区（步行 2 分钟）',
    patrolTeam: '南区巡逻一组（教学楼片区）',
    hourlyProfile: { 6: 0.14, 7: 0.42, 8: 1.16, 10: 1.05, 12: 0.48, 14: 0.94, 16: 0.82, 18: 0.36, 20: 0.52, 22: 0.16, 23: 0.12 },
  },
  {
    id: 'z-x4',
    name: '4–6 号教学楼连廊区',
    shortName: '4-6 教连廊',
    category: 'teaching',
    capacity: 220,
    hasShelter: true,
    coordinates: [103.9870, 30.7674],
    bounds: padBounds(103.9870, 30.7674, 0.00042, 0.00024),
    overflowTarget: '综合楼前广场 / 南门潮汐区',
    patrolTeam: '南区巡逻一组（教学楼片区）',
    hourlyProfile: { 6: 0.12, 7: 0.38, 8: 1.12, 10: 0.98, 12: 0.42, 14: 0.92, 16: 0.78, 18: 0.30, 20: 0.45, 22: 0.15, 23: 0.11 },
  },
  {
    id: 'z-x8',
    name: '8–9 号教学楼泊车区',
    shortName: '8-9 号教学楼',
    category: 'teaching',
    capacity: 210,
    hasShelter: true,
    coordinates: [103.9823, 30.7706],
    bounds: padBounds(103.9823, 30.7706, 0.00045, 0.00025),
    overflowTarget: '图书馆北侧林荫泊位',
    patrolTeam: '南区巡逻一组（教学楼片区）',
    hourlyProfile: { 6: 0.16, 7: 0.35, 8: 0.96, 10: 0.90, 12: 0.50, 14: 0.86, 16: 0.75, 18: 0.40, 20: 0.48, 22: 0.18, 23: 0.14 },
  },
  {
    id: 'z-elec',
    name: '电气馆 · 工程训练中心',
    shortName: '电气馆',
    category: 'teaching',
    capacity: 200,
    hasShelter: false,
    coordinates: [103.9871, 30.7715],
    bounds: padBounds(103.9871, 30.7715, 0.00048, 0.00026),
    overflowTarget: '东门内侧备用泊位',
    patrolTeam: '南区巡逻一组（教学楼片区）',
    hourlyProfile: { 6: 0.15, 7: 0.34, 8: 0.98, 10: 0.92, 12: 0.44, 14: 0.88, 16: 0.72, 18: 0.34, 20: 0.42, 22: 0.14, 23: 0.12 },
  },
  {
    id: 'z-lib',
    name: '图书馆南侧广场',
    shortName: '图书馆',
    category: 'library',
    capacity: 260,
    hasShelter: false,
    coordinates: [103.9834, 30.7684],
    bounds: padBounds(103.9834, 30.7684, 0.00048, 0.00026),
    overflowTarget: '体育馆东侧辅道泊位',
    patrolTeam: '食堂与主干道机动班',
    hourlyProfile: { 6: 0.10, 7: 0.28, 8: 0.62, 10: 0.78, 12: 0.58, 14: 0.86, 16: 0.92, 18: 0.76, 20: 0.95, 22: 0.24, 23: 0.10 },
  },
  {
    id: 'z-c12',
    name: '一/二食堂（黍园·梁园）',
    shortName: '一二食堂',
    category: 'canteen',
    capacity: 170,
    hasShelter: false,
    coordinates: [103.9819, 30.7622],
    bounds: padBounds(103.9819, 30.7622, 0.00040, 0.00024),
    overflowTarget: '西南门内侧通道外扩区',
    patrolTeam: '食堂与主干道机动班',
    hourlyProfile: { 6: 0.20, 7: 0.68, 8: 0.32, 10: 0.25, 12: 1.14, 14: 0.28, 16: 0.22, 18: 1.06, 20: 0.36, 22: 0.24, 23: 0.18 },
  },
  {
    id: 'z-c4',
    name: '四食堂（馨园）门口',
    shortName: '四食堂',
    category: 'canteen',
    capacity: 150,
    hasShelter: false,
    coordinates: [103.9767, 30.7686],
    bounds: padBounds(103.9767, 30.7686, 0.00038, 0.00022),
    overflowTarget: '五食堂南侧辅位',
    patrolTeam: '食堂与主干道机动班',
    hourlyProfile: { 6: 0.22, 7: 0.64, 8: 0.30, 10: 0.24, 12: 1.08, 14: 0.30, 16: 0.25, 18: 1.02, 20: 0.38, 22: 0.28, 23: 0.22 },
  },
  {
    id: 'z-d1',
    name: '天佑斋 1–7 栋组团',
    shortName: '天佑斋 1-7',
    category: 'dorm',
    capacity: 260,
    hasShelter: true,
    coordinates: [103.9830, 30.7630],
    bounds: padBounds(103.9830, 30.7630, 0.00044, 0.00026),
    overflowTarget: '三食堂东侧夜间共享位',
    patrolTeam: '北区巡逻二组（天佑斋片区）',
    hourlyProfile: { 6: 0.96, 7: 0.72, 8: 0.34, 10: 0.38, 12: 0.76, 14: 0.42, 16: 0.56, 18: 0.84, 20: 0.78, 22: 1.12, 23: 1.15 },
  },
  {
    id: 'z-d8',
    name: '天佑斋 8–14 栋 / 鸿哲斋南',
    shortName: '天佑斋 8-14',
    category: 'dorm',
    capacity: 240,
    hasShelter: true,
    coordinates: [103.9822, 30.7648],
    bounds: padBounds(103.9822, 30.7648, 0.00044, 0.00025),
    overflowTarget: '鸿哲斋东侧林荫泊位',
    patrolTeam: '北区巡逻二组（天佑斋片区）',
    hourlyProfile: { 6: 0.92, 7: 0.70, 8: 0.36, 10: 0.40, 12: 0.72, 14: 0.44, 16: 0.58, 18: 0.80, 20: 0.74, 22: 1.06, 23: 1.10 },
  },
  {
    id: 'z-d15',
    name: '天佑斋 15–18 栋北区',
    shortName: '天佑斋 15-18',
    category: 'dorm',
    capacity: 280,
    hasShelter: true,
    coordinates: [103.9778, 30.7697],
    bounds: padBounds(103.9778, 30.7697, 0.00045, 0.00026),
    overflowTarget: '北区校车站东侧夜间潮汐位',
    patrolTeam: '北区巡逻二组（天佑斋片区）',
    hourlyProfile: { 6: 1.02, 7: 0.74, 8: 0.32, 10: 0.36, 12: 0.78, 14: 0.40, 16: 0.54, 18: 0.86, 20: 0.82, 22: 1.16, 23: 1.18 },
  },
  {
    id: 'z-d19',
    name: '天佑斋 19–22 栋 / 鸿哲斋北',
    shortName: '天佑斋 19-22',
    category: 'dorm',
    capacity: 300,
    hasShelter: true,
    coordinates: [103.9772, 30.7713],
    bounds: padBounds(103.9772, 30.7713, 0.00046, 0.00026),
    overflowTarget: '西北一门内侧备用泊位',
    patrolTeam: '北区巡逻二组（天佑斋片区）',
    hourlyProfile: { 6: 0.98, 7: 0.76, 8: 0.38, 10: 0.42, 12: 0.74, 14: 0.46, 16: 0.58, 18: 0.82, 20: 0.80, 22: 1.10, 23: 1.14 },
  },
  {
    id: 'z-buffer',
    name: '南门内侧临时潮汐区',
    shortName: '南门潮汐区',
    category: 'buffer',
    capacity: 180,
    hasShelter: false,
    coordinates: [103.9886, 30.7639],
    bounds: padBounds(103.9886, 30.7639, 0.00044, 0.00024),
    overflowTarget: '常态应急缓冲泊位',
    patrolTeam: '食堂与主干道机动班',
    hourlyProfile: { 6: 0.08, 7: 0.16, 8: 0.34, 10: 0.32, 12: 0.18, 14: 0.28, 16: 0.22, 18: 0.14, 20: 0.16, 22: 0.08, 23: 0.06 },
  },
];

export const INITIAL_ZOMBIE_BIKES: ZombieBike[] = [
  {
    id: 'SW-26-0142',
    zoneId: 'z-d19',
    vehicleType: '自行车',
    description: '银灰色 26 寸山地车（后胎漏气、链条锈蚀）',
    idleDays: 94,
    status: 'tagged',
    noticeDaysLeft: 2,
    spotNote: '天佑斋 20 栋雨棚最内侧',
    registeredAt: '2026-11-14',
  },
  {
    id: 'SW-26-0158',
    zoneId: 'z-d19',
    vehicleType: '自行车',
    description: '黑色折叠车（车座破损、落灰严重）',
    idleDays: 68,
    status: 'suspect',
    spotNote: '鸿哲斋 10 栋消防栓旁',
    registeredAt: '2026-11-24',
  },
  {
    id: 'SW-26-0163',
    zoneId: 'z-d19',
    vehicleType: '电动车',
    description: '白色踏板电瓶车（无牌照、长期积灰）',
    idleDays: 75,
    status: 'tagged',
    noticeDaysLeft: 0,
    spotNote: '天佑斋 21 栋充电桩北角',
    registeredAt: '2026-11-11',
  },
  {
    id: 'SW-26-0119',
    zoneId: 'z-d15',
    vehicleType: '自行车',
    description: '蓝白色公路车（前轮变形、积灰）',
    idleDays: 82,
    status: 'tagged',
    noticeDaysLeft: 0,
    spotNote: '天佑斋 16 栋南侧车架 3 号位',
    registeredAt: '2026-11-10',
  },
  {
    id: 'SW-26-0124',
    zoneId: 'z-d15',
    vehicleType: '自行车',
    description: '浅绿色通勤车（车篮积满落叶）',
    idleDays: 47,
    status: 'suspect',
    spotNote: '天佑斋 17 栋入口东侧',
    registeredAt: '2026-11-25',
  },
  {
    id: 'SW-26-0098',
    zoneId: 'z-d1',
    vehicleType: '电动车',
    description: '深蓝小龟电动车（后视镜缺失）',
    idleDays: 63,
    status: 'tagged',
    noticeDaysLeft: 5,
    spotNote: '天佑斋 3 栋前坪树荫下',
    registeredAt: '2026-11-17',
  },
  {
    id: 'SW-26-0102',
    zoneId: 'z-d1',
    vehicleType: '自行车',
    description: '红色复古车（踏板断裂）',
    idleDays: 41,
    status: 'suspect',
    spotNote: '天佑斋 6 栋西侧拐角',
    registeredAt: '2026-11-26',
  },
  {
    id: 'SW-26-0087',
    zoneId: 'z-x2',
    vehicleType: '自行车',
    description: '灰色捷安特旧款（长期停放教学楼死角）',
    idleDays: 55,
    status: 'suspect',
    spotNote: '2 教南广场西侧花坛边',
    registeredAt: '2026-11-25',
  },
  {
    id: 'SW-26-0091',
    zoneId: 'z-d8',
    vehicleType: '自行车',
    description: '白色淑女车（车锁锈死）',
    idleDays: 71,
    status: 'tagged',
    noticeDaysLeft: 1,
    spotNote: '鸿哲斋 5 栋楼梯口',
    registeredAt: '2026-11-13',
  },
];

export const INITIAL_WORK_ORDERS: WorkOrder[] = [
  {
    id: 'WO-2026-081',
    type: 'violation',
    zoneId: 'z-x2',
    title: '2 号教学楼南门消防通道违停占道',
    detail: '早八前约 12 辆电动车斜停于消防通道黄色网格线内，需现场劝导并移至南门潮汐区。',
    assignee: '南区巡逻一组（教学楼片区）',
    status: 'in_progress',
    createdAt: '07:42',
    coordinates: [103.9844, 30.7652],
  },
  {
    id: 'WO-2026-082',
    type: 'zombie_clear',
    zoneId: 'z-d19',
    title: '天佑斋 21 栋 15 天公示到期僵尸车清运',
    detail: 'SW-26-0163 白色踏板电瓶车公示期满无人认领，安排三轮清运车拖移至西区暂存库。',
    assignee: '后勤清运专项车队',
    status: 'pending',
    createdAt: '07:30',
    coordinates: [103.9772, 30.7713],
  },
  {
    id: 'WO-2026-079',
    type: 'congestion',
    zoneId: 'z-c12',
    title: '一食堂午间出入口潮汐引导复盘',
    detail: '昨日午饭高峰启用的西南门内侧外扩泊位分流效果良好，拥堵时长缩短 18 分钟。',
    assignee: '食堂与主干道机动班',
    status: 'resolved',
    createdAt: '昨日 12:15',
    resolvedAt: '昨日 13:05',
    coordinates: [103.9819, 30.7622],
  },
];

export const TIME_PRESETS = [
  { label: '早八高峰', hour: 7.83, desc: '07:50 · 教学楼爆满' },
  { label: '午饭脉冲', hour: 12.15, desc: '12:09 · 食堂拥堵' },
  { label: '下午上课', hour: 14.15, desc: '14:09 · 教学/图书馆' },
  { label: '晚课回寝', hour: 22.0, desc: '22:00 · 宿舍门口爆满' },
] as const;

export const SCENARIO_OPTIONS: { id: DayScenario; label: string }[] = [
  { id: 'weekday', label: '正常教学日' },
  { id: 'rainy', label: '雨天模式' },
  { id: 'weekend', label: '周末/节假日' },
];

export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const adjustedH = m === 60 ? h + 1 : h;
  const adjustedM = m === 60 ? 0 : m;
  return `${String(adjustedH).padStart(2, '0')}:${String(adjustedM).padStart(2, '0')}`;
}

export function getZoneName(zoneId: string): string {
  return PARKING_ZONES.find((z) => z.id === zoneId)?.name ?? '未知区域';
}

/**
 * 线性插值计算某一时刻的泊位占用率（支持天气/工作日场景与保卫科疏导分流效果）
 */
export function getZoneOccupancy(
  zone: ParkingZone,
  hour: number,
  dispatchedZoneIds: Set<string>,
  scenario: DayScenario = 'weekday',
  rules: GovernanceRules = DEFAULT_GOVERNANCE_RULES,
): { ratio: number; count: number; level: 'normal' | 'warning' | 'congested' } {
  const keys = Object.keys(zone.hourlyProfile)
    .map(Number)
    .sort((a, b) => a - b);

  let rawRatio = zone.hourlyProfile[keys[0]];
  if (hour >= keys[keys.length - 1]) {
    rawRatio = zone.hourlyProfile[keys[keys.length - 1]];
  } else {
    for (let i = 0; i < keys.length - 1; i++) {
      const t0 = keys[i];
      const t1 = keys[i + 1];
      if (hour >= t0 && hour <= t1) {
        const progress = (hour - t0) / (t1 - t0);
        rawRatio =
          zone.hourlyProfile[t0] +
          (zone.hourlyProfile[t1] - zone.hourlyProfile[t0]) * progress;
        break;
      }
    }
  }

  // 场景修正：雨天有雨棚区域更挤，露天区域略降；周末教学楼空闲、图书馆与宿舍偏满
  if (scenario === 'rainy') {
    rawRatio *= zone.hasShelter ? 1.14 : 0.88;
  } else if (scenario === 'weekend') {
    if (zone.category === 'teaching') rawRatio *= 0.36;
    else if (zone.category === 'library') rawRatio *= 1.08;
    else if (zone.category === 'dorm') rawRatio = Math.min(1.12, rawRatio + 0.16);
  }

  // 如果已下发保卫科疏导工单，溢流压力下降约 24%
  const baseCount = Math.round(
    (PARKING_ZONES.find((z) => z.id === zone.id)?.capacity ?? zone.capacity) *
      (dispatchedZoneIds.has(zone.id) ? Math.max(0.2, rawRatio - 0.24) : rawRatio),
  );

  // 根据管理员实时调整后的规划泊位容量计算真实占用率
  const ratio = zone.capacity > 0 ? baseCount / zone.capacity : rawRatio;
  const pct = ratio * 100;
  const level =
    pct >= rules.congestedThreshold
      ? 'congested'
      : pct >= rules.warningThreshold
        ? 'warning'
        : 'normal';

  return { ratio, count: baseCount, level };
}
