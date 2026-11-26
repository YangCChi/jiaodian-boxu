import { useEffect, useRef } from 'react';
import type { ZombieBike } from '../data/parkingData';

interface ClaimDialogProps {
  bike: ZombieBike | null;
  onResult: (bikeId: string, action: 'claim' | 'abandon' | 'cancel') => void;
}

/**
 * 严格遵循 GoogleChrome/modern-web-guidance 的原生 <dialog> 实现：
 * - 不加冗余 role="dialog" / aria-modal（showModal 原生提供）
 * - 使用 <form method="dialog"> 与 returnValue 处理结果并重置
 * - 配合 CSS @starting-style + transition-behavior: allow-discrete 动效
 */
export function ClaimDialog({ bike, onResult }: ClaimDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (bike && !dialog.open) {
      dialog.showModal();
    } else if (!bike && dialog.open) {
      dialog.close();
    }
  }, [bike]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!dialog || !bike) return;

    const result = dialog.returnValue;
    dialog.returnValue = '';

    if (result === 'claim' || result === 'abandon') {
      onResult(bike.id, result);
    } else {
      onResult(bike.id, 'cancel');
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="claim-dialog"
      aria-labelledby="claim-dialog-title"
      onClose={handleClose}
    >
      {bike && (
        <>
          <h3 id="claim-dialog-title">车辆归属确认（学生扫码视角）</h3>
          <p className="dialog-sub">
            车主扫描车身贴纸二维码后，无需人工登记，可直接在线确认车辆是否仍在使用：
          </p>

          <div className="dialog-box">
            <div>
              <strong>编号：</strong>
              {bike.id}（{bike.vehicleType}）
            </div>
            <div>
              <strong>特征：</strong>
              {bike.description}
            </div>
            <div>
              <strong>位置：</strong>
              {bike.spotNote}
            </div>
          </div>

          <form method="dialog" className="dialog-actions">
            <button type="submit" value="claim" className="btn-primary" autoFocus>
              我还在用（一键续期 90 天，撤销清理）
            </button>
            <button type="submit" value="abandon" className="btn-danger-soft">
              已毕业 / 自愿交由后勤清运处置
            </button>
            <button type="submit" value="cancel" className="btn-secondary">
              暂不操作
            </button>
          </form>
        </>
      )}
    </dialog>
  );
}
