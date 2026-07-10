export default function ScoreRing({ score, size = 80, strokeWidth = 6 }) {
  const r = (size - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 76 ? '#B84040' : score >= 51 ? '#A88C38' : score >= 26 ? '#8C6010' : '#9A9488'
  const label = score >= 76 ? 'High Priority' : score >= 51 ? 'Strong Lead' : score >= 26 ? 'Possible Lead' : 'Low'
  const tier = score >= 76 ? '#B84040' : score >= 51 ? '#A88C38' : score >= 26 ? '#8C6010' : '#BCB8B0'

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#EDE8DC" strokeWidth={strokeWidth} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x={size/2} y={size/2 - 3} textAnchor="middle"
          fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
          fontSize={size * 0.23} fontWeight="300" fill={color}
        >{score}</text>
        <text x={size/2} y={size/2 + 12} textAnchor="middle"
          fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
          fontSize="9" fill="#9A9488"
        >/100</text>
      </svg>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: tier, marginTop: 4 }}>{label}</div>
    </div>
  )
}
