import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  MapPin,
  PlayCircle,
  Plus,
} from 'lucide-react';
import {
  type OrderStatus,
  type OrderType,
  type PatrolTeam,
  type WorkOrder,
  getZoneName,
} from '../data/parkingData';
import { downloadCsv } from '../utils/exportCsv';

interface DispatchViewProps {
  orders: WorkOrder[];
  teams: PatrolTeam[];
  onAdvanceStatus: (orderId: string, next: OrderStatus) => void;
  onChangeAssignee: (orderId: string, assignee: string) => void;
  onOpenReportViolation: () => void;
  onLocateZone: (zoneId: string) => void;
  onNotify: (msg: string) => void;
}

const TYPE_LABEL: Record<OrderType, string> = {
  congestion: '潮汐疏导',
  violation: '违停处置',
  zombie_clear: '僵尸车清运',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待派发',
  in_progress: '执勤处理中',
  resolved: '已完成销项',
};

export function DispatchView({
  orders,
  teams,
  onAdvanceStatus,
  onChangeAssignee,
  onOpenReportViolation,
  onLocateZone,
  onNotify,
}: DispatchViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');

  const counts = useMemo(
    () => ({
      all: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      in_progress: orders.filter((o) => o.status === 'in_progress').length,
      resolved: orders.filter((o) => o.status === 'resolved').length,
    }),
    [orders],
  );

  const filtered = useMemo(
    () =>
      statusFilter === 'all'
        ? orders
        : orders.filter((o) => o.status === statusFilter),
    [orders, statusFilter],
  );

  const handleExport = () => {
    downloadCsv(
      `西南交大犀浦校区_保卫科执勤调度记录_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        '工单号',
        '类型',
        '区域',
        '事件标题',
        '处置说明',
        '责任班组',
        '状态',
        '发起时间',
        '销项时间',
      ],
      filtered.map((o) => [
        o.id,
        TYPE_LABEL[o.type],
        getZoneName(o.zoneId),
        o.title,
        o.detail,
        o.assignee,
        STATUS_LABEL[o.status],
        o.createdAt,
        o.resolvedAt ?? '-',
      ]),
    );
    onNotify(`已导出 ${filtered.length} 条执勤调度工单记录（CSV）`);
  };

  return (
    <section className="workspace-page" aria-label="保卫科调度与巡检工单中心">
      <div className="workspace-inner">
        <div className="page-head">
          <div>
            <h1>调度与巡检工单</h1>
            <p>
              统一管理早八潮汐疏导、消防通道违停占道、僵尸车拖移清运等保卫科/后勤处日常执勤闭环。
            </p>
          </div>
          <div className="page-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExport}
            >
              <Download size={15} />
              导出执勤记录 CSV
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={onOpenReportViolation}
            >
              <Plus size={15} />
              上报违停 / 新建工单
            </button>
          </div>
        </div>

        <div className="toolbar-row">
          <div className="filter-pills" role="group" aria-label="按工单状态筛选">
            {(
              [
                ['all', `全部 (${counts.all})`],
                ['pending', `待派发 (${counts.pending})`],
                ['in_progress', `处理中 (${counts.in_progress})`],
                ['resolved', `已销项 (${counts.resolved})`],
              ] as ['all' | OrderStatus, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={statusFilter === key}
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="order-grid">
          {filtered.length === 0 ? (
            <div className="empty-state">当前状态下暂无工单</div>
          ) : (
            filtered.map((order) => (
              <article key={order.id} className="order-card">
                <div className="order-card-top">
                  <div className="order-badges">
                    <span className={`type-tag type-${order.type}`}>
                      {TYPE_LABEL[order.type]}
                    </span>
                    <span className="order-id">{order.id}</span>
                  </div>
                  <span className={`state-tag state-order-${order.status}`}>
                    {STATUS_LABEL[order.status]}
                  </span>
                </div>

                <h3>{order.title}</h3>
                <p className="order-detail">{order.detail}</p>

                <div className="order-meta-row">
                  <span>区域：{getZoneName(order.zoneId)}</span>
                  <span>发起：{order.createdAt}</span>
                  {order.resolvedAt && <span>销项：{order.resolvedAt}</span>}
                </div>

                <div className="order-footer">
                  <select
                    className="team-select"
                    aria-label="指派执勤班组"
                    value={order.assignee}
                    disabled={order.status === 'resolved'}
                    onChange={(e) =>
                      onChangeAssignee(order.id, e.target.value)
                    }
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.name}>
                        {team.name}
                      </option>
                    ))}
                  </select>

                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-action"
                      title="在 3D 地图上定位"
                      onClick={() => onLocateZone(order.zoneId)}
                    >
                      <MapPin size={14} />
                    </button>

                    {order.status === 'pending' && (
                      <button
                        type="button"
                        className="btn-primary sm"
                        onClick={() =>
                          onAdvanceStatus(order.id, 'in_progress')
                        }
                      >
                        <PlayCircle size={13} />
                        派发执勤
                      </button>
                    )}

                    {order.status === 'in_progress' && (
                      <button
                        type="button"
                        className="btn-primary sm"
                        onClick={() => onAdvanceStatus(order.id, 'resolved')}
                      >
                        <CheckCircle2 size={13} />
                        确认销项
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
