import { useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { useFetch }   from '../hooks/useFetch'
import { api }        from '../api'
import { fmt, pctColor, pctSign, shortDate } from '../utils'

export default function StockDashboard({ symbol, name, onClose }) {
  const { data: d, loading, error } = useFetch(() => api.dashboard(symbol), [symbol])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400, flexDirection:'column', gap:16 }}>
      <div className="spin" style={{ width:32, height:32 }}/>
      <div style={{ color:'var(--muted)' }}>正在載入 {name || symbol} 的分析資料…</div>
    </div>
  )
  if (error) return <div className="error-msg">⚠ {error}</div>
  if (!d)    return null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* ── Header ── */}
      <Header d={d} onClose={onClose} />

      {/* ── Main row: charts (left) + right panel ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:12, alignItems:'start' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <KlineChart d={d} />
          <VolumeChart d={d} />
          <KDChart d={d} />
          <MACDChart d={d} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <TechnicalSignals d={d} />
          <InstitutionalTable d={d} />
          <MainForceTable d={d} />
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
        <MultiPeriodCharts d={d} />
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <KeyPriceLevels d={d} />
          <TradingSuggestion d={d} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <MainForceSignal d={d} />
          <AIWinRate d={d} />
          <PatternAnalysis d={d} />
        </div>
      </div>

      {/* ── Bottom full row ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <TechnicalSummaryTable d={d} />
        <TomorrowPrediction d={d} />
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  Header                                            */
/* ────────────────────────────────────────────────── */
function Header({ d, onClose }) {
  const updown = d.dayChangePct >= 0 ? 'up' : 'down'
  return (
    <div className="card" style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
      <button onClick={onClose} title="返回"
              style={{ fontSize:20, color:'var(--muted)', lineHeight:1, padding:'0 4px' }}>←</button>
      <div>
        <span style={{ fontSize:20, fontWeight:700 }}>{d.name}</span>
        <span style={{ color:'var(--muted)', marginLeft:8, fontSize:13 }}>({d.symbol})</span>
      </div>
      <div style={{ fontSize:28, fontWeight:800, fontVariantNumeric:'tabular-nums' }} className={updown}>
        {fmt(d.price, 2)}
      </div>
      <div className={updown} style={{ fontSize:14 }}>
        {pctSign(d.dayChangePct)}{fmt(d.dayChangeAbs,2)} ({pctSign(d.dayChangePct)}{fmt(d.dayChangePct,2)}%)
      </div>
      <div style={{ color:'var(--muted)', fontSize:12 }}>
        成交量 {d.volume ? (d.volume/1000).toFixed(0)+'張' : '—'}
        {d.bid  && ` │ 買進 ${fmt(d.bid,2)}`}
        {d.ask  && ` │ 賣出 ${fmt(d.ask,2)}`}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  K-line chart (candlestick via ComposedChart)       */
/* ────────────────────────────────────────────────── */
function KlineChart({ d }) {
  const bars = buildKlineBars(d.chart)
  const bb   = d.chart.bollinger

  return (
    <div className="card">
      <PanelTitle>日線　布林通道 (20,2)</PanelTitle>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={bars} margin={{ top:4, right:4, bottom:0, left:0 }}>
          <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={['auto','auto']} tick={{ fill:'var(--muted)', fontSize:10 }} width={50} tickFormatter={v=>v.toLocaleString()} />
          <Tooltip content={<CandleTooltip />} />
          {/* Bollinger upper/lower/middle */}
          <Line dataKey="bbUpper"  dot={false} stroke="#4ec9b0" strokeWidth={1} strokeDasharray="3 2" />
          <Line dataKey="bbMiddle" dot={false} stroke="#888"    strokeWidth={1} strokeDasharray="3 2" />
          <Line dataKey="bbLower"  dot={false} stroke="#4ec9b0" strokeWidth={1} strokeDasharray="3 2" />
          {/* Candle body via bar (high-low range = shadow, open-close = body) */}
          <Bar dataKey="shadow" shape={<CandleShadow />} isAnimationActive={false} />
          <Bar dataKey="body"   shape={<CandleBody   />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  Volume chart                                      */
/* ────────────────────────────────────────────────── */
function VolumeChart({ d }) {
  const bars = d.chart.dates.map((date, i) => ({
    date: shortDate(date),
    vol:  (d.chart.volumes[i] / 1000),
    up:   d.chart.closes[i] >= (d.chart.opens[i] || d.chart.closes[i]),
  }))
  return (
    <div className="card" style={{ padding:'10px 14px' }}>
      <PanelTitle>成交量（張）</PanelTitle>
      <ResponsiveContainer width="100%" height={70}>
        <ComposedChart data={bars} margin={{ top:2, right:4, bottom:0, left:0 }}>
          <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill:'var(--muted)', fontSize:9 }} width={36} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}M`:v.toFixed(0)} />
          <Tooltip formatter={(v) => [`${v.toFixed(0)}K張`, '成交量']} labelFormatter={l=>l} />
          <Bar dataKey="vol" isAnimationActive={false} maxBarSize={4}>
            {bars.map((b,i) => <Cell key={i} fill={b.up ? '#f85149' : '#3fb950'} />)}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  KD chart                                          */
/* ────────────────────────────────────────────────── */
function KDChart({ d }) {
  const kd = d.kd
  const lastK = findLast(kd.k)
  const lastD = findLast(kd.d)
  const bars = kd.dates.map((date, i) => ({
    date: shortDate(date), k: kd.k[i], d_: kd.d[i]
  }))
  return (
    <div className="card" style={{ padding:'10px 14px' }}>
      <PanelTitle>
        KD (9,3,3)
        <span style={{ color:'var(--orange)' }}>K {fmt(lastK,2)}</span>
        <span style={{ color:'var(--muted)', margin:'0 4px' }}>│</span>
        <span style={{ color:'var(--blue)'  }}>D {fmt(lastD,2)}</span>
      </PanelTitle>
      <ResponsiveContainer width="100%" height={80}>
        <ComposedChart data={bars} margin={{ top:2, right:4, bottom:0, left:0 }}>
          <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={[0,100]} ticks={[20,50,80]} tick={{ fill:'var(--muted)', fontSize:9 }} width={24} />
          <ReferenceLine y={80} stroke="var(--red)"   strokeDasharray="3 2" strokeWidth={.8} />
          <ReferenceLine y={20} stroke="var(--green)" strokeDasharray="3 2" strokeWidth={.8} />
          <Tooltip formatter={(v,n) => [fmt(v,2), n==='k'?'K':'D']} />
          <Line dataKey="k"  dot={false} stroke="var(--orange)" strokeWidth={1.5} connectNulls />
          <Line dataKey="d_" dot={false} stroke="var(--blue)"   strokeWidth={1.5} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  MACD chart                                        */
/* ────────────────────────────────────────────────── */
function MACDChart({ d }) {
  const m = d.macd
  const lastLine   = findLast(m.line)
  const lastSignal = findLast(m.signal)
  const lastHist   = findLast(m.histogram)
  const bars = m.dates.map((date, i) => ({
    date: shortDate(date), line: m.line[i], signal: m.signal[i], hist: m.histogram[i]
  }))
  return (
    <div className="card" style={{ padding:'10px 14px' }}>
      <PanelTitle>
        MACD (12,26,9)
        <span style={{ color:'var(--blue)' }}>DIF {fmt(lastLine,2)}</span>
        <span style={{ color:'var(--orange)' }}>MACD {fmt(lastSignal,2)}</span>
        <span style={{ color:'var(--muted)' }}>OSC {fmt(lastHist,2)}</span>
      </PanelTitle>
      <ResponsiveContainer width="100%" height={90}>
        <ComposedChart data={bars} margin={{ top:2, right:4, bottom:0, left:0 }}>
          <XAxis dataKey="date" tick={{ fill:'var(--muted)', fontSize:9 }} />
          <YAxis tick={{ fill:'var(--muted)', fontSize:9 }} width={36} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip formatter={(v,n) => [fmt(v,4), n==='line'?'DIF':n==='signal'?'MACD':'OSC']} />
          <Bar dataKey="hist" isAnimationActive={false} maxBarSize={4}>
            {bars.map((b,i) => <Cell key={i} fill={(b.hist??0)>=0 ? 'var(--red)' : 'var(--green)'} />)}
          </Bar>
          <Line dataKey="line"   dot={false} stroke="var(--blue)"   strokeWidth={1.5} connectNulls />
          <Line dataKey="signal" dot={false} stroke="var(--orange)" strokeWidth={1.5} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  Right panel: 技術分析總覽                           */
/* ────────────────────────────────────────────────── */
function TechnicalSignals({ d }) {
  return (
    <div className="card">
      <PanelTitle>技術分析總覽</PanelTitle>
      <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:6 }}>
        {(d.technicalSignals || []).map(s => (
          <div key={s.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{
              width:8, height:8, borderRadius:'50%', flexShrink:0,
              background: s.color==='red' ? 'var(--red)' : s.color==='green' ? 'var(--green)' : 'var(--yellow)'
            }}/>
            <span style={{ color:'var(--muted)', fontSize:11, width:60 }}>{s.label}</span>
            <span style={{ fontSize:12 }}>{s.value}</span>
          </div>
        ))}
      </div>
      {d.mainForceSignal && (
        <div style={{ marginTop:10, padding:'8px', background:'var(--surface2)', borderRadius:6 }}>
          <div style={{ fontSize:11, color:'var(--muted)' }}>綜合評估</div>
          <div style={{ fontWeight:700, color:'var(--yellow)', marginTop:2 }}>{d.mainForceSignal.label}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{d.mainForceSignal.description}</div>
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  三大法人 table                                      */
/* ────────────────────────────────────────────────── */
function InstitutionalTable({ d }) {
  const rows = d.institutional || []
  return (
    <div className="card">
      <PanelTitle>籌碼分析　三大法人（張）</PanelTitle>
      {rows.length === 0
        ? <div style={{ color:'var(--muted)', fontSize:11, marginTop:6 }}>今日無資料（收盤後更新）</div>
        : (
          <table style={{ width:'100%', borderCollapse:'collapse', marginTop:6 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['日期','外資','投信','自營商','合計'].map(h => (
                  <th key={h} style={{ fontSize:10, color:'var(--muted)', padding:'3px 0', textAlign:'right', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0,5).map((r,i) => (
                <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={tcell}>{r.date}</td>
                  <td style={tcell} className={numColor(r.foreignNetBuy)}>{fmtN(r.foreignNetBuy)}</td>
                  <td style={tcell} className={numColor(r.trustNetBuy)}>{fmtN(r.trustNetBuy)}</td>
                  <td style={tcell} className={numColor(r.dealerNetBuy)}>{fmtN(r.dealerNetBuy)}</td>
                  <td style={{...tcell, fontWeight:700}} className={numColor(r.totalNetBuy)}>{fmtN(r.totalNetBuy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  主力進出 table                                      */
/* ────────────────────────────────────────────────── */
function MainForceTable({ d }) {
  const rows = d.mainForce || []
  return (
    <div className="card">
      <PanelTitle>主力進出（張）</PanelTitle>
      {rows.length === 0
        ? <div style={{ color:'var(--muted)', fontSize:11, marginTop:6 }}>今日無資料</div>
        : (
          <table style={{ width:'100%', borderCollapse:'collapse', marginTop:6 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['日期','增減','10日累計'].map(h => (
                  <th key={h} style={{ fontSize:10, color:'var(--muted)', padding:'3px 0', textAlign:'right', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0,5).map((r,i) => (
                <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={tcell}>{r.date}</td>
                  <td style={tcell} className={numColor(r.netChange)}>{fmtN(r.netChange)}</td>
                  <td style={{...tcell, fontWeight:700}} className={numColor(r.cumulative10d)}>{fmtN(r.cumulative10d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  多週期迷你圖                                       */
/* ────────────────────────────────────────────────── */
function MultiPeriodCharts({ d }) {
  const mp = d.multiPeriodCharts || {}
  const periods = [
    { key:'60m', label:'60分K（短線）' },
    { key:'1d',  label:'日K（中線）'   },
    { key:'1wk', label:'週K（長線）'   },
  ]
  return (
    <div className="card">
      <PanelTitle>多週期趨勢分析</PanelTitle>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:6 }}>
        {periods.map(({ key, label }) => {
          const p = mp[key]
          if (!p) return <div key={key} style={{ color:'var(--muted)', fontSize:11 }}>無資料</div>
          const bars = (p.bars || []).slice(-40)
          return (
            <div key={key}>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{label}</div>
              <MiniKline bars={bars} />
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>趨勢：{p.trend}</div>
              <div style={{ fontSize:10, color:'var(--yellow)', marginTop:2 }}>{p.state}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MiniKline({ bars }) {
  const data = bars.map(b => ({ ...b, body: [b.o, b.c], shadow: [b.l, b.h] }))
  return (
    <ResponsiveContainer width="100%" height={80}>
      <ComposedChart data={data} margin={{ top:2, right:0, bottom:0, left:0 }}>
        <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
        <YAxis domain={['auto','auto']} hide />
        <Bar dataKey="shadow" shape={<MiniShadow />} isAnimationActive={false} />
        <Bar dataKey="body"   shape={<MiniBody   />} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ────────────────────────────────────────────────── */
/*  關鍵價位                                           */
/* ────────────────────────────────────────────────── */
function KeyPriceLevels({ d }) {
  const kp = d.keyPriceLevels
  if (!kp) return null
  const zones = [
    { label:'壓力區', range: kp.resistance, color:'var(--red)' },
    { label:'回檔區', range: kp.pullback,   color:'var(--yellow)' },
    { label:'支撐區', range: kp.support,    color:'var(--green)' },
  ]
  return (
    <div className="card">
      <PanelTitle>關鍵價位</PanelTitle>
      <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:6 }}>
        {zones.map(z => (
          <div key={z.label} style={{
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'6px 10px', borderRadius:6, background: z.color+'22',
            border:`1px solid ${z.color}44`,
          }}>
            <span style={{ color: z.color, fontWeight:700, fontSize:12 }}>{z.label}</span>
            <span style={{ fontVariantNumeric:'tabular-nums', fontSize:13, fontWeight:600 }}>
              {z.range[0].toLocaleString()} ～ {z.range[1].toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  操作建議                                           */
/* ────────────────────────────────────────────────── */
function TradingSuggestion({ d }) {
  const s = d.tradingSuggestion
  if (!s) return null
  return (
    <div className="card">
      <PanelTitle>操作建議</PanelTitle>
      <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:6 }}>
        <Row icon="→" label="策略"     value={s.strategy}        />
        <Row icon="🟢" label="回檔買點" value={s.buyZone}         />
        <Row icon="🚀" label="強勢突破" value={s.breakoutTarget}  />
        <Row icon="🛑" label="停損防守" value={s.stopLoss}        />
      </div>
    </div>
  )
}
function Row({ icon, label, value }) {
  return (
    <div style={{ display:'flex', gap:6, alignItems:'flex-start', fontSize:12 }}>
      <span style={{ fontSize:13 }}>{icon}</span>
      <span style={{ color:'var(--muted)', width:52, flexShrink:0 }}>{label}：</span>
      <span>{value}</span>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  主力燈號                                           */
/* ────────────────────────────────────────────────── */
function MainForceSignal({ d }) {
  const s = d.mainForceSignal
  if (!s) return null
  const colors = {
    '主升段':  'var(--red)',
    '吸籌中':  'var(--green)',
    '出貨初期': 'var(--yellow)',
    '高度過熱': 'var(--red)',
    '弱勢整理': 'var(--muted)',
    '盤整觀察': 'var(--blue)',
  }
  const c = colors[s.label] || 'var(--blue)'
  return (
    <div className="card" style={{ textAlign:'center' }}>
      <PanelTitle>主力燈號</PanelTitle>
      <div style={{
        width:72, height:72, borderRadius:'50%',
        background: c+'33', border:`3px solid ${c}`,
        margin:'10px auto 6px',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <span style={{ fontSize:10, fontWeight:700, color:c }}>{s.label}</span>
      </div>
      <div style={{ fontSize:11, color:'var(--muted)' }}>{s.description}</div>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  AI 短線勝率                                        */
/* ────────────────────────────────────────────────── */
function AIWinRate({ d }) {
  const w = d.aiWinRate
  if (!w) return null
  return (
    <div className="card" style={{ textAlign:'center' }}>
      <PanelTitle>短線勝率（AI強化版）</PanelTitle>
      <div style={{ display:'flex', justifyContent:'space-around', marginTop:10 }}>
        {[
          { label:'上漲機率', value:w.up,        color:'var(--red)'    },
          { label:'下跌機率', value:w.down,      color:'var(--green)'  },
          { label:'震盪機率', value:w.sideways,  color:'var(--yellow)' },
        ].map(item => (
          <div key={item.label}>
            <div style={{ fontSize:26, fontWeight:800, color:item.color }}>{item.value}%</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  型態分析                                           */
/* ────────────────────────────────────────────────── */
function PatternAnalysis({ d }) {
  const p = d.patternAnalysis
  if (!p) return null
  return (
    <div className="card">
      <PanelTitle>型態分析</PanelTitle>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:6 }}>
        <PatternBox label="W底分析" pattern={p.wBottom} />
        <PatternBox label="M頭分析" pattern={p.mTop}    />
      </div>
    </div>
  )
}
function PatternBox({ label, pattern }) {
  return (
    <div style={{ padding:8, background:'var(--surface2)', borderRadius:6 }}>
      <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:11, color: pattern?.formed ? 'var(--red)' : 'var(--muted)' }}>
        結論：{pattern?.formed ? '✅' : '✗'} {pattern?.formed ? '已形成' : '未形成'}
      </div>
      <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{pattern?.detail}</div>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  技術指標總覽 table                                   */
/* ────────────────────────────────────────────────── */
function TechnicalSummaryTable({ d }) {
  const rows = d.technicalSummary || []
  return (
    <div className="card">
      <PanelTitle>技術指標總覽</PanelTitle>
      <table style={{ width:'100%', borderCollapse:'collapse', marginTop:6 }}>
        <thead>
          <tr style={{ borderBottom:'1px solid var(--border)' }}>
            {['指標','數值','方向','解讀'].map(h => (
              <th key={h} style={{ fontSize:10, color:'var(--muted)', padding:'3px 8px', textAlign:'left', fontWeight:600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i) => (
            <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
              <td style={{ padding:'6px 8px', fontWeight:600 }}>{r.indicator}</td>
              <td style={{ padding:'6px 8px', fontVariantNumeric:'tabular-nums' }}>{r.value}</td>
              <td style={{ padding:'6px 8px' }}>
                <span style={{ color: r.direction==='up' ? 'var(--red)' : r.direction==='down' ? 'var(--green)' : 'var(--muted)' }}>
                  {r.direction==='up' ? '▲' : r.direction==='down' ? '▼' : '—'}
                </span>
              </td>
              <td style={{ padding:'6px 8px', color:'var(--muted)', fontSize:11 }}>{r.interpretation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  明日漲跌預測                                        */
/* ────────────────────────────────────────────────── */
function TomorrowPrediction({ d }) {
  const w = d.aiWinRate
  if (!w) return null
  const s = d.tradingSuggestion
  return (
    <div className="card" style={{ background:'rgba(248,81,73,.05)', border:'1px solid rgba(248,81,73,.2)' }}>
      <PanelTitle style={{ color:'var(--red)' }}>🔥 明日漲跌機率預測（AI模型）</PanelTitle>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:10 }}>
        {[
          { label:'上漲機率', value:w.up+'%',       color:'var(--red)',    sub:'（震盪上機率）' },
          { label:'下跌機率', value:w.down+'%',     color:'var(--green)',  sub:'（震盪下跌機率）' },
          { label:'震盪機率', value:w.sideways+'%', color:'var(--yellow)', sub:'（高檔震盪機率）' },
        ].map(item => (
          <div key={item.label} style={{ textAlign:'center' }}>
            <div style={{ fontSize:36, fontWeight:900, color:item.color }}>{item.value}</div>
            <div style={{ fontSize:12, fontWeight:600 }}>{item.label}</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{item.sub}</div>
          </div>
        ))}
      </div>
      {s && (
        <div style={{ marginTop:12, fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
          <b style={{ color:'var(--text)' }}>預測結論：</b>{s.strategy}，
          回檔買點 {s.buyZone}，停損防守：{s.stopLoss}
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  Candlestick helpers                               */
/* ────────────────────────────────────────────────── */
function buildKlineBars(chart) {
  return chart.dates.map((date, i) => {
    const o = chart.opens[i], h = chart.highs[i]
    const l = chart.lows[i],  c = chart.closes[i]
    const bb = chart.bollinger
    return {
      date: shortDate(date),
      open: o, high: h, low: l, close: c,
      shadow: [l, h],
      body:   [Math.min(o,c), Math.max(o,c)],
      bbUpper:  bb?.upper[i]  ?? null,
      bbMiddle: bb?.middle[i] ?? null,
      bbLower:  bb?.lower[i]  ?? null,
      up: c >= o,
    }
  })
}

function CandleShadow(props) {
  const { x, y, width, height, value, payload } = props
  if (!value || !payload) return null
  const fill = payload.up ? '#f85149' : '#3fb950'
  const cx = x + width / 2
  return <rect x={cx - 0.5} y={y} width={1} height={height} fill={fill} />
}

function CandleBody(props) {
  const { x, y, width, height, payload } = props
  if (!payload) return null
  const fill = payload.up ? '#f85149' : '#3fb950'
  const bw = Math.max(width * 0.7, 1)
  return <rect x={x + (width - bw) / 2} y={y} width={bw} height={Math.max(height, 1)} fill={fill} />
}

function MiniShadow(props) {
  const { x, y, width, height, payload } = props
  if (!payload) return null
  const fill = (payload.c ?? 0) >= (payload.o ?? 0) ? '#f85149' : '#3fb950'
  return <rect x={x + width / 2 - 0.5} y={y} width={1} height={height} fill={fill} />
}
function MiniBody(props) {
  const { x, y, width, height, payload } = props
  if (!payload) return null
  const fill = (payload.c ?? 0) >= (payload.o ?? 0) ? '#f85149' : '#3fb950'
  const bw = Math.max(width * 0.6, 1)
  return <rect x={x + (width - bw) / 2} y={y} width={bw} height={Math.max(height, 1)} fill={fill} />
}

function CandleTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', fontSize:11 }}>
      <div style={{ marginBottom:3, fontWeight:600 }}>{d.date}</div>
      {[['開',d.open],['高',d.high],['低',d.low],['收',d.close]].map(([l,v]) => (
        <div key={l} style={{ display:'flex', gap:8 }}>
          <span style={{ color:'var(--muted)' }}>{l}</span>
          <span style={{ fontVariantNumeric:'tabular-nums' }}>{v?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

/* ────────────────────────────────────────────────── */
/*  Shared tiny helpers                               */
/* ────────────────────────────────────────────────── */
function PanelTitle({ children, style }) {
  return <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:4, display:'flex', gap:8, alignItems:'center', ...style }}>{children}</div>
}
const tcell = { padding:'5px 0', textAlign:'right', fontSize:11, fontVariantNumeric:'tabular-nums' }
function findLast(arr) { return arr ? [...arr].reverse().find(v => v != null) : null }
function numColor(v) { return v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '' }
function fmtN(v) { if (v == null) return '—'; return (v>0?'+':'')+v.toLocaleString() }
