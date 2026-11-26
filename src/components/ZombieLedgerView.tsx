import { useMemo, useState } from 'react';
import {
  Download,
  MapPin,
  Plus,
  Printer,
  QrCode,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  type ZombieBike,
  type ZombieStatus,
  getZoneName,
} from '../data/parkingData';
import { downloadCsv } from '../utils/exportCsv';

interface ZombieLedgerViewProps {
  bikes: ZombieBike[];
  onTagBike: (bikeId: string) => void;
  onOpenClaimDialog: (bike: ZombieBike) => void;
  onOpenStickerDialog: (bike: ZombieBike) => void;
  onOpenBatchStickers: () => void;
  onOpenRegisterZombie: (zoneId?: string) => void;
  onClearBike: (bikeId: string) => void;
  onLocateZone: (zoneId: string) => void;
  onNotify: (msg: string) => void;
}

type FilterKey = 'all' | ZombieStatus | 'expired';

const STATUS_LABEL: Record<ZombieStatus, string> = {
  suspect: '疑似闲置',
  tagged: '公示中',
  claimed: '车主已认领',
  cleared: '已清运入库',
};

export function ZombieLedgerView({
  bikes,
  onTagBike,
  onOpenClaimDialog,
  onOpenStickerDialog,
  onOpenBatchStickers,
  onOpenRegisterZombie,
  onClearBike,
  onLocateZone,
  onNotify,
}: ZombieLedgerViewProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    return {
      all: bikes.length,
      suspect: bikes.filter((b) => b.status === 'suspect').length,
      tagged: bikes.filter((b) => b.status === 'tagged').length,
      expired: bikes.filter(
        (b) => b.status === 'tagged' && b.noticeDaysLeft === 0,
      ).length,
      claimed: bikes.filter((b) => b.status === 'claimed').length,
      cleared: bikes.filter((b) => b.status === 'cleared').length,
    };
  }, [bikes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bikes.filter((b) => {
      if (filter === 'expired') {
        if (!(b.status === 'tagged' && b.noticeDaysLeft === 0)) return false;
      } else if (filter !== 'all' && b.status !== filter) {
        return false;
      }

      if (!q) return true;
      return (
        b.id.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.spotNote.toLowerCase().includes(q) ||
        getZoneName(b.zoneId).toLowerCase().includes(q)
      );
    });
  }, [bikes, filter, query]);

  const handleExportCsv = () => {
    downloadCsv(
      `西南交大犀浦校区_僵尸车治理台账_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        '车辆编号',
        '所在停车区',
        '具体位置',
        '车辆类型',
        '特征描述',
        '静置天数',
        '当前状态',
        '公示剩余天数',
        '登记日期',
        '清运日期/暂存库位',
      ],
      filtered.map((b) => [
        b.id,
        getZoneName(b.zoneId),
        b.spotNote,
        b.vehicleType,
        b.description,
        b.idleDays,
        STATUS_LABEL[b.status],
        b.status === 'tagged' ? (b.noticeDaysLeft ?? 0) : '-',
        b.registeredAt,
        b.clearedAt ? `${b.clearedAt} (${b.warehouseSlot ?? '西区暂存库'})` : '-',
      ]),
    );
    onNotify(`已导出 ${filtered.length} 条僵尸车台账记录（Excel CSV）`);
  };

  return (
    <section className="workspace-page" aria-label="全校僵尸车全生命周期台账">
      <div className="workspace-inner">
        <div className="page-head">
          <div>
            <h1>僵尸车全生命周期台账</h1>
            <p>
              巡检登记 → 贴码 15 天公示 → 车主扫码认领或逾期清运留痕，彻底杜绝误清纠纷。
            </p>
          </div>
          <div className="page-actions">
            {counts.tagged > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={onOpenBatchStickers}
              >
                <Printer size={15} />
                批量打印贴纸 ({counts.tagged})
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExportCsv}
            >
              <Download size={15} />
              导出公示清单 CSV
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => onOpenRegisterZombie()}
            >
              <Plus size={15} />
              新增僵尸车登记
            </button>
          </div>
        </div>

        <div className="toolbar-row">
          <div className="filter-pills" role="group" aria-label="按状态筛选">
            {(
              [
                ['all', `全部 (${counts.all})`],
                ['suspect', `待贴码 (${counts.suspect})`],
                ['tagged', `公示中 (${counts.tagged})`],
                ['expired', `到期可清运 (${counts.expired})`],
                ['claimed', `已认领 (${counts.claimed})`],
                ['cleared', `已清运 (${counts.cleared})`],
              ] as [FilterKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="search-box">
            <Search size={14} />
            <input
              type="search"
              placeholder="搜索编号、楼栋、车型特征..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="table-card desktop-only-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>编号 / 车种</th>
                <th>所在位置</th>
                <th>车辆特征</th>
                <th>静置</th>
                <th>治理状态</th>
                <th style={{ textAlign: 'right' }}>闭环操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    当前筛选条件下暂无记录
                  </td>
                </tr>
              ) : (
                filtered.map((bike) => (
                  <tr key={bike.id}>
                    <td>
                      <div className="cell-strong">{bike.id}</div>
                      <div className="cell-muted">
                        {bike.vehicleType} · {bike.registeredAt}
                      </div>
                    </td>
                    <td>
                      <div className="cell-strong">
                        {getZoneName(bike.zoneId)}
                      </div>
                      <div className="cell-muted">{bike.spotNote}</div>
                    </td>
                    <td>
                      <div className="desc-wrap">
                        {bike.photoDataUrl && (
                          <img
                            src={bike.photoDataUrl}
                            alt={bike.description}
                            className="thumb-img"
                          />
                        )}
                        <span>{bike.description}</span>
                      </div>
                    </td>
                    <td>
                      <span className="days-pill">{bike.idleDays} 天</span>
                    </td>
                    <td>
                      <span className={`state-tag state-${bike.status}`}>
                        {STATUS_LABEL[bike.status]}
                        {bike.status === 'tagged' &&
                          (bike.noticeDaysLeft === 0
                            ? ' · 已到期'
                            : ` · 剩 ${bike.noticeDaysLeft} 天`)}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-action"
                          title="在 3D 地图上定位"
                          onClick={() => onLocateZone(bike.zoneId)}
                        >
                          <MapPin size={14} />
                        </button>

                        {bike.status === 'suspect' && (
                          <button
                            type="button"
                            className="btn-primary sm"
                            onClick={() => onTagBike(bike.id)}
                          >
                            <Tag size={12} />
                            贴码公示
                          </button>
                        )}

                        {bike.status === 'tagged' && (
                          <>
                            <button
                              type="button"
                              className="btn-secondary sm"
                              onClick={() => onOpenStickerDialog(bike)}
                            >
                              <Printer size={12} />
                              打印贴纸
                            </button>
                            <button
                              type="button"
                              className="btn-secondary sm"
                              onClick={() => onOpenClaimDialog(bike)}
                            >
                              <QrCode size={12} />
                              模拟扫码
                            </button>
                            {bike.noticeDaysLeft === 0 && (
                              <button
                                type="button"
                                className="btn-danger-soft sm"
                                onClick={() => onClearBike(bike.id)}
                              >
                                <Trash2 size={12} />
                                清运入库
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 移动端专属触控卡片视图（≤ 768px 显示，免去左右横滑表格） */}
        <div className="mobile-ledger-list">
          {filtered.length === 0 ? (
            <div className="empty-state">当前筛选条件下暂无记录</div>
          ) : (
            filtered.map((bike) => (
              <article key={bike.id} className="mobile-ledger-card">
                <div className="mobile-card-top">
                  <div>
                    <div className="cell-strong">
                      {bike.id} · {bike.vehicleType}
                    </div>
                    <div className="cell-muted">
                      {getZoneName(bike.zoneId)} · {bike.spotNote}
                    </div>
                  </div>
                  <span className="days-pill">{bike.idleDays} 天</span>
                </div>

                <div className="desc-wrap" style={{ maxWidth: 'none' }}>
                  {bike.photoDataUrl && (
                    <img
                      src={bike.photoDataUrl}
                      alt={bike.description}
                      className="thumb-img"
                    />
                  )}
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                    {bike.description}
                  </span>
                </div>

                <div className="mobile-card-foot">
                  <span className={`state-tag state-${bike.status}`}>
                    {STATUS_LABEL[bike.status]}
                    {bike.status === 'tagged' &&
                      (bike.noticeDaysLeft === 0
                        ? ' · 已到期'
                        : ` · 剩 ${bike.noticeDaysLeft} 天`)}
                  </span>

                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-action"
                      title="在 3D 地图上定位"
                      onClick={() => onLocateZone(bike.zoneId)}
                    >
                      <MapPin size={14} />
                    </button>

                    {bike.status === 'suspect' && (
                      <button
                        type="button"
                        className="btn-primary sm"
                        onClick={() => onTagBike(bike.id)}
                      >
                        <Tag size={12} />
                        贴码公示
                      </button>
                    )}

                    {bike.status === 'tagged' && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary sm"
                          onClick={() => onOpenStickerDialog(bike)}
                        >
                          <Printer size={12} />
                          贴纸
                        </button>
                        <button
                          type="button"
                          className="btn-secondary sm"
                          onClick={() => onOpenClaimDialog(bike)}
                        >
                          <QrCode size={12} />
                          扫码
                        </button>
                        {bike.noticeDaysLeft === 0 && (
                          <button
                            type="button"
                            className="btn-danger-soft sm"
                            onClick={() => onClearBike(bike.id)}
                          >
                            <Trash2 size={12} />
                            清运
                          </button>
                        )}
                      </>
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
