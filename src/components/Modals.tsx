import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Upload } from 'lucide-react';
import {
  PARKING_ZONES,
  type DayScenario,
  type GovernanceRules,
  type ParkingZone,
  type PatrolTeam,
  type ZombieBike,
  formatHour,
  getZoneName,
  getZoneOccupancy,
} from '../data/parkingData';
import { generateDeterministicQrMatrix } from '../utils/qrSvg';

/* ===== 1. 新增疑似僵尸车登记弹窗（原生 <dialog>） ===== */
interface RegisterZombieDialogProps {
  open: boolean;
  defaultZoneId?: string;
  onClose: () => void;
  onSubmit: (payload: {
    zoneId: string;
    vehicleType: '自行车' | '电动车';
    description: string;
    idleDays: number;
    spotNote: string;
    photoDataUrl?: string;
  }) => void;
}

export function RegisterZombieDialog({
  open,
  defaultZoneId,
  onClose,
  onSubmit,
}: RegisterZombieDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [zoneId, setZoneId] = useState(defaultZoneId ?? PARKING_ZONES[0].id);
  const [vehicleType, setVehicleType] = useState<'自行车' | '电动车'>('自行车');
  const [idleDays, setIdleDays] = useState(45);
  const [spotNote, setSpotNote] = useState('');
  const [description, setDescription] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (defaultZoneId) setZoneId(defaultZoneId);
  }, [defaultZoneId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const val = dialog.returnValue;
    dialog.returnValue = '';

    if (val === 'confirm' && description.trim()) {
      onSubmit({
        zoneId,
        vehicleType,
        idleDays: Math.max(15, Number(idleDays) || 30),
        spotNote: spotNote.trim() || '停车区边缘车架',
        description: description.trim(),
        photoDataUrl,
      });
      setSpotNote('');
      setDescription('');
      setPhotoDataUrl(undefined);
    }
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="claim-dialog"
      aria-labelledby="reg-zombie-title"
      onClose={handleClose}
    >
      <h3 id="reg-zombie-title">登记疑似僵尸车</h3>
      <p className="dialog-sub">
        录入后将自动生成唯一编号并进入全校台账，支持一键打印扫码公示贴纸。
      </p>

      <form method="dialog" className="modal-form">
        <label className="field">
          <span>所在停车区</span>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {PARKING_ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>

        <div className="field-row">
          <label className="field">
            <span>车辆类型</span>
            <select
              value={vehicleType}
              onChange={(e) =>
                setVehicleType(e.target.value as '自行车' | '电动车')
              }
            >
              <option value="自行车">自行车</option>
              <option value="电动车">电动车</option>
            </select>
          </label>
          <label className="field">
            <span>预估静置天数</span>
            <input
              type="number"
              min={15}
              max={365}
              value={idleDays}
              onChange={(e) => setIdleDays(Number(e.target.value))}
            />
          </label>
        </div>

        <label className="field">
          <span>具体停放点位</span>
          <input
            type="text"
            placeholder="例如：天佑斋 19 栋西侧雨棚第 2 排"
            value={spotNote}
            onChange={(e) => setSpotNote(e.target.value)}
          />
        </label>

        <label className="field">
          <span>车辆外观特征（必填）</span>
          <input
            type="text"
            required
            placeholder="例如：黑色捷安特山地车，后胎干瘪、车链锈蚀"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
          />
        </label>

        <label className="upload-field">
          <Upload size={14} />
          <span>{photoDataUrl ? '已附加现场照片（点击更换）' : '可选：上传现场留证照片'}</span>
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
        </label>

        {photoDataUrl && (
          <img
            src={photoDataUrl}
            alt="现场照片预览"
            className="upload-preview"
          />
        )}

        <div className="dialog-actions-row">
          <button type="submit" value="cancel" className="btn-secondary" formNoValidate>
            取消
          </button>
          <button type="submit" value="confirm" className="btn-primary">
            确认录入台账
          </button>
        </div>
      </form>
    </dialog>
  );
}

