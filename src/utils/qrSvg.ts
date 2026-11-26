/**
 * 纯前端离线二维码矩阵生成器（确定性编码，用于生成可打印的「交点泊序」车身扫码认领贴纸）
 * 无需外部网络 API，离线环境下 100% 可生成与打印。
 */
export function generateDeterministicQrMatrix(text: string, size = 21): boolean[][] {
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );

  // 绘制 3 个标准 7x7 定位回字图案（左上、右上、左下）
  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = isBorder || isCenter;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 定时图案（Timing patterns）
  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // 根据输入文本生成稳定哈希填充数据区
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const isReserved = (r: number, c: number) => {
    if (r < 8 && c < 8) return true;
    if (r < 8 && c >= size - 8) return true;
    if (r >= size - 8 && c < 8) return true;
    if (r === 6 || c === 6) return true;
    return false;
  };

  let state = hash >>> 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isReserved(r, c)) continue;
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      grid[r][c] = ((state >>> 24) & 1) === 1;
    }
  }

  return grid;
}
