/**
 * 导出带 UTF-8 BOM 的 CSV 文件，确保保卫科/后勤处用 Excel 直接打开中文不乱码
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | undefined)[][],
) {
  const escapeCell = (val: string | number | undefined) => {
    const str = val === undefined ? '' : String(val);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ];

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