/* ===== 2. 可打印扫码认领公示贴纸弹窗（原生 <dialog>） ===== */
interface StickerPrintDialogProps {
  bike: ZombieBike | null;
  onClose: () => void;
}

export function StickerPrintDialog({ bike, onClose }: StickerPrintDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (bike && !dialog.open) dialog.showModal();
    else if (!bike && dialog.open) dialog.close();
  }, [bike]);

  const qrMatrix = useMemo(
    () =>
      bike
        ? generateDeterministicQrMatrix(
            `https://boxu.swjtu.edu.cn/claim/${bike.id}`,
          )
        : [],
    [bike],
  );

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog) dialog.returnValue = '';
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="claim-dialog sticker-dialog"
      aria-labelledby="sticker-title"
      onClose={handleClose}
    >
      {bike && (
        <>
          <h3 id="sticker-title" className="no-print">
            车身扫码认领公示贴纸（可打印）
          </h3>
          <p className="dialog-sub no-print">
            打印后贴于疑似闲置车辆车把处，车主微信扫码即可一键续期或确认报废。
          </p>

          <div className="printable-sticker">
            <div className="sticker-header">
              <span>西南交通大学 · 交点泊序</span>
              <strong>闲置车辆清理公示</strong>
            </div>

            <div className="sticker-body">
              <svg
                viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                className="qr-svg"
                role="img"
                aria-label={`车辆 ${bike.id} 认领二维码`}
              >
                <rect
                  width={qrMatrix.length}
                  height={qrMatrix.length}
                  fill="#ffffff"
                />
                {qrMatrix.map((row, r) =>
                  row.map((cell, c) =>
                    cell ? (
                      <rect
                        key={`${r}-${c}`}
                        x={c}
                        y={r}
                        width={1}
                        height={1}
                        fill="#0f172a"
                      />
                    ) : null,
                  ),
                )}
              </svg>

              <div className="sticker-info">
                <div className="sticker-code">{bike.id}</div>
                <div>区域：{getZoneName(bike.zoneId)}</div>
                <div>点位：{bike.spotNote}</div>
                <div>类型：{bike.vehicleType}</div>
                <div className="sticker-deadline">
                  公示剩余：{bike.noticeDaysLeft ?? 15} 天
                </div>
              </div>
            </div>

            <div className="sticker-foot">
              请车主在公示期内扫码点击「我还在用」即可撤销清理；逾期无人认领将由后勤保卫处统一移至西区暂存库保管。
            </div>
          </div>

          <form method="dialog" className="dialog-actions-row no-print">
            <button type="submit" value="close" className="btn-secondary">
              关闭
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => window.print()}
            >
              <Printer size={14} />
              打印贴纸 / 存为 PDF
            </button>
          </form>
        </>
      )}
    </dialog>
  );
}

/* ===== 2B. 批量 A4 扫码公示贴纸打印弹窗（原生 <dialog>） ===== */
interface BatchStickerDialogProps {
  bikes: ZombieBike[];
  open: boolean;
  onClose: () => void;
}

