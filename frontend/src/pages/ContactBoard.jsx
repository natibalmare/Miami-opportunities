import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'
import AuthModal from '../components/AuthModal'
import { api } from '../utils/api'

const money = (n) => (n || n === 0) ? '$' + Number(n).toLocaleString('en-US') : ''
const ago = (d) => {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`
}
const facts = (l) => [l.propertyType, l.beds ? `${l.beds} bd` : '', l.baths ? `${l.baths} ba` : '', l.livingSqft ? `${Number(l.livingSqft).toLocaleString()} sqft` : ''].filter(Boolean).join(' · ')

export default function ContactBoard() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [tab, setTab] = useState('fsbo')
  const [zip, setZip] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [needsAgent, setNeedsAgent] = useState(false)
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    let off = false
    setItems(null); setError('')
    const t = setTimeout(() => {
      api.getBoard({ type: tab, zip: zip.length === 5 ? zip : '', maxPrice: tab === 'fsbo' ? maxPrice.replace(/\D/g, '') : '', needsAgent: needsAgent ? '1' : '' })
        .then(d => { if (!off) setItems(d.listings || []) })
        .catch(() => { if (!off) { setItems([]); setError('The board is temporarily unavailable. Please try again.') } })
    }, 250)
    return () => { off = true; clearTimeout(t) }
  }, [tab, zip, maxPrice, needsAgent, user])

  const post = (type) => user ? nav(`/my-listings?new=${type}`) : setAuthOpen(true)
  const tabBtn = (on) => ({ border: 'none', borderBottom: `2px solid ${on ? '#C4A46B' : 'transparent'}`, background: 'none', padding: '10px 4px', marginRight: 22, fontSize: 14, fontWeight: on ? 600 : 400, color: on ? '#0A3D3A' : '#6B7878', cursor: 'pointer', fontFamily: 'inherit' })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>Buyer / Seller Board</div>
          <div style={{ fontSize: 12.5, color: '#7A8584', marginTop: 3 }}>Homes for sale by owner and buyers looking in South Florida. Message privately — contact details stay hidden.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-gold btn-sm" onClick={() => post('fsbo')}>Sell By Owner — Post Free</button>
          <button className="btn btn-outline btn-sm" onClick={() => post('buyer')}>I’m a Buyer — Post Free</button>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #E0DCD0', marginBottom: 14 }}>
        <button style={tabBtn(tab === 'fsbo')} onClick={() => setTab('fsbo')}>For Sale By Owner</button>
        <button style={tabBtn(tab === 'buyer')} onClick={() => setTab('buyer')}>Buyers Looking</button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input className="input" style={{ width: 120 }} inputMode="numeric" maxLength={5} placeholder="ZIP code" value={zip} onChange={e => setZip(e.target.value.replace(/\D/g, ''))} />
        {tab === 'fsbo' && <input className="input" style={{ width: 160 }} inputMode="numeric" placeholder="Max price" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />}
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#3E4A49', cursor: 'pointer' }}>
          <input type="checkbox" checked={needsAgent} onChange={e => setNeedsAgent(e.target.checked)} style={{ accentColor: '#C4A46B' }} />
          {tab === 'fsbo' ? 'Owner has no agent' : 'Buyer needs an agent'}
        </label>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      {items === null && <div style={{ color: '#9A9488', fontSize: 13, padding: 20 }}>Loading…</div>}
      {items && items.length === 0 && !error && (
        <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: '34px 20px' }}>
          <div style={{ fontSize: 16, marginBottom: 6 }}>{tab === 'fsbo' ? 'No homes posted here yet' : 'No buyer posts here yet'}</div>
          <div style={{ fontSize: 13, color: '#7A8584', marginBottom: 14 }}>{tab === 'fsbo' ? 'Selling your home yourself? Post it free and get messages from buyers.' : 'Looking to buy? Post what you need and let sellers find you.'}</div>
          <button className="btn btn-gold btn-sm" onClick={() => post(tab)}>Post Free</button>
        </div></div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {(items || []).map(l => (
          <div key={l.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setOpen(l.id)}>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span className={`badge badge-${l.type === 'fsbo' ? 'gold' : 'blue'}`}>{l.type === 'fsbo' ? 'For Sale By Owner' : 'Buyer'}</span>
                <span style={{ fontSize: 11, color: '#9A9488' }}>{ago(l.createdAt)}</span>
              </div>
              {l.type === 'fsbo' ? (
                <>
                  <div style={{ fontSize: 20, fontWeight: 300, color: '#0A3D3A' }}>{money(l.price)}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{l.address}</div>
                  <div style={{ fontSize: 12, color: '#6B7878' }}>{[l.city, l.zip].filter(Boolean).join(', ')}</div>
                  <div style={{ fontSize: 12, color: '#3E4A49', marginTop: 6 }}>{facts(l)}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#0A3D3A' }}>{l.budget}</div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>{l.area}</div>
                  <div style={{ fontSize: 12, color: '#3E4A49', marginTop: 6 }}>{facts(l)}</div>
                </>
              )}
              <div style={{ fontSize: 12.5, color: '#5A6A69', lineHeight: 1.5, marginTop: 8, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.message}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11.5, color: '#7A8584' }}>
                <span>{l.poster}{l.mine ? ' · Your post' : ''}</span>
                <span>{l.hasAgent ? 'Has agent' : 'No agent'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="legal-notice" style={{ marginTop: 18 }}>
        Posts are created by members and are not verified by MO. MO is not a party to any transaction, does not represent buyers or sellers on this board, and does not receive compensation from posts. Verify ownership, condition and financing independently and consult a Florida real estate attorney before signing anything. Never send money or personal financial information through messages.
      </div>

      {open && <ListingModal id={open} onClose={() => setOpen(null)} onSignIn={() => { setOpen(null); setAuthOpen(true) }} />}
      {authOpen && <AuthModal initialMode="register" onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

function ListingModal({ id, onClose, onSignIn }) {
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getListing(id).then(setD).catch(() => setError('This post is not available.'))
  }, [id])

  const send = async () => {
    setBusy(true); setError('')
    try {
      const r = await api.startConversation(id, msg)
      nav(`/messages?c=${r.conversationId}`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const l = d?.listing
  const c = d?.contact
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,30,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#FFFFFF', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #E8E4D8' }}>
          <span className={`badge badge-${l?.type === 'fsbo' ? 'gold' : 'blue'}`}>{l ? (l.type === 'fsbo' ? 'For Sale By Owner' : 'Buyer Looking') : '…'}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#7A8584' }}>×</button>
        </div>
        <div style={{ padding: 18 }}>
          {!l && !error && <div style={{ color: '#9A9488' }}>Loading…</div>}
          {l && (
            <>
              {l.type === 'fsbo' ? (
                <>
                  <div style={{ fontSize: 26, fontWeight: 300, color: '#0A3D3A' }}>{money(l.price)}</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{l.address}</div>
                  <div style={{ fontSize: 13, color: '#6B7878', marginBottom: 6 }}>{[l.city, l.zip].filter(Boolean).join(', ')}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 20, fontWeight: 500, color: '#0A3D3A' }}>{l.budget}</div>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>{l.area}</div>
                </>
              )}
              <div style={{ fontSize: 13, color: '#3E4A49', marginBottom: 10 }}>{facts(l)}</div>
              <div style={{ fontSize: 13.5, color: '#2A3636', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{l.message}</div>
              <div style={{ fontSize: 12, color: '#7A8584', marginBottom: 16 }}>
                Posted by {l.poster} · {l.hasAgent ? 'Has an agent' : 'No agent'}{l.type === 'fsbo' && !l.agentsOk ? ' · No agents, please' : ''} · {l.views} views
              </div>

              {l.mine ? (
                <button className="btn btn-outline btn-sm" onClick={() => nav('/my-listings')}>Manage this post</button>
              ) : c?.ok ? (
                <>
                  <label className="form-label">Send a private message</label>
                  <textarea className="input" rows={4} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} maxLength={2000} value={msg} onChange={e => setMsg(e.target.value)}
                    placeholder={l.type === 'fsbo' ? 'Hi, is the property still available? I’d like to schedule a visit.' : 'Hi, I have a property that may fit what you’re looking for.'} />
                  {error && <div className="alert alert-danger" style={{ margin: '8px 0' }}>{error}</div>}
                  <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy || msg.trim().length < 2} onClick={send}>{busy ? 'Sending…' : 'Send Message'}</button>
                  <div style={{ fontSize: 11, color: '#9A9488', marginTop: 6 }}>Your email and phone are not shared. Replies arrive in Messages and by email.</div>
                </>
              ) : (
                <div className="alert alert-info">
                  {c?.reason || 'Sign in to send a message.'}
                  {!c || c.reason?.startsWith('Sign in') ? <button className="btn btn-gold btn-sm" style={{ marginLeft: 10 }} onClick={onSignIn}>Sign in / Join free</button> : null}
                  {c?.upgrade && <button className="btn btn-gold btn-sm" style={{ marginLeft: 10 }} onClick={() => nav('/pricing')}>See Agent plan</button>}
                </div>
              )}
            </>
          )}
          {error && !l && <div className="alert alert-danger">{error}</div>}
        </div>
      </div>
    </div>
  )
}
