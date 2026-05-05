import { LineChart, Line, ResponsiveContainer } from 'recharts'

export function SparkLine({ data = [], color }) {
  if (!data.length) return null
  const first = data[0]
  const last  = data[data.length - 1]
  const autoColor = last >= first ? '#f85149' : '#3fb950'
  const items = data.map((v, i) => ({ v }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={items}>
        <Line
          dataKey="v"
          dot={false}
          stroke={color || autoColor}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
