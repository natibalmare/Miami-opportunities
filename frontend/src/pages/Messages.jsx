import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'
import AuthModal from '../components/AuthModal'
import { api } from '../utils/api'

const when = (d) => {
  const t = new Date(d)
  const today = new Date().toDateString() === t.toDateString()
  return today ? t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const ROLE = { buyer: 'Buyer', seller: 'Seller', agent: 'Agent' }

export default function Messages() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [list, setList] = useState(null)
  const [conv, setConv] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const endRef = useRef(null)
  const activeId = params.get('c')

  const loadList = () => api.getConversations().then(d => setList(d.conversations || [])).catch(() => setList([]))
  const loadConv = (id) => api.getConversation(id).then(c => { setConv(c); loadList() }).catch(() => setConv(null))

  useEffect(() => { if (user) loadList() }, [user])
  useEffect(() => {
    if (!user || !activeId) { setConv(null); return }
    loadConv(activeId)
    const t = setInterval(() => loadConv(activeId), 20000)
    return () => clearInterval(t)
  }, [user, activeId])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [conv?.messages?.length])

  if (!user) return (
    <div style={{ maxWidth: 440, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 300, marginBottom: 12 }}>Sign in to see your messages</div>
      <button className="btn btn-gold" onClick={() => setAuthOpen(true)}>Sign In</button>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )

  const send = async () => {
    if (!text.trim()) return
    setBusy(true); setError('')
    try { await api.sendMessage(activeId, text.trim()); setText(''); await loadConv(activeId) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const listPane = (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="card-header"><div className="t-label">Conversations</div></div>
      {list === null && <div style={{ padding: 16, color: '#9A9488', fontSize: 13 }}>Loading…</div>}
      {list && list.length === 0 && <div style={{ padding: 16, color: '#7A8584', fontSize: 13, lineHeight: 1.5 }}>No messages yet. When you message a seller or buyer on the board — or someone writes about your post — it shows up here.</div>}
      {(list || []).map(c => (
        <div key={c.id} onClick={() => setParams({ c: c.id })}
          style={{ padding: '12px 14px', borderTop: '1px solid #EEEAE0', cursor: 'pointer', background: c.id === activeId ? '#F5EDD8' : 'transparent' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: c.unread ? 700 : 500 }}>{c.with} <span style={{ fontSize: 10.5, color: '#8A9696', fontWeight: 400 }}>{ROLE[c.withRole] || ''}</span></span>
            <span style={{ fontSize: 11, color: '#9A9488' }}>{when(c.lastMessageAt)}</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#8A6A2E', marginTop: 1 }}>{c.listingTitle}{c.listingStatus && c.listingStatus !== 'active' ? ` · ${c.listingStatus}` : ''}</div>
          <div style={{ fontSize: 12, color: '#5A6A69', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.unread ? <span style={{ background: '#C4A46B', color: '#1A2828', borderRadius: 8, fontSize: 10, fontWeight: 700, padding: '0 6px', marginRight: 6 }}>{c.unread}</span> : null}{c.lastBody}
          </div>
        </div>
      ))}
    </div>
  )

  const threadPane = conv ? (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'min(70vh, 640px)' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{conv.with} <span style={{ fontSize: 11, color: '#8A9696', fontWeight: 400 }}>{ROLE[conv.withRole] || ''}</span></div>
          <div style={{ fontSize: 11.5, color: '#8A6A2E' }}>{conv.listingTitle}</div>
        </div>
        <button className="btn btn-outline btn-sm mobile-only" onClick={() => setParams({})}>← Back</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: '#FBFAF6' }}>
        {conv.messages.map(m => (
          <div key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
            <div style={{ background: m.mine ? '#0A3D3A' : '#FFFFFF', color: m.mine ? '#F5EDD8' : '#1A2828', border: m.mine ? 'none' : '1px solid #E0DCD0', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
            <div style={{ fontSize: 10.5, color: '#9A9488', marginTop: 2, textAlign: m.mine ? 'right' : 'left' }}>{when(m.at)}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={{ padding: 12, borderTop: '1px solid #E8E4D8' }}>
        {error && <div className="alert alert-danger" style={{ marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea className="input" rows={2} maxLength={2000} style={{ flex: 1, resize: 'none', fontFamily: 'inherit' }} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Write a message…" />
          <button className="btn btn-gold" disabled={busy || !text.trim()} onClick={send}>{busy ? '…' : 'Send'}</button>
        </div>
        <div style={{ fontSize: 10.5, color: '#9A9488', marginTop: 6 }}>Never send money, deposits or bank details through messages. Use a licensed title company or attorney.</div>
      </div>
    </div>
  ) : (
    <div className="card"><div className="card-body" style={{ color: '#7A8584', fontSize: 13, textAlign: 'center', padding: 40 }}>Choose a conversation.</div></div>
  )

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5, marginBottom: 4 }}>Messages</div>
      <div style={{ fontSize: 12.5, color: '#7A8584', marginBottom: 16 }}>Private conversations from the Buyer / Seller Board. Your email and phone are never shown.</div>
      <div className="msg-layout" data-open={activeId ? '1' : '0'}>
        <div className="msg-list">{listPane}</div>
        <div className="msg-thread">{threadPane}</div>
      </div>
      <style>{`
        .msg-layout { display: grid; grid-template-columns: 320px 1fr; gap: 14px; align-items: start; }
        .mobile-only { display: none; }
        @media (max-width: 760px) {
          .msg-layout { grid-template-columns: 1fr; }
          .msg-layout[data-open="1"] .msg-list { display: none; }
          .msg-layout[data-open="0"] .msg-thread { display: none; }
          .mobile-only { display: inline-flex; }
        }
      `}</style>
    </div>
  )
}
