import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Printer,
  QrCode,
  Send,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  type DayScenario,
  type GovernanceRules,
  type ParkingZone,
  type WorkOrder,
  type ZombieBike,
  formatHour,
  getZoneOccupancy,
} from '../data/parkingData';
import type { MapMode } from './CampusMap3D';

interface ZoneDrawerProps {
  zone: ParkingZone;
  rules: GovernanceRules;
  mode: MapMode;
  hour: number;
  scenario: DayScenario;
  isDispatched: boolean;
  bikes: ZombieBike[];
  zoneOrders: WorkOrder[];
  onClose: () => void;
  onToggleDispatch: (zoneId: string) => void;
  onTagBike: (bikeId: string) => void;
  onOpenClaimDialog: (bike: ZombieBike) => void;
  onOpenStickerDialog: (bike: ZombieBike) => void;
  onOpenRegisterZombie: (zoneId: string) => void;
  onClearBike: (bikeId: string) => void;
  onResolveOrder: (orderId: string) => void;
}

export function ZoneDrawer({
  zone,
  rules,
  mode,
  hour,
  scenario,
  isDispatched,
  bikes,
  zoneOrders,
  onClose,
  onToggleDispatch,
  onTagBike,
  onOpenClaimDialog,
  onOpenStickerDialog,
  onOpenRegisterZombie,
  onClearBike,
  onResolveOrder,
}: ZoneDrawerProps) {
  const dispatchedSet = isDispatched ? new Set([zone.id]) : new Set<string>();
  const { ratio, count, level } = getZoneOccupancy(
    zone,
    hour,
    dispatchedSet,
    scenario,
    rules,
  );
  const pct = Math.round(ratio * 100);

  const barColor =
    level === 'congested'
      ? 'var(--status-danger)'
      : level === 'warning'
        ? 'var(--status-warn)'
        : 'var(--status-ok)';

  const levelLabel =
    level === 'congested'
      ? '拥堵溢流'
      : level === 'warning'
        ? '趋于饱和'
        : '泊序正常';

  const activeBikes = bikes.filter(
    (b) => b.status === 'suspect' || b.status === 'tagged',
  );
  const resolvedBikes = bikes.filter(
    (b) => b.status === 'claimed' || b.status === 'cleared',
  );
  const openViolations = zoneOrders.filter(
    (o) => o.type === 'violation' && o.status !== 'resolved',
  );

  return (
    <aside className="zone-drawer glass-pill" aria-label={`${zone.name} 详情`}>
      <div className="sheet-handle" aria-hidden="true" />
      <div className="drawer-header">
        <div>
          <h2>{zone.name}</h2>
          <p className="drawer-sub">
            {mode === 'tidal'
              ? `${formatHour(hour)} · 规划泊位 ${zone.capacity} 个${zone.hasShelter ? ' · 含雨棚' : ''}`
              : `待处理僵尸车 ${activeBikes.length} 辆 · 责任班组：${zone.patrolTeam.split('（')[0]}`}
          </p>
        </div>
        <button
          type="button"
          className="close-btn"
          onClick={onClose}
          aria-label="关闭详情面板"
        >
          <X size={16} />
        </button>
      </div>

      <div className="drawer-body">
        {mode === 'tidal' ? (
          <>
            <div className="stat-block">
              <div className="stat-row">
                <span className="stat-big">{pct}%</span>
                <span className={`status-badge ${level}`}>{levelLabel}</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
              <div className="stat-row">
                <span className="stat-cap">
                  约停放 <strong>{count}</strong> 辆（容量 {zone.capacity}）
                </span>
                {count > zone.capacity && (
                  <span style={{ fontSize: 12, color: 'var(--status-danger)' }}>
                    溢流 +{count - zone.capacity} 辆
                  </span>
                )}
              </div>
            </div>

            <div className="advice-card">
              <span className="advice-title">
                保卫科调度建议 · {zone.patrolTeam}
              </span>
              <p className="advice-text">
                {level === 'normal'
                  ? '当前车位余量充足，保持网格常规巡检即可。'
                  : `建议引导新增车辆分流至「${zone.overflowTarget}」，并在出入口启用临时潮汐指引牌。`}
              </p>

              {isDispatched ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onToggleDispatch(zone.id)}
                >
                  <CheckCircle2 size={15} />
                  已派单疏导中（点击撤回）
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onToggleDispatch(zone.id)}
                >
                  <Send size={14} />
                  一键派发保卫疏导工单
                </button>
              )}
            </div>

            {openViolations.length > 0 && (
              <div className="advice-card">
                <span className="advice-title" style={{ color: '#c2410c' }}>
                  本区待处置违停事件（{openViolations.length}）
                </span>
                {openViolations.map((order) => (
                  <div key={order.id} className="mini-order">
                    <div className="mini-order-title">
                      <AlertTriangle size={13} color="#ea580c" />
                      <span>{order.title}</span>
                    </div>
                    <p className="mini-order-desc">{order.detail}</p>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      onClick={() => onResolveOrder(order.id)}
                    >
                      现场已整改，标记销项
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="zombie-list">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onOpenRegisterZombie(zone.id)}
            >
              <Plus size={14} />
              在本区登记新发现的疑似僵尸车
            </button>

            {activeBikes.length === 0 ? (
              <div className="empty-state">
                该区域当前无待处理僵尸车。
                <br />
                点击地图上标红或标黄的宿舍/教学区即可查看，或点击上方按钮新登记车辆。
              </div>
            ) : (
              activeBikes.map((bike) => (
                <article key={bike.id} className="zombie-card">
                  <div className="zombie-top">
                    <span className="zombie-id">
                      {bike.id} · {bike.vehicleType}
                    </span>
                    <span className="zombie-days">静置 {bike.idleDays} 天</span>
                  </div>
                  <p className="zombie-desc">{bike.description}</p>
                  <div className="zombie-meta">
                    位置：{bike.spotNote}
                    {bike.status === 'tagged' && (
                      <>
                        {' · '}
                        {bike.noticeDaysLeft === 0
                          ? '15 天公示已到期'
                          : `公示剩余 ${bike.noticeDaysLeft} 天`}
                      </>
                    )}
                  </div>
                  <div className="zombie-actions">
                    {bike.status === 'suspect' && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => onTagBike(bike.id)}
                      >
                        <Tag size={13} />
                        贴码公示 (15天)
                      </button>
                    )}

                    {bike.status === 'tagged' && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onOpenStickerDialog(bike)}
                          title="生成可打印车身扫码贴纸"
                        >
                          <Printer size={13} />
                          打印贴纸
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onOpenClaimDialog(bike)}
                        >
                          <QrCode size={13} />
                          模拟扫码
                        </button>
                        {bike.noticeDaysLeft === 0 && (
                          <button
                            type="button"
                            className="btn-danger-soft"
                            onClick={() => onClearBike(bike.id)}
                          >
                            <Trash2 size={13} />
                            清运
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              ))
            )}

            {resolvedBikes.length > 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  paddingTop: 4,
                }}
              >
                本区已闭环：{resolvedBikes.length} 辆（
                {resolvedBikes
                  .map((b) =>
                    b.status === 'claimed'
                      ? `${b.id} 已认领`
                      : `${b.id} 已清运`,
                  )
                  .join('、')}
                ）
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
