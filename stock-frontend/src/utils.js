export function fmt(v, decimals = 2) {
  if (v == null) return '—'
  return Number(v).toLocaleString('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function pctColor(v) {
  if (v == null) return 'flat'
  return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
}

export function pctSign(v) {
  if (v == null || v === 0) return ''
  return v > 0 ? '+' : ''
}

/** "2025-04-30" → "04/30" */
export function shortDate(iso) {
  if (!iso) return ''
  const parts = String(iso).split('T')[0].split('-')
  return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : iso
}
