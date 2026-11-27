import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ClipboardList,
  Download,
  HelpCircle,
  Map as MapIcon,
  Monitor,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  Send,
  Settings,
  ShieldAlert,
  Smartphone,
  Upload,
} from 'lucide-react';
import { CampusMap3D, type MapMode } from './components/CampusMap3D';
import { ZoneDrawer } from './components/ZoneDrawer';
import { ClaimDialog } from './components/ClaimDialog';
import { ZombieLedgerView } from './components/ZombieLedgerView';
import { DispatchView } from './components/DispatchView';
import { AnalyticsView } from './components/AnalyticsView';
import { AdminView } from './components/AdminView';
import {
  BatchStickerDialog,
  RegisterZombieDialog,
  ReportViolationDialog,
  StickerPrintDialog,
  StudentPortalDialog,
} from './components/Modals';
import {
  DEFAULT_GOVERNANCE_RULES,
  INITIAL_AUDIT_LOGS,
  INITIAL_PATROL_TEAMS,
  INITIAL_WORK_ORDERS,
  INITIAL_ZOMBIE_BIKES,
  PARKING_ZONES,
  SCENARIO_OPTIONS,
  TIME_PRESETS,
  type AuditLogEntry,
  type DayScenario,
  type GovernanceRules,
  type OrderStatus,
  type ParkingZone,
  type PatrolTeam,
  type WorkOrder,
  type ZombieBike,
  formatHour,
  getZoneName,
  getZoneOccupancy,
} from './data/parkingData';
import {
  clearPersisted,
  loadPersisted,
  savePersisted,
} from './utils/storage';

type PrimaryTab = 'map' | 'ledger' | 'dispatch' | 'analytics' | 'admin';

interface PersistedState {
  zones: ParkingZone[];
  rules: GovernanceRules;
  teams: PatrolTeam[];
  auditLogs: AuditLogEntry[];
  zombieBikes: ZombieBike[];
  workOrders: WorkOrder[];
  dispatchedZoneIds: string[];
  scenario: DayScenario;
}

const DEFAULT_PERSISTED: PersistedState = {
  zones: PARKING_ZONES,
  rules: DEFAULT_GOVERNANCE_RULES,
  teams: INITIAL_PATROL_TEAMS,
  auditLogs: INITIAL_AUDIT_LOGS,
  zombieBikes: INITIAL_ZOMBIE_BIKES,
  workOrders: INITIAL_WORK_ORDERS,
  dispatchedZoneIds: [],
  scenario: 'weekday',
};

