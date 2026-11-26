import { useState } from 'react';
import {
  Download,
  History,
  MapPin,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Upload,
  Users,
} from 'lucide-react';
import type {
  AuditLogEntry,
  GovernanceRules,
  ParkingZone,
  PatrolTeam,
} from '../data/parkingData';
import { downloadCsv } from '../utils/exportCsv';

interface AdminViewProps {
  zones: ParkingZone[];
  rules: GovernanceRules;
  teams: PatrolTeam[];
  auditLogs: AuditLogEntry[];
  onUpdateZone: (
    zoneId: string,
    patch: Partial<ParkingZone>,
    logChange?: boolean,
  ) => void;
  onUpdateRules: (patch: Partial<GovernanceRules>) => void;
  onToggleTeamDuty: (teamId: string) => void;
  onAddTeam: (team: Omit<PatrolTeam, 'id' | 'onDuty'>) => void;
  onExportBackup: () => void;
  onImportBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetDemo: () => void;
  onLocateZone: (zoneId: string) => void;
  onNotify: (msg: string) => void;
}

type AdminSection = 'zones' | 'rules' | 'teams' | 'audit';

export function AdminView({
  zones,
  rules,
  teams,
  auditLogs,
  onUpdateZone,
  onUpdateRules,
  onToggleTeamDuty,
  onAddTeam,
  onExportBackup,
  onImportBackup,
  onResetDemo,
  onLocateZone,
  onNotify,
}: AdminViewProps) {
  const [section, setSection] = useState<AdminSection>('zones');
  const [newTeamName, setNewTeamName] = useState('');
  const [newLeader, setNewLeader] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newChannel, setNewChannel] = useState('对讲 4 频道');

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newLeader.trim()) return;
    onAddTeam({
      name: newTeamName.trim(),
      leader: newLeader.trim(),
      phone: newPhone.trim() || '校内短号 6110',
      channel: newChannel.trim() || '对讲 4 频道',
    });
    setNewTeamName('');
    setNewLeader('');
    setNewPhone('');
  };

  const handleExportLogs = () => {
    downloadCsv(
      `西南交大犀浦校区_交点泊序审计日志_${new Date().toISOString().slice(0, 10)}.csv`,
      ['日志编号', '时间', '操作主体', '动作', '详细记录'],
      auditLogs.map((l) => [l.id, l.time, l.actor, l.action, l.detail]),
    );
    onNotify(`已导出 ${auditLogs.length} 条系统操作审计日志（CSV）`);
  };

  const onDutyCount = teams.filter((t) => t.onDuty).length;
  const totalCapacity = zones.reduce((sum, z) => sum + z.capacity, 0);

  return (
    <section className="workspace-page" aria-label="交点泊序后台管理系统">
      <div className="workspace-inner">
        <div className="page-head">
          <div>
            <h1>后台管理系统</h1>
            <p>
              面向西南交大保卫科与后勤处管理员：所有泊位扩容、阈值规则与班组调整均实时生效并自动持久化。
            </p>
          </div>
          <div className="admin-role-pill">
            <ShieldCheck size={14} />
            <span>保卫科超级管理员 · 在岗班组 {onDutyCount}/{teams.length}</span>
          </div>
        </div>

        {/* 4 个清晰模块子导航 */}
        <div className="toolbar-row">
          <div className="filter-pills" role="group" aria-label="后台管理模块">
            <button
              type="button"
              aria-pressed={section === 'zones'}
              onClick={() => setSection('zones')}
            >
              <MapPin size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
              泊位与片区配置 ({zones.length})
            </button>
            <button
              type="button"
              aria-pressed={section === 'rules'}
              onClick={() => setSection('rules')}
            >
              <Sliders size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
              预警与治理规则
            </button>
            <button
              type="button"
              aria-pressed={section === 'teams'}
              onClick={() => setSection('teams')}
            >
              <Users size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
              网格班组与值班 ({teams.length})
            </button>
            <button
              type="button"
              aria-pressed={section === 'audit'}
              onClick={() => setSection('audit')}
            >
              <History size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
              审计日志与备份 ({auditLogs.length})
            </button>
          </div>
        </div>

        {/* ===== 模块 1：泊位与片区配置 ===== */}
        {section === 'zones' && (
          <div className="admin-section">
            <div className="admin-summary-strip">
              <span>
                全校纳管泊位区：<strong>{zones.length} 处</strong>
              </span>
              <span>
                当前规划总容量：<strong>{totalCapacity.toLocaleString()} 个</strong>
              </span>
              <span>
                含雨棚区域：
                <strong>{zones.filter((z) => z.hasShelter).length} 处</strong>
              </span>
            </div>

            <div className="admin-zone-grid">
              {zones.map((zone) => (
                <article key={zone.id} className="admin-card">
                  <div className="admin-card-head">
                    <div>
                      <h3>{zone.name}</h3>
                      <span className="cell-muted">
                        坐标 {zone.coordinates[0].toFixed(4)},{' '}
                        {zone.coordinates[1].toFixed(4)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="icon-action"
                      title="在 3D 地图上查看"
                      onClick={() => onLocateZone(zone.id)}
                    >
                      <MapPin size={14} />
                    </button>
                  </div>

                  <div className="admin-field-row">
                    <label className="admin-field">
                      <span>规划泊位容量（个）</span>
                      <div className="stepper-input">
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() =>
                            onUpdateZone(
                              zone.id,
                              { capacity: Math.max(40, zone.capacity - 20) },
                              true,
                            )
                          }
                          aria-label={`减少 ${zone.name} 20 个泊位`}
                        >
                          -20
                        </button>
                        <input
                          type="number"
                          min={40}
                          max={800}
                          step={10}
                          value={zone.capacity}
                          onChange={(e) => {
                            const val = Math.max(40, Number(e.target.value) || 40);
                            onUpdateZone(zone.id, { capacity: val }, false);
                          }}
                          onBlur={(e) => {
                            const val = Math.max(40, Number(e.target.value) || 40);
                            onUpdateZone(zone.id, { capacity: val }, true);
                          }}
                        />
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() =>
                            onUpdateZone(
                              zone.id,
                              { capacity: Math.min(800, zone.capacity + 20) },
                              true,
                            )
                          }
                          aria-label={`增加 ${zone.name} 20 个泊位`}
                        >
                          +20
                        </button>
                      </div>
                    </label>

                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={zone.hasShelter}
                        onChange={(e) =>
                          onUpdateZone(zone.id, { hasShelter: e.target.checked })
                        }
                      />
                      <span>含雨棚（雨天联动）</span>
                    </label>
                  </div>

                  <label className="admin-field">
                    <span>默认责任巡逻班组</span>
                    <select
                      value={zone.patrolTeam}
                      onChange={(e) =>
                        onUpdateZone(zone.id, { patrolTeam: e.target.value })
                      }
                    >
                      {teams.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="admin-field">
                    <span>溢流分流推荐目标</span>
                    <input
                      type="text"
                      value={zone.overflowTarget}
                      onChange={(e) =>
                        onUpdateZone(zone.id, {
                          overflowTarget: e.target.value,
                        })
                      }
                    />
                  </label>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* ===== 模块 2：预警与治理规则 ===== */}
        {section === 'rules' && (
          <div className="admin-rules-grid">
            <article className="admin-card">
              <h3>潮汐拥堵预警阈值（实时驱动 3D 地图变色）</h3>
              <p className="cell-muted" style={{ margin: 0 }}>
                调整后，3D 地图热力光环与顶部「拥堵点位」告警数量将立即按新阈值重算。
              </p>

              <label className="rule-slider-row">
                <div className="rule-slider-head">
                  <span>趋于饱和预警线（琥珀黄）</span>
                  <strong>{rules.warningThreshold}%</strong>
                </div>
                <input
                  type="range"
                  min={50}
                  max={88}
                  value={rules.warningThreshold}
                  onChange={(e) => {
                    const nextWarn = Number(e.target.value);
                    onUpdateRules({
                      warningThreshold: nextWarn,
                      congestedThreshold: Math.max(
                        nextWarn + 6,
                        rules.congestedThreshold,
                      ),
                    });
                  }}
                />
              </label>

              <label className="rule-slider-row">
                <div className="rule-slider-head">
                  <span>拥堵溢流红线（珊瑚红 · 触发派单建议）</span>
                  <strong style={{ color: 'var(--status-danger)' }}>
                    {rules.congestedThreshold}%
                  </strong>
                </div>
                <input
                  type="range"
                  min={75}
                  max={115}
                  value={rules.congestedThreshold}
                  onChange={(e) => {
                    const nextRed = Number(e.target.value);
                    onUpdateRules({
                      congestedThreshold: nextRed,
                      warningThreshold: Math.min(
                        rules.warningThreshold,
                        nextRed - 6,
                      ),
                    });
                  }}
                />
              </label>
            </article>

            <article className="admin-card">
              <h3>僵尸车判定与公示周期规则</h3>
              <p className="cell-muted" style={{ margin: 0 }}>
                用于规范后勤处与保卫科的贴码公示流程，保障校园车辆清理合法合规、零纠纷。
              </p>

              <label className="rule-slider-row">
                <div className="rule-slider-head">
                  <span>疑似僵尸车静置判定门槛</span>
                  <strong>≥ {rules.zombieSuspectDays} 天</strong>
                </div>
                <input
                  type="range"
                  min={15}
                  max={90}
                  step={5}
                  value={rules.zombieSuspectDays}
                  onChange={(e) =>
                    onUpdateRules({ zombieSuspectDays: Number(e.target.value) })
                  }
                />
              </label>

              <label className="rule-slider-row">
                <div className="rule-slider-head">
                  <span>贴码后全校公示倒计时周期</span>
                  <strong>{rules.noticePeriodDays} 天</strong>
                </div>
                <input
                  type="range"
                  min={7}
                  max={30}
                  value={rules.noticePeriodDays}
                  onChange={(e) =>
                    onUpdateRules({ noticePeriodDays: Number(e.target.value) })
                  }
                />
              </label>
            </article>
          </div>
        )}

        {/* ===== 模块 3：网格班组与值班管理 ===== */}
        {section === 'teams' && (
          <div className="admin-section">
            <div className="admin-zone-grid">
              {teams.map((team) => (
                <article key={team.id} className="admin-card">
                  <div className="admin-card-head">
                    <div>
                      <h3>{team.name}</h3>
                      <span className="cell-muted">
                        负责人：{team.leader} · {team.channel}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`duty-toggle ${team.onDuty ? 'is-on' : ''}`}
                      onClick={() => onToggleTeamDuty(team.id)}
                    >
                      {team.onDuty ? '值班在岗' : '已休班'}
                    </button>
                  </div>
                  <div className="cell-muted">联系电话：{team.phone}</div>
                </article>
              ))}
            </div>

            <form className="admin-card add-team-form" onSubmit={handleCreateTeam}>
              <h3>新增执勤网格班组</h3>
              <div className="add-team-fields">
                <input
                  type="text"
                  required
                  placeholder="班组名称（如：西门外围机动班）"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
                <input
                  type="text"
                  required
                  placeholder="班组负责人姓名"
                  value={newLeader}
                  onChange={(e) => setNewLeader(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="联系电话 / 校内短号"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="对讲机频道"
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value)}
                />
                <button type="submit" className="btn-primary">
                  <Plus size={14} />
                  添加班组
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ===== 模块 4：审计日志与数据备份中心 ===== */}
        {section === 'audit' && (
          <div className="admin-section">
            <div className="admin-card backup-banner">
              <div>
                <h3>离线数据中心（JSON 备份 / 迁移 / 重置）</h3>
                <p className="cell-muted" style={{ margin: '4px 0 0' }}>
                  所有台账、工单、泊位扩容和阈值配置均实时保存在本机浏览器，支持导出文件跨电脑迁移。
                </p>
              </div>
              <div className="page-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleExportLogs}
                >
                  <Download size={14} />
                  导出审计日志 CSV
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onExportBackup}
                >
                  <Download size={14} />
                  导出全量 JSON
                </button>
                <label className="btn-secondary" style={{ cursor: 'pointer' }}>
                  <Upload size={14} />
                  导入恢复
                  <input
                    type="file"
                    accept="application/json"
                    style={{ display: 'none' }}
                    onChange={onImportBackup}
                  />
                </label>
                <button
                  type="button"
                  className="btn-danger-soft"
                  onClick={onResetDemo}
                >
                  <RotateCcw size={14} />
                  恢复默认
                </button>
              </div>
            </div>

            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作主体</th>
                    <th>动作</th>
                    <th>详细记录</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>
                        {log.time}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{log.actor}</td>
                      <td>
                        <span className="state-tag state-tagged">
                          {log.action}
                        </span>
                      </td>
                      <td>{log.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
