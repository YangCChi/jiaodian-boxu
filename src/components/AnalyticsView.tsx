import { useMemo } from 'react';
import { Printer } from 'lucide-react';
import {
  type DayScenario,
  type GovernanceRules,
  type ParkingZone,
  type WorkOrder,
  type ZombieBike,
  getZoneOccupancy,
} from '../data/parkingData';

interface AnalyticsViewProps {
  zones: ParkingZone[];
  rules: GovernanceRules;
  scenario: DayScenario;
  zombieBikes: ZombieBike[];
  workOrders: WorkOrder[];
}

const CHART_HOURS = [6, 7, 8, 10, 12, 14, 16, 18, 20, 22, 23];

export function AnalyticsView({
  zones,
  rules,
  scenario,
  zombieBikes,
  workOrders,
}: AnalyticsViewProps) {
  // 计算 24h 教学区 vs 宿舍区平均占用率曲线
  const tidalSeries = useMemo(() => {
    const empty = new Set<string>();
    const teachingZones = zones.filter((z) => z.category === 'teaching');
    const dormZones = zones.filter((z) => z.category === 'dorm');

    return CHART_HOURS.map((h) => {
      const tAvg =
        teachingZones.reduce(
          (sum, z) => sum + getZoneOccupancy(z, h, empty, scenario, rules).ratio,
          0,
        ) / teachingZones.length;
      const dAvg =
        dormZones.reduce(
          (sum, z) => sum + getZoneOccupancy(z, h, empty, scenario, rules).ratio,
          0,
        ) / dormZones.length;

      return {
        hour: h,
        teachingPct: Math.round(tAvg * 100),
        dormPct: Math.round(dAvg * 100),
      };
    });
  }, [zones, rules, scenario]);

  // 拥堵黑点 Top 5（按全天峰值占用率排行）
  const topHotspots = useMemo(() => {
    const empty = new Set<string>();
    return zones
      .filter((z) => z.category !== 'buffer')
      .map((z) => {
        let peakRatio = 0;
        let peakHour = 8;
        for (const h of CHART_HOURS) {
          const { ratio } = getZoneOccupancy(z, h, empty, scenario, rules);
          if (ratio > peakRatio) {
            peakRatio = ratio;
            peakHour = h;
          }
        }
        return {
          id: z.id,
          name: z.name,
          peakPct: Math.round(peakRatio * 100),
          peakHour: `${String(peakHour).padStart(2, '0')}:00`,
        };
      })
      .sort((a, b) => b.peakPct - a.peakPct)
      .slice(0, 5);
  }, [zones, rules, scenario]);

  // 僵尸车治理漏斗（实时联动）
  const funnel = useMemo(() => {
    const total = zombieBikes.length;
    const tagged = zombieBikes.filter((b) => b.status !== 'suspect').length;
    const claimed = zombieBikes.filter((b) => b.status === 'claimed').length;
    const cleared = zombieBikes.filter((b) => b.status === 'cleared').length;
    return [
      { label: '巡检排查登记', value: total, color: '#64748b' },
      { label: '已贴码启动 15 天公示', value: tagged, color: '#2563eb' },
      { label: '车主扫码确认认领', value: claimed, color: '#10b981' },
      { label: '逾期/自愿清运入库', value: cleared, color: '#e11d48' },
    ];
  }, [zombieBikes]);

  const resolvedOrders = workOrders.filter(
    (o) => o.status === 'resolved',
  ).length;

  // SVG 坐标映射
  const svgW = 640;
  const svgH = 220;
  const padL = 38;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const toX = (idx: number) =>
    padL + (idx / (tidalSeries.length - 1)) * plotW;
  const toY = (pct: number) =>
    padT + plotH - (Math.min(130, pct) / 130) * plotH;

  const teachingPath = tidalSeries
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.teachingPct).toFixed(1)}`)
    .join(' ');
  const dormPath = tidalSeries
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.dormPct).toFixed(1)}`)
    .join(' ');

  return (
    <section className="workspace-page printable-report" aria-label="犀浦校区泊序决策分析报告">
      <div className="workspace-inner">
        <div className="page-head">
          <div>
            <h1>西南交大犀浦校区 · 泊序决策简报</h1>
            <p>
              面向保卫科与后勤处的轻量化周报视图，清晰呈现潮汐剪刀差、拥堵黑点与僵尸车治理成效。
            </p>
          </div>
          <div className="page-actions no-print">
            <button
              type="button"
              className="btn-primary"
              onClick={() => window.print()}
            >
              <Printer size={15} />
              打印 / 导出 PDF 周报
            </button>
          </div>
        </div>

        <div className="report-kpi-grid">
          <div className="report-kpi">
            <span>覆盖重点停车区</span>
            <strong>{zones.length} 个</strong>
          </div>
          <div className="report-kpi">
            <span>规划非机动车泊位</span>
            <strong>
              {zones.reduce((s, z) => s + z.capacity, 0).toLocaleString()} 个
            </strong>
          </div>
          <div className="report-kpi">
            <span>执勤工单闭环率</span>
            <strong>
              {workOrders.length === 0
                ? '100%'
                : `${Math.round((resolvedOrders / workOrders.length) * 100)}%`}
            </strong>
          </div>
          <div className="report-kpi">
            <span>僵尸车已闭环处理</span>
            <strong>
              {zombieBikes.filter(
                (b) => b.status === 'claimed' || b.status === 'cleared',
              ).length}{' '}
              / {zombieBikes.length} 辆
            </strong>
          </div>
        </div>

        <div className="report-grid">
          {/* 1. 教学区 vs 宿舍区潮汐剪刀差折线图 */}
          <article className="report-card span-2">
            <div className="report-card-head">
              <div>
                <h2>全天潮汐剪刀差：教学楼区 vs 天佑斋宿舍区</h2>
                <p>早八（08:00）教学区峰值溢流，晚间（22:00）宿舍区反向爆满</p>
              </div>
              <div className="chart-legend">
                <span>
                  <i style={{ background: '#2563eb' }} /> 教学楼区平均饱和度
                </span>
                <span>
                  <i style={{ background: '#ea580c' }} /> 宿舍区平均饱和度
                </span>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="tidal-svg"
              role="img"
              aria-label="教学楼区与宿舍区 24 小时饱和度对比折线图"
            >
              {/* 100% 满载警戒虚线 */}
              <line
                x1={padL}
                x2={svgW - padR}
                y1={toY(100)}
                y2={toY(100)}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeOpacity="0.45"
              />
              <text
                x={svgW - padR}
                y={toY(100) - 5}
                textAnchor="end"
                fontSize="10"
                fill="#ef4444"
              >
                100% 满载线
              </text>

              {[0, 50, 100].map((v) => (
                <g key={v}>
                  <line
                    x1={padL}
                    x2={svgW - padR}
                    y1={toY(v)}
                    y2={toY(v)}
                    stroke="rgba(15,23,42,0.06)"
                  />
                  <text
                    x={padL - 6}
                    y={toY(v) + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill="#64748b"
                  >
                    {v}%
                  </text>
                </g>
              ))}

              <path
                d={teachingPath}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={dormPath}
                fill="none"
                stroke="#ea580c"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {tidalSeries.map((p, i) => (
                <g key={p.hour}>
                  <circle
                    cx={toX(i)}
                    cy={toY(p.teachingPct)}
                    r="3.2"
                    fill="#2563eb"
                  />
                  <circle
                    cx={toX(i)}
                    cy={toY(p.dormPct)}
                    r="3.2"
                    fill="#ea580c"
                  />
                  <text
                    x={toX(i)}
                    y={svgH - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#64748b"
                  >
                    {String(p.hour).padStart(2, '0')}:00
                  </text>
                </g>
              ))}
            </svg>
          </article>

          {/* 2. 拥堵黑点 Top 5 */}
          <article className="report-card">
            <div className="report-card-head">
              <div>
                <h2>高频拥堵黑点 Top 5</h2>
                <p>建议优先增设临时潮汐停放位与早晚引导岗</p>
              </div>
            </div>
            <div className="rank-list">
              {topHotspots.map((item, idx) => (
                <div key={item.id} className="rank-row">
                  <div className="rank-top">
                    <span>
                      <strong>{idx + 1}.</strong> {item.name}
                    </span>
                    <span className="rank-val">
                      峰值 {item.peakPct}%（{item.peakHour}）
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(100, item.peakPct)}%`,
                        backgroundColor:
                          item.peakPct >= 100 ? '#ef4444' : '#f59e0b',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* 3. 僵尸车治理漏斗 */}
          <article className="report-card">
            <div className="report-card-head">
              <div>
                <h2>僵尸车治理闭环进度</h2>
                <p>实时同步台账中的贴码、车主认领与清运入库状态</p>
              </div>
            </div>
            <div className="rank-list">
              {funnel.map((step) => {
                const max = Math.max(1, zombieBikes.length);
                const pct = Math.round((step.value / max) * 100);
                return (
                  <div key={step.label} className="rank-row">
                    <div className="rank-top">
                      <span>{step.label}</span>
                      <span className="rank-val">{step.value} 辆</span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: step.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
