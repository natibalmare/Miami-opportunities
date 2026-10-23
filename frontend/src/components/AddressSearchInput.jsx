import { useState, useEffect, useRef } from 'react'
import { api } from '../utils/api'

/* Search box that suggests real Miami-Dade addresses while you type,
   like Google Maps. Works for anything that starts with a house number. */
export default function AddressSearchInput({ value, onChange, onSubmit, onPick, placeholder, inputStyle, wrapStyle }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)
  const boxRef = useRef(null)

  /* Look up suggestions shortly after typing stops */
  useEffect(() => {
    const q = (value || '').trim()
    if (q.length < 3 || !/^\d/.test(q)) {
      setItems([]); setLoading(false)
      return
    }
    const id = ++reqId.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await api.suggestAddresses(q)
        if (id !== reqId.current) return
        setItems(r.suggestions || [])
        setActive(-1)
      } catch {
        if (id === reqId.current) setItems([])
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [value])

  /* Close the list when clicking elsewhere */
  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (s) => {
    setOpen(false)
    setItems([])
    onPick(s)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault(); setOpen(true); setActive(a => (a + 1) % items.length)
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault(); setActive(a => (a <= 0 ? items.length - 1 : a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && active >= 0 && items[active]) pick(items[active])
      else { setOpen(false); onSubmit() }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && (value || '').trim().length >= 3 && /^\d/.test((value || '').trim())

  return (
    <div ref={boxRef} style={{ position: 'relative', flex: 1, display: 'flex', ...(wrapStyle || {}) }}>
      <input
        style={{ width: '100%', ...(inputStyle || {}) }}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList && (items.length > 0 || loading) && (
        <div style={{
          position: 'absolute', top: '100%', left: -1, right: -1, zIndex: 60, marginTop: 2,
          background: '#FFFFFF', border: '1px solid #D8D4C8', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(10,61,58,0.14)', overflow: 'hidden'
        }}>
          {items.map((s, i) => (
            <div
              key={s.folio + s.label}
              onMouseDown={e => { e.preventDefault(); pick(s) }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer',
                background: i === active ? '#F5EDD8' : '#FFFFFF', borderBottom: '1px solid #F0EDE4'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A8863E" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" />
              </svg>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2828', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.address}</div>
                <div style={{ fontSize: 11, color: '#7A8A89' }}>{s.city}, FL {s.zip}</div>
              </div>
            </div>
          ))}
          {loading && items.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 11.5, color: '#9A9488' }}>Looking up Miami-Dade addresses…</div>
          )}
        </div>
      )}
    </div>
  )
}