export function App() {
  const initial = useMemo(() => loadPersisted(DEFAULT_PERSISTED), []);

  const [activeTab, setActiveTab] = useState<PrimaryTab>('map');
  const [mapMode, setMapMode] = useState<MapMode>('tidal');
  const [hour, setHour] = useState<number>(7.83); // 默认 07:50 早八高峰
  const [scenario, setScenario] = useState<DayScenario>(initial.scenario);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zones, setZones] = useState<ParkingZone[]>(initial.zones);
  const [rules, setRules] = useState<GovernanceRules>(initial.rules);
  const [teams, setTeams] = useState<PatrolTeam[]>(initial.teams);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(initial.auditLogs);
  const [dispatchedZoneIds, setDispatchedZoneIds] = useState<Set<string>>(
    () => new Set(initial.dispatchedZoneIds),
  );
  const [zombieBikes, setZombieBikes] = useState<ZombieBike[]>(
    initial.zombieBikes,
  );
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initial.workOrders);

  // 弹窗与交互状态
  const [claimTarget, setClaimTarget] = useState<ZombieBike | null>(null);
  const [stickerTarget, setStickerTarget] = useState<ZombieBike | null>(null);
  const [batchStickersOpen, setBatchStickersOpen] = useState(false);
  const [studentPortalOpen, setStudentPortalOpen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const isInIframe = useMemo(() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }, []);
  const [registerModal, setRegisterModal] = useState<{
    open: boolean;
    zoneId?: string;
  }>({ open: false });
  const [reportPickMode, setReportPickMode] = useState(false);
  const [reportModal, setReportModal] = useState<{
    open: boolean;
    zoneId?: string;
    coords?: [number, number];
  }>({ open: false });
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const appendAudit = (actor: string, action: string, detail: string) => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setAuditLogs((prev) => [
      {
        id: `LOG-${String(prev.length + 1).padStart(3, '0')}`,
        time,
        actor,
        action,
        detail,
      },
      ...prev.slice(0, 79),
    ]);
  };

  // 本地持久化：所有操作刷新不丢失
  useEffect(() => {
    savePersisted<PersistedState>({
      zones,
      rules,
      teams,
      auditLogs,
      zombieBikes,
      workOrders,
      dispatchedZoneIds: Array.from(dispatchedZoneIds),
      scenario,
    });
  }, [
    zones,
    rules,
    teams,
    auditLogs,
    zombieBikes,
    workOrders,
    dispatchedZoneIds,
    scenario,
  ]);

  // 全局快捷键：Space 播放/暂停时间推演，1-5 快速切模块，Esc 关闭抽屉或拾取模式
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (reportPickMode) setReportPickMode(false);
        else if (selectedZoneId) setSelectedZoneId(null);
        return;
      }

      if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === ' ' && activeTab === 'map' && mapMode === 'tidal') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === '1') {
        setActiveTab('map');
      } else if (e.key === '2') {
        setActiveTab('ledger');
        setIsPlaying(false);
      } else if (e.key === '3') {
        setActiveTab('dispatch');
        setIsPlaying(false);
      } else if (e.key === '4') {
        setActiveTab('analytics');
        setIsPlaying(false);
      } else if (e.key === '5') {
        setActiveTab('admin');
        setIsPlaying(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reportPickMode, selectedZoneId, activeTab, mapMode]);

  // 时间轴自动播放
  useEffect(() => {
    if (!isPlaying || activeTab !== 'map' || mapMode !== 'tidal') return;
    const timer = window.setInterval(() => {
      setHour((prev) => (prev >= 23.25 ? 6.0 : +(prev + 0.12).toFixed(2)));
    }, 320);
    return () => window.clearInterval(timer);
  }, [isPlaying, activeTab, mapMode]);

  // 顶部仅保留 3 个最必要核心指标（同时提供实时拥堵清单供一键全校调度）
  const summary = useMemo(() => {
    const congestedZones: { id: string; name: string; pct: number }[] = [];
    let totalCapacity = 0;
    let totalUsed = 0;

    for (const zone of zones) {
      const { ratio, count, level } = getZoneOccupancy(
        zone,
        hour,
        dispatchedZoneIds,
        scenario,
        rules,
      );
      if (level === 'congested') {
        congestedZones.push({
          id: zone.id,
          name: zone.name,
          pct: Math.round(ratio * 100),
        });
      }
      totalCapacity += zone.capacity;
      totalUsed += Math.min(zone.capacity, count);
    }

    const freeRate = Math.max(
      0,
      Math.round(((totalCapacity - totalUsed) / totalCapacity) * 100),
    );
    const activeZombies = zombieBikes.filter(
      (b) => b.status === 'suspect' || b.status === 'tagged',
    ).length;
    const openOrders = workOrders.filter((o) => o.status !== 'resolved').length;

    return {
      congestedCount: congestedZones.length,
      congestedZones,
      freeRate,
      activeZombies,
      openOrders,
    };
  }, [zones, rules, hour, scenario, dispatchedZoneIds, zombieBikes, workOrders]);

  const taggedBikes = useMemo(
    () => zombieBikes.filter((b) => b.status === 'tagged'),
    [zombieBikes],
  );

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  );

  const selectedZoneBikes = useMemo(
    () => zombieBikes.filter((b) => b.zoneId === selectedZoneId),
    [zombieBikes, selectedZoneId],
  );

  const selectedZoneOrders = useMemo(
    () => workOrders.filter((o) => o.zoneId === selectedZoneId),
    [workOrders, selectedZoneId],
  );

  const handleToggleDispatch = (zoneId: string) => {
    const zone = zones.find((z) => z.id === zoneId);
    const isCurrentlyDispatched = dispatchedZoneIds.has(zoneId);

    setDispatchedZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });

    if (!isCurrentlyDispatched && zone) {
      const nowStr = formatHour(hour);
      const newOrder: WorkOrder = {
        id: `WO-2026-${String(workOrders.length + 83).padStart(3, '0')}`,
        type: 'congestion',
        zoneId,
        title: `${zone.name} 潮汐拥堵现场疏导`,
        detail: `已派发执勤人员前往引导车辆分流至「${zone.overflowTarget}」。`,
        assignee: zone.patrolTeam,
        status: 'in_progress',
        createdAt: nowStr,
        coordinates: zone.coordinates,
      };
      setWorkOrders((prev) => [newOrder, ...prev]);
      appendAudit('保卫科管理员', '派发疏导工单', `${zone.name} → ${zone.patrolTeam}`);
      notify(`已向「${zone.patrolTeam.split('（')[0]}」派发疏导工单`);
    } else if (zone) {
      appendAudit('保卫科管理员', '撤回调度', `撤回 ${zone.name} 的临时疏导调度`);
      notify(`已撤回 ${zone.shortName} 的临时疏导调度`);
    }
  };

  const handleTagBike = (bikeId: string) => {
    setZombieBikes((prev) =>
      prev.map((b) =>
        b.id === bikeId
          ? { ...b, status: 'tagged', noticeDaysLeft: rules.noticePeriodDays }
          : b,
      ),
    );
    appendAudit('后勤巡检组', '贴码公示', `${bikeId} 启动 ${rules.noticePeriodDays} 天扫码公示`);
    notify(`已为 ${bikeId} 启动 ${rules.noticePeriodDays} 天扫码公示，可随时打印贴纸`);
  };

  const handleClearBike = (bikeId: string) => {
    const bike = zombieBikes.find((b) => b.id === bikeId);
    const today = new Date().toISOString().slice(0, 10);
    const slot = `西区暂存库 A-${String(Math.floor(Math.random() * 80) + 10)}`;

    setZombieBikes((prev) =>
      prev.map((b) =>
        b.id === bikeId
          ? { ...b, status: 'cleared', clearedAt: today, warehouseSlot: slot }
          : b,
      ),
    );
    appendAudit('后勤清运车队', '清运入库', `${bikeId} 已拖移至 ${slot}`);
    notify(
      bike
        ? `${bike.id} 已清运入库（${slot}）`
        : '车辆已完成清运入库留痕',
    );
  };

  const handleClaimResult = (
    bikeId: string,
    action: 'claim' | 'abandon' | 'cancel',
  ) => {
    setClaimTarget(null);
    if (action === 'claim') {
      setZombieBikes((prev) =>
        prev.map((b) => (b.id === bikeId ? { ...b, status: 'claimed' } : b)),
      );
      appendAudit('车主扫码端', '确认认领', `车主确认「我还在用」，${bikeId} 续期 90 天`);
      notify(`车主已确认「我还在用」，${bikeId} 已撤销清理`);
    } else if (action === 'abandon') {
      handleClearBike(bikeId);
    }
  };

  const handleRegisterZombie = (payload: {
    zoneId: string;
    vehicleType: '自行车' | '电动车';
    description: string;
    idleDays: number;
    spotNote: string;
    photoDataUrl?: string;
  }) => {
    const id = `SW-26-${String(200 + zombieBikes.length).padStart(4, '0')}`;
    const nextBike: ZombieBike = {
      id,
      ...payload,
      status: 'suspect',
      registeredAt: new Date().toISOString().slice(0, 10),
    };
    setZombieBikes((prev) => [nextBike, ...prev]);
    notify(`已录入疑似僵尸车 ${id}（${getZoneName(payload.zoneId)}）`);
  };

  const handleCreateViolationOrder = (payload: {
    zoneId: string;
    title: string;
    detail: string;
    assignee: string;
    coordinates?: [number, number];
  }) => {
    const id = `WO-2026-${String(workOrders.length + 83).padStart(3, '0')}`;
    const newOrder: WorkOrder = {
      id,
      type: 'violation',
      zoneId: payload.zoneId,
      title: payload.title,
      detail: payload.detail,
      assignee: payload.assignee,
      status: 'pending',
      createdAt: formatHour(hour),
      coordinates: payload.coordinates,
    };
    setWorkOrders((prev) => [newOrder, ...prev]);
    notify(`违停工单 ${id} 已生成并标注至 3D 地图`);
  };

  const handleAdvanceOrderStatus = (orderId: string, next: OrderStatus) => {
    setWorkOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: next,
              resolvedAt: next === 'resolved' ? formatHour(hour) : o.resolvedAt,
            }
          : o,
      ),
    );
    notify(next === 'resolved' ? `工单 ${orderId} 已完成销项` : `工单 ${orderId} 已派发执勤`);
  };

  const handleChangeAssignee = (orderId: string, assignee: string) => {
    setWorkOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, assignee } : o)),
    );
  };

  const handleLocateZone = (zoneId: string) => {
    setActiveTab('map');
    setSelectedZoneId(zoneId);
  };

  const handleDispatchAllCongested = () => {
    if (summary.congestedZones.length === 0) return;
    const nowStr = formatHour(hour);
    const newOrders: WorkOrder[] = [];

    setDispatchedZoneIds((prev) => {
      const next = new Set(prev);
      summary.congestedZones.forEach((cz, idx) => {
        if (!next.has(cz.id)) {
          next.add(cz.id);
          const zone = PARKING_ZONES.find((z) => z.id === cz.id);
          if (zone) {
            newOrders.push({
              id: `WO-2026-${String(workOrders.length + 83 + idx).padStart(3, '0')}`,
              type: 'congestion',
              zoneId: zone.id,
              title: `${zone.name} 潮汐拥堵一键疏导`,
              detail: `系统一键调度：已通知班组引导车辆分流至「${zone.overflowTarget}」。`,
              assignee: zone.patrolTeam,
              status: 'in_progress',
              createdAt: nowStr,
              coordinates: zone.coordinates,
            });
          }
        }
      });
      return next;
    });

    if (newOrders.length > 0) {
      setWorkOrders((prev) => [...newOrders, ...prev]);
      notify(`已为全校 ${newOrders.length} 处拥堵点位一键派发疏导工单`);
    }
  };

  const handleUpdateZone = (
    zoneId: string,
    patch: Partial<ParkingZone>,
    logChange = true,
  ) => {
    setZones((prev) =>
      prev.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)),
    );
    const target = zones.find((z) => z.id === zoneId);
    if (logChange && target && patch.capacity !== undefined) {
      appendAudit(
        '保卫科管理员',
        '调整泊位容量',
        `${target.name} 规划泊位调整为 ${patch.capacity} 个`,
      );
    }
  };

  const handleUpdateRules = (patch: Partial<GovernanceRules>) => {
    setRules((prev) => ({ ...prev, ...patch }));
  };

  const handleToggleTeamDuty = (teamId: string) => {
    const target = teams.find((t) => t.id === teamId);
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, onDuty: !t.onDuty } : t)),
    );
    if (target) {
      appendAudit(
        '保卫科管理员',
        '变更值班状态',
        `${target.name} 设为「${target.onDuty ? '已休班' : '值班在岗'}」`,
      );
    }
  };

  const handleAddTeam = (team: Omit<PatrolTeam, 'id' | 'onDuty'>) => {
    const next: PatrolTeam = {
      id: `team-${Date.now()}`,
      ...team,
      onDuty: true,
    };
    setTeams((prev) => [...prev, next]);
    appendAudit('保卫科管理员', '新增网格班组', `${team.name}（负责人：${team.leader}）`);
    notify(`已新增执勤班组「${team.name}」`);
  };

  const handleExportBackup = () => {
    const payload: PersistedState = {
      zones,
      rules,
      teams,
      auditLogs,
      zombieBikes,
      workOrders,
      dispatchedZoneIds: Array.from(dispatchedZoneIds),
      scenario,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `交点泊序_犀浦校区台账备份_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('已导出本地台账 JSON 备份文件');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<PersistedState>;
        if (Array.isArray(parsed.zones)) setZones(parsed.zones);
        if (parsed.rules) setRules({ ...DEFAULT_GOVERNANCE_RULES, ...parsed.rules });
        if (Array.isArray(parsed.teams)) setTeams(parsed.teams);
        if (Array.isArray(parsed.auditLogs)) setAuditLogs(parsed.auditLogs);
        if (Array.isArray(parsed.zombieBikes)) setZombieBikes(parsed.zombieBikes);
        if (Array.isArray(parsed.workOrders)) setWorkOrders(parsed.workOrders);
        if (Array.isArray(parsed.dispatchedZoneIds)) {
          setDispatchedZoneIds(new Set(parsed.dispatchedZoneIds));
        }
        if (parsed.scenario) setScenario(parsed.scenario);
        notify('已成功导入台账备份数据');
      } catch {
        notify('备份文件格式无效，请选择本系统导出的 JSON 文件');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleResetDemo = () => {
    clearPersisted();
    setZones(PARKING_ZONES);
    setRules(DEFAULT_GOVERNANCE_RULES);
    setTeams(INITIAL_PATROL_TEAMS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setZombieBikes(INITIAL_ZOMBIE_BIKES);
    setWorkOrders(INITIAL_WORK_ORDERS);
    setDispatchedZoneIds(new Set());
    setScenario('weekday');
    setHour(7.83);
    notify('已恢复犀浦校区初始演示数据');
  };

  if (mobilePreview && !isInIframe) {
    return (
      <main className="mobile-preview-stage">
        <div className="mobile-preview-bar glass-pill">
          <span className="preview-label">
            <Smartphone size={15} />
            交点泊序 · 手机端实时交互预览（390 × 780）
          </span>
          <button
            type="button"
            className="btn-primary sm"
            onClick={() => setMobilePreview(false)}
          >
            <Monitor size={14} />
            返回桌面端
          </button>
        </div>

        <div className="phone-bezel">
          <div className="phone-notch" aria-hidden="true" />
          <iframe
            src={window.location.href}
            title="交点泊序手机端实时预览"
            className="phone-iframe"
          />
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {/* 顶部极简浮岛栏：品牌 + 4 个主视图切换 + 3 个核心指标 */}
      <header className="top-bar no-print">
        <div className="brand-group glass-pill">
          <div className="brand-mark">
            <span className="brand-dot" aria-hidden="true" />
            <span className="brand-title">交点泊序</span>
            <span className="brand-sub">西南交大 · 犀浦校区</span>
          </div>

          <nav className="mode-switch" aria-label="系统功能导航">
            <button
              type="button"
              aria-pressed={activeTab === 'map'}
              onClick={() => setActiveTab('map')}
            >
              <MapIcon size={14} />
              3D 态势
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'ledger'}
              onClick={() => {
                setActiveTab('ledger');
                setIsPlaying(false);
              }}
            >
              <ClipboardList size={14} />
              僵尸车台账
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'dispatch'}
              onClick={() => {
                setActiveTab('dispatch');
                setIsPlaying(false);
              }}
            >
              <ShieldAlert size={14} />
              执勤工单
              {summary.openOrders > 0 && (
                <span className="nav-badge">{summary.openOrders}</span>
              )}
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'analytics'}
              onClick={() => {
                setActiveTab('analytics');
                setIsPlaying(false);
              }}
            >
              <BarChart3 size={14} />
              决策简报
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'admin'}
              onClick={() => {
                setActiveTab('admin');
                setIsPlaying(false);
              }}
            >
              <Settings size={14} />
              系统管理
            </button>
          </nav>
        </div>

        <div className="kpi-strip glass-pill" aria-label="核心状态概览">
          <button
            type="button"
            className="kpi-item kpi-btn"
            popoverTarget="congestion-quick-popover"
            title="点击查看当前拥堵点位并一键疏导"
          >
            <span className="kpi-label">拥堵点位</span>
            <span
              className={`kpi-value ${summary.congestedCount > 0 ? 'danger' : ''}`}
            >
              {summary.congestedCount} 处
            </span>
          </button>
          <div className="kpi-item">
            <span className="kpi-label">空余泊位</span>
            <span className="kpi-value">{summary.freeRate}%</span>
          </div>
          <button
            type="button"
            className="kpi-item kpi-btn"
            onClick={() => {
              setActiveTab('ledger');
              setIsPlaying(false);
            }}
            title="点击打开僵尸车台账"
          >
            <span className="kpi-label">待清僵尸车</span>
            <span
              className={`kpi-value ${summary.activeZombies > 0 ? 'zombie' : ''}`}
            >
              {summary.activeZombies} 辆
            </span>
          </button>

          {!isInIframe && (
            <button
              type="button"
              className="help-btn desktop-only-btn"
              onClick={() => setMobilePreview(true)}
              aria-label="在电脑上切换手机端预览"
              title="切换手机端预览"
            >
              <Smartphone size={16} />
            </button>
          )}

          <button
            type="button"
            className="help-btn"
            onClick={() => setStudentPortalOpen(true)}
            aria-label="预览师生微端（找车位与扫码认领）"
            title="师生微信微端（找车位/扫码）"
          >
            <QrCode size={16} />
          </button>

          <button
            type="button"
            className="help-btn"
            popoverTarget="map-legend-popover"
            aria-label="查看图例与数据备份"
            title="图例与数据备份"
          >
            <HelpCircle size={16} />
          </button>
        </div>
      </header>

      {/* 原生 Popover：拥堵点位快览与一键全校疏导 */}
      <div
        id="congestion-quick-popover"
        popover="auto"
        className="legend-popover congestion-popover"
      >
        <h3>当前拥堵点位（{formatHour(hour)}）</h3>
        {summary.congestedZones.length === 0 ? (
          <p className="legend-tip" style={{ marginTop: 0, borderTop: 'none', paddingTop: 0 }}>
            全校当前无拥堵溢流点位，泊车秩序良好。
          </p>
        ) : (
          <>
            <div className="congestion-list">
              {summary.congestedZones.map((cz) => (
                <button
                  key={cz.id}
                  type="button"
                  className="congestion-row"
                  onClick={() => {
                    setMapMode('tidal');
                    handleLocateZone(cz.id);
                  }}
                >
                  <span>{cz.name}</span>
                  <strong style={{ color: 'var(--status-danger)' }}>
                    {cz.pct}%
                  </strong>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', marginTop: 10, padding: '8px 12px', fontSize: 12 }}
              onClick={handleDispatchAllCongested}
            >
              <Send size={13} />
              一键派发全校潮汐疏导 ({summary.congestedZones.length})
            </button>
          </>
        )}
      </div>

      {/* 原生 Popover 图例与演示重置（平时零打扰） */}
      <div id="map-legend-popover" popover="auto" className="legend-popover">
        <h3>图例与操作说明</h3>
        <div className="legend-row">
          <span className="swatch" style={{ background: '#10b981' }} />
          <span>泊序正常（占用 &lt; 72%）</span>
        </div>
        <div className="legend-row">
          <span className="swatch" style={{ background: '#f59e0b' }} />
          <span>趋于饱和（72% – 91%）</span>
        </div>
        <div className="legend-row">
          <span className="swatch" style={{ background: '#ef4444' }} />
          <span>拥堵溢流 / 僵尸车聚集区</span>
        </div>
        <div className="legend-row">
          <span className="swatch" style={{ background: '#2563eb' }} />
          <span>早八潮汐流向（宿舍 → 教学楼）</span>
        </div>
        <p className="legend-tip">
          底图采用 OpenStreetMap 西南交大犀浦校区 258 栋真实 3D 建筑轮廓，100% 离线运行；所有登记、派单与清运操作自动保存至本地浏览器。
        </p>
        <div className="backup-actions">
          <button
            type="button"
            className="btn-secondary sm"
            onClick={handleExportBackup}
          >
            <Download size={12} />
            导出备份
          </button>
          <label className="btn-secondary sm" style={{ cursor: 'pointer' }}>
            <Upload size={12} />
            导入备份
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleImportBackup}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-secondary"
          style={{ width: '100%', marginTop: 8, padding: '7px 10px', fontSize: 12 }}
          onClick={handleResetDemo}
        >
          <RotateCcw size={13} />
          恢复初始演示数据
        </button>
      </div>

      {/* 轻量 Toast 操作反馈 */}
      {toast && (
        <div className="toast-pill glass-pill no-print" role="status">
          {toast}
        </div>
      )}

      {/* 3D 地图常驻底层（切 Tab 不重建 WebGL 实例，切回零延迟！） */}
      <div
        className="map-host"
        style={{
          visibility: activeTab === 'map' ? 'visible' : 'hidden',
          pointerEvents: activeTab === 'map' ? 'auto' : 'none',
        }}
      >
        <CampusMap3D
          zones={zones}
          rules={rules}
          mode={mapMode}
          hour={hour}
          scenario={scenario}
          selectedZoneId={selectedZoneId}
          dispatchedZoneIds={dispatchedZoneIds}
          zombieBikes={zombieBikes}
          workOrders={workOrders}
          reportPickMode={reportPickMode}
          onSelectZone={setSelectedZoneId}
          onToggleReportPickMode={() => setReportPickMode((p) => !p)}
          onPickReportLocation={(coords, nearestZoneId) => {
            setReportPickMode(false);
            setReportModal({ open: true, zoneId: nearestZoneId, coords });
          }}
          onNotify={notify}
        />

        {/* 地图左上角轻量双模式切换（潮汐 / 僵尸车分布） */}
        <div className="map-subswitch glass-pill no-print" role="group" aria-label="地图图层模式">
          <button
            type="button"
            aria-pressed={mapMode === 'tidal'}
            onClick={() => setMapMode('tidal')}
          >
            潮汐拥堵
          </button>
          <button
            type="button"
            aria-pressed={mapMode === 'zombie'}
            onClick={() => {
              setMapMode('zombie');
              setIsPlaying(false);
            }}
          >
            僵尸车分布
          </button>
        </div>

        {/* 按需滑出的右侧详情抽屉 */}
        {selectedZone && (
          <ZoneDrawer
            zone={selectedZone}
            rules={rules}
            mode={mapMode}
            hour={hour}
            scenario={scenario}
            isDispatched={dispatchedZoneIds.has(selectedZone.id)}
            bikes={selectedZoneBikes}
            zoneOrders={selectedZoneOrders}
            onClose={() => setSelectedZoneId(null)}
            onToggleDispatch={handleToggleDispatch}
            onTagBike={handleTagBike}
            onOpenClaimDialog={setClaimTarget}
            onOpenStickerDialog={setStickerTarget}
            onOpenRegisterZombie={(zoneId) =>
              setRegisterModal({ open: true, zoneId })
            }
            onClearBike={handleClearBike}
            onResolveOrder={(id) => handleAdvanceOrderStatus(id, 'resolved')}
          />
        )}

        {/* 潮汐模式下底部轻量化时间轴 + 场景切换（移动端打开详情底栏时自动隐藏避免遮挡） */}
        {mapMode === 'tidal' && (
          <section
            className={`time-dock glass-pill no-print ${selectedZone ? 'hide-on-mobile' : ''}`}
            aria-label="24 小时潮汐推演"
          >
            <div className="time-dock-top">
              <button
                type="button"
                className="play-btn"
                onClick={() => setIsPlaying((p) => !p)}
                aria-label={isPlaying ? '暂停时间推演' : '自动播放时间推演'}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <span className="time-readout">{formatHour(hour)}</span>
              <input
                type="range"
                className="time-slider"
                min={6}
                max={23.25}
                step={0.05}
                value={hour}
                onChange={(e) => {
                  setIsPlaying(false);
                  setHour(Number(e.target.value));
                }}
                aria-label="选择校园时刻"
              />
            </div>

            <div className="time-dock-bottom">
              <div className="time-presets">
                {TIME_PRESETS.map((preset) => {
                  const isActive = Math.abs(hour - preset.hour) < 0.25;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      className={isActive ? 'is-active' : ''}
                      onClick={() => {
                        setIsPlaying(false);
                        setHour(preset.hour);
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <select
                className="scenario-select"
                aria-label="校园天气与作息场景"
                value={scenario}
                onChange={(e) => setScenario(e.target.value as DayScenario)}
              >
                {SCENARIO_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}
      </div>

      {/* 其余 3 个专业工作台视图 */}
      {activeTab === 'ledger' && (
        <ZombieLedgerView
          bikes={zombieBikes}
          onTagBike={handleTagBike}
          onOpenClaimDialog={setClaimTarget}
          onOpenStickerDialog={setStickerTarget}
          onOpenBatchStickers={() => setBatchStickersOpen(true)}
          onOpenRegisterZombie={(zoneId) =>
            setRegisterModal({ open: true, zoneId })
          }
          onClearBike={handleClearBike}
          onLocateZone={(zoneId) => {
            setMapMode('zombie');
            handleLocateZone(zoneId);
          }}
          onNotify={notify}
        />
      )}

      {activeTab === 'dispatch' && (
        <DispatchView
          orders={workOrders}
          teams={teams}
          onAdvanceStatus={handleAdvanceOrderStatus}
          onChangeAssignee={handleChangeAssignee}
          onOpenReportViolation={() => setReportModal({ open: true })}
          onLocateZone={(zoneId) => {
            setMapMode('tidal');
            handleLocateZone(zoneId);
          }}
          onNotify={notify}
        />
      )}

      {activeTab === 'analytics' && (
        <AnalyticsView
          zones={zones}
          rules={rules}
          scenario={scenario}
          zombieBikes={zombieBikes}
          workOrders={workOrders}
        />
      )}

      {activeTab === 'admin' && (
        <AdminView
          zones={zones}
          rules={rules}
          teams={teams}
          auditLogs={auditLogs}
          onUpdateZone={handleUpdateZone}
          onUpdateRules={handleUpdateRules}
          onToggleTeamDuty={handleToggleTeamDuty}
          onAddTeam={handleAddTeam}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onResetDemo={handleResetDemo}
          onLocateZone={(zoneId) => {
            setMapMode('tidal');
            handleLocateZone(zoneId);
          }}
          onNotify={notify}
        />
      )}

      {/* 移动端专属底部原生感 5-Tab 导航栏（≤ 768px 显示） */}
      <nav className="mobile-tabbar no-print" aria-label="移动端主导航">
        <button
          type="button"
          aria-pressed={activeTab === 'map'}
          onClick={() => setActiveTab('map')}
        >
          <MapIcon size={17} />
          <span>3D 态势</span>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'ledger'}
          onClick={() => {
            setActiveTab('ledger');
            setIsPlaying(false);
          }}
        >
          <ClipboardList size={17} />
          <span>僵尸车</span>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'dispatch'}
          onClick={() => {
            setActiveTab('dispatch');
            setIsPlaying(false);
          }}
        >
          <span className="mobile-icon-wrap">
            <ShieldAlert size={17} />
            {summary.openOrders > 0 && (
              <span className="mobile-badge">{summary.openOrders}</span>
            )}
          </span>
          <span>工单</span>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'analytics'}
          onClick={() => {
            setActiveTab('analytics');
            setIsPlaying(false);
          }}
        >
          <BarChart3 size={17} />
          <span>简报</span>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'admin'}
          onClick={() => {
            setActiveTab('admin');
            setIsPlaying(false);
          }}
        >
          <Settings size={17} />
          <span>管理</span>
        </button>
      </nav>

      {/* 原生 <dialog> 弹窗组（遵循 Google modern-web-guidance） */}
      <ClaimDialog bike={claimTarget} onResult={handleClaimResult} />
      <StickerPrintDialog
        bike={stickerTarget}
        onClose={() => setStickerTarget(null)}
      />
      <BatchStickerDialog
        bikes={taggedBikes}
        open={batchStickersOpen}
        onClose={() => setBatchStickersOpen(false)}
      />
      <RegisterZombieDialog
        open={registerModal.open}
        defaultZoneId={registerModal.zoneId}
        onClose={() => setRegisterModal({ open: false })}
        onSubmit={handleRegisterZombie}
      />
      <ReportViolationDialog
        open={reportModal.open}
        teams={teams}
        defaultZoneId={reportModal.zoneId}
        defaultCoords={reportModal.coords}
        onClose={() => setReportModal({ open: false })}
        onSubmit={handleCreateViolationOrder}
      />
      <StudentPortalDialog
        open={studentPortalOpen}
        zones={zones}
        rules={rules}
        hour={hour}
        scenario={scenario}
        dispatchedZoneIds={dispatchedZoneIds}
        zombieBikes={zombieBikes}
        onClose={() => setStudentPortalOpen(false)}
        onClaimBike={setClaimTarget}
      />
    </main>
  );
}

export default App;