export function BatchStickerDialog({
  bikes,
  open,
  onClose,
}: BatchStickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog) dialog.returnValue = '';
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="claim-dialog batch-sticker-dialog"
      aria-labelledby="batch-sticker-title"
      onClose={handleClose}
    >
      <h3 id="batch-sticker-title" className="no-print">
        批量打印公示贴纸（A4 两栏排版 · 共 {bikes.length} 张）
      </h3>
      <p className="dialog-sub no-print">
        自动排版当前所有「公示中」车辆的扫码贴纸，可直接打印至不干胶纸后交巡逻员张贴。
      </p>

      <div className="batch-sticker-grid">
        {bikes.map((bike) => {
          const qrMatrix = generateDeterministicQrMatrix(
            `https://boxu.swjtu.edu.cn/claim/${bike.id}`,
          );
          return (
            <div key={bike.id} className="printable-sticker compact">
              <div className="sticker-header">
                <span>西南交大 · 交点泊序</span>
                <strong>清理公示</strong>
              </div>
              <div className="sticker-body">
                <svg
                  viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                  className="qr-svg sm"
                  role="img"
                  aria-label={`车辆 ${bike.id} 认领二维码`}
                >
                  <rect
                    width={qrMatrix.length}
                    height={qrMatrix.length}
                    fill="#ffffff"
                  />
                  {qrMatrix.map((row, r) =>
                    row.map((cell, c) =>
                      cell ? (
                        <rect
                          key={`${r}-${c}`}
                          x={c}
                          y={r}
                          width={1}
                          height={1}
                          fill="#0f172a"
                        />
                      ) : null,
                    ),
                  )}
                </svg>
                <div className="sticker-info">
                  <div className="sticker-code">{bike.id}</div>
                  <div>{getZoneName(bike.zoneId)}</div>
                  <div>{bike.spotNote}</div>
                  <div className="sticker-deadline">
                    剩 {bike.noticeDaysLeft ?? 15} 天
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form method="dialog" className="dialog-actions-row no-print">
        <button type="submit" value="close" className="btn-secondary">
          关闭
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => window.print()}
        >
          <Printer size={14} />
          批量打印 A4 贴纸
        </button>
      </form>
    </dialog>
  );
}

/* ===== 3. 上报违停 / 新建保卫执勤工单弹窗（原生 <dialog>） ===== */
interface ReportViolationDialogProps {
  open: boolean;
  teams: PatrolTeam[];
  defaultZoneId?: string;
  defaultCoords?: [number, number];
  onClose: () => void;
  onSubmit: (payload: {
    zoneId: string;
    title: string;
    detail: string;
    assignee: string;
    coordinates?: [number, number];
  }) => void;
}

export function ReportViolationDialog({
  open,
  teams,
  defaultZoneId,
  defaultCoords,
  onClose,
  onSubmit,
}: ReportViolationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [zoneId, setZoneId] = useState(defaultZoneId ?? PARKING_ZONES[0].id);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [assignee, setAssignee] = useState<string>(teams[0]?.name ?? '');

  useEffect(() => {
    if (defaultZoneId) {
      setZoneId(defaultZoneId);
      const zone = PARKING_ZONES.find((z) => z.id === defaultZoneId);
      if (zone) setAssignee(zone.patrolTeam);
    }
  }, [defaultZoneId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const val = dialog.returnValue;
    dialog.returnValue = '';

    if (val === 'confirm' && title.trim()) {
      const zone = PARKING_ZONES.find((z) => z.id === zoneId);
      onSubmit({
        zoneId,
        title: title.trim(),
        detail: detail.trim() || '巡逻员现场发现违停占道，请尽快到场劝导规整。',
        assignee,
        coordinates: defaultCoords ?? zone?.coordinates,
      });
      setTitle('');
      setDetail('');
    }
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="claim-dialog"
      aria-labelledby="report-vio-title"
      onClose={handleClose}
    >
      <h3 id="report-vio-title">上报违停 / 发起执勤工单</h3>
      <p className="dialog-sub">
        {defaultCoords
          ? `已自动锁定地图坐标（${defaultCoords[0]}, ${defaultCoords[1]}），提交后将在 3D 地图高亮并通知对应网格班组。`
          : '提交后将在 3D 地图标注违停事件点并进入执勤工单中心。'}
      </p>

      <form method="dialog" className="modal-form">
        <label className="field">
          <span>所属片区</span>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {PARKING_ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>事件标题（必填）</span>
          <input
            type="text"
            required
            placeholder="例如：4 号教学楼东门消防通道电动车占道"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </label>

        <label className="field">
          <span>现场情况说明</span>
          <textarea
            rows={2}
            placeholder="补充违停数量、是否堵塞出入口或盲道..."
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </label>

        <label className="field">
          <span>指派执勤班组</span>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <div className="dialog-actions-row">
          <button type="submit" value="cancel" className="btn-secondary" formNoValidate>
            取消
          </button>
          <button type="submit" value="confirm" className="btn-primary">
            立即派发工单
          </button>
        </div>
      </form>
    </dialog>
  );
}

/* ===== 4. 师生微端实时预览弹窗（查空位 + 扫码认领） ===== */
interface StudentPortalDialogProps {
  open: boolean;
  zones: ParkingZone[];
  rules: GovernanceRules;
  hour: number;
  scenario: DayScenario;
  dispatchedZoneIds: Set<string>;
  zombieBikes: ZombieBike[];
  onClose: () => void;
  onClaimBike: (bike: ZombieBike) => void;
}

export function StudentPortalDialog({
  open,
  zones,
  rules,
  hour,
  scenario,
  dispatchedZoneIds,
  zombieBikes,
  onClose,
  onClaimBike,
}: StudentPortalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [bikeCode, setBikeCode] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const ranked = useMemo(() => {
    return zones
      .map((z) => {
        const occ = getZoneOccupancy(z, hour, dispatchedZoneIds, scenario, rules);
        const freeSpots = Math.max(0, z.capacity - occ.count);
        return {
          zone: z,
          pct: Math.round(occ.ratio * 100),
          freeSpots,
          level: occ.level,
        };
      })
      .sort((a, b) => a.pct - b.pct);
  }, [zones, rules, hour, scenario, dispatchedZoneIds]);

  const recommended = ranked.slice(0, 3);
  const congested = ranked.filter((r) => r.level === 'congested').slice(-2).reverse();

  const matchedBike = useMemo(() => {
    const q = bikeCode.trim().toLowerCase();
    if (!q) return null;
    return (
      zombieBikes.find(
        (b) =>
          b.id.toLowerCase().includes(q) &&
          (b.status === 'tagged' || b.status === 'suspect'),
      ) ?? null
    );
  }, [bikeCode, zombieBikes]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog) dialog.returnValue = '';
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="claim-dialog student-portal-dialog"
      aria-labelledby="student-portal-title"
      onClose={handleClose}
    >
      <div className="portal-head">
        <span className="portal-pill">师生微信微端 · 实时联动预览</span>
        <h3 id="student-portal-title">交点泊序 · 找车位与认领</h3>
        <p className="dialog-sub" style={{ marginBottom: 0 }}>
          当前校园时刻 {formatHour(hour)}，自动为师生推荐最近空余泊位，避免盲目扎堆。
        </p>
      </div>

      <div className="portal-section">
        <div className="portal-label">推荐停放（当前最空闲）</div>
        <div className="portal-list">
          {recommended.map((item) => (
            <div key={item.zone.id} className="portal-row ok">
              <div>
                <strong>{item.zone.name}</strong>
                <div className="cell-muted">余位约 {item.freeSpots} 个</div>
              </div>
              <span className="status-badge normal">{item.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {congested.length > 0 && (
        <div className="portal-section">
          <div className="portal-label">避坑提示（当前爆满）</div>
          <div className="portal-list">
            {congested.map((item) => (
              <div key={item.zone.id} className="portal-row danger">
                <div>
                  <strong>{item.zone.name}</strong>
                  <div className="cell-muted">
                    建议绕行：{item.zone.overflowTarget}
                  </div>
                </div>
                <span className="status-badge congested">{item.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="portal-section">
        <div className="portal-label">车身公示贴纸快速认领</div>
        <div className="portal-claim-box">
          <input
            type="text"
            placeholder="输入车身编号（如 SW-26-0142）"
            value={bikeCode}
            onChange={(e) => setBikeCode(e.target.value)}
          />
          {matchedBike && (
            <div className="portal-match">
              <span>
                {matchedBike.id} · {matchedBike.description}
              </span>
              <button
                type="button"
                className="btn-primary sm"
                onClick={() => {
                  onClose();
                  onClaimBike(matchedBike);
                }}
              >
                去认领
              </button>
            </div>
          )}
        </div>
      </div>

      <form method="dialog" className="dialog-actions-row">
        <button type="submit" value="close" className="btn-secondary">
          关闭预览
        </button>
      </form>
    </dialog>
  );
}
