import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'
import AuthModal from '../components/AuthModal'
import AddressSearchInput from '../components/AddressSearchInput'
import { api } from '../utils/api'

const PROPERTY_TYPES = ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Land', 'Commercial', 'Other']
const STATUS = { active: ['Active', '#2E7D6B'], paused: ['Paused', '#8A6A2E'], sold: ['Sold', '#5A6A69'] }
const money = (n) => (n || n === 0) ? '$' + Number(n).toLocaleString('en-US') : ''

const EMPTY = { type: 'fsbo', address: '', city: '', zip: '', price: '', propertyType: 'Single Family', beds: '', baths: '', livingSqft: '', area: '', budget: '', message: '', hasAgent: false, agentsOk: true }

export default function MyListings() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState(null)
  const [form, setForm] = useState(null)
  const [editId, setEditId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [authOpen, setAuthOpen] = useState(false)

  const load = () => api.myListings().then(d => setItems(d.listings || [])).catch(() => setItems([]))

  useEffect(() => { if (user) load() }, [user])
  useEffect(() => {
    const t = params.get('new')
    if (t === 'fsbo' || t === 'buyer') { setForm({ ...EMPTY, type: t }); setEditId(null) }
  }, [params])

  if (!user) return (
    <div style={{ maxWidth: 460, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 300, marginBottom: 8 }}>Post your property or what you’re looking for — free</div>
      <div style={{ fontSize: 13, color: '#7A8584', marginBottom: 16 }}>Sign in to create and manage your posts.</div>
      <button className="btn btn-gold" onClick={() => setAuthOpen(true)}>Sign In / Join Free</button>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))

  const save = async () => {
    setBusy(true); setError('')
    try {
      if (editId) await api.updateListing(editId, form)
      else await api.postListing(form)
      setForm(null); setEditId(null); setParams({})
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const setStatus = async (id, status) => {
    if (status === 'removed' && !window.confirm('Remove this post? Buyers will no longer see it.')) return
    try { await api.updateListing(id, { status }); await load() } catch (e) { setError(e.message) }
  }

  const edit = (l) => {
    setEditId(l.id)
    setForm({ type: l.type, address: l.address || '', city: l.city || '', zip: l.zip || '', price: l.price || '', propertyType: l.propertyType || 'Single Family',
      beds: l.beds ?? '', baths: l.baths ?? '', livingSqft: l.livingSqft ?? '', area: l.area || '', budget: l.budget || '', message: l.message || '', hasAgent: !!l.hasAgent, agentsOk: l.agentsOk !== false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const totals = (items || []).reduce((a, l) => ({ views: a.views + (l.views || 0), inquiries: a.inquiries + (l.inquiries || 0), unread: a.unread + (l.unread || 0) }), { views: 0, inquiries: 0, unread: 0 })

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>My Listings</div>
          <div style={{ fontSize: 12.5, color: '#7A8584', marginTop: 3 }}>Your board posts, how many people viewed them, and who wrote to you. Posting is free.</div>
        </div>
        {!form && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-gold btn-sm" onClick={() => { setForm({ ...EMPTY, type: 'fsbo' }); setEditId(null) }}>+ Sell By Owner</button>
            <button className="btn btn-outline btn-sm" onClick={() => { setForm({ ...EMPTY, type: 'buyer' }); setEditId(null) }}>+ Buyer Post</button>
          </div>
        )}
      </div>

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="mini-stat"><div className="mini-stat-label">Active posts</div><div className="mini-stat-value">{(items || []).filter(l => l.status === 'active').length}</div></div>
        <div className="mini-stat"><div className="mini-stat-label">Total views</div><div className="mini-stat-value">{totals.views}</div></div>
        <div className="mini-stat"><div className="mini-stat-label">Inquiries</div><div className="mini-stat-value">{totals.inquiries}</div></div>
        <div className="mini-stat" style={{ cursor: 'pointer' }} onClick={() => nav('/messages')}><div className="mini-stat-label">Unread messages</div><div className="mini-stat-value">{totals.unread}</div></div>
      </div>

      {form && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div className="t-label">{editId ? 'Edit post' : form.type === 'fsbo' ? 'Sell your property by owner' : 'Tell sellers what you’re looking for'}</div></div>
          <div className="card-body">
            {!editId && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['fsbo', 'For sale by owner'], ['buyer', 'I’m a buyer']].map(([v, t]) => (
                  <button key={v} type="button" className={`btn btn-sm ${form.type === v ? 'btn-gold' : 'btn-outline'}`} onClick={() => setForm(f => ({ ...f, type: v }))}>{t}</button>
                ))}
              </div>
            )}

            {form.type === 'fsbo' ? (
              <>
                <div className="form-group">
                  <label className="form-label">Property address *</label>
                  <AddressSearchInput inputStyle={{ border: '1px solid #D8D4C8', padding: '9px 11px', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#FFFFFF', outline: 'none' }} value={form.address} onChange={set('address')}
                    onPick={s => {
                      const parts = String(s.label || '').split(',').map(x => x.trim())
                      const zip = (String(s.label).match(/\b\d{5}\b/) || [])[0] || form.zip
                      setForm(f => ({ ...f, address: parts[0] || s.label, city: parts[1] && !/\d{5}/.test(parts[1]) ? parts[1] : f.city, zip }))
                    }}
                    onSubmit={() => {}} placeholder="Start typing the address…" />
                </div>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">City</label><input className="input" value={form.city} onChange={set('city')} /></div>
                  <div className="form-group"><label className="form-label">ZIP code *</label><input className="input" inputMode="numeric" maxLength={5} value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value.replace(/\D/g, '') }))} /></div>
                </div>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Asking price *</label><input className="input" inputMode="numeric" value={form.price} onChange={set('price')} placeholder="$" /></div>
                  <div className="form-group"><label className="form-label">Property type</label>
                    <select className="input" value={form.propertyType} onChange={set('propertyType')}>{PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}</select>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Areas you want *</label><input className="input" value={form.area} onChange={set('area')} placeholder="e.g. Miami Shores, North Miami" /></div>
                  <div className="form-group"><label className="form-label">Budget *</label><input className="input" value={form.budget} onChange={set('budget')} placeholder="e.g. $400K–$550K" /></div>
                </div>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Property type</label>
                    <select className="input" value={form.propertyType} onChange={set('propertyType')}>{PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}</select>
                  </div>
                  <div className="form-group"><label className="form-label">ZIP code (optional)</label><input className="input" inputMode="numeric" maxLength={5} value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value.replace(/\D/g, '') }))} /></div>
                </div>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div className="form-group"><label className="form-label">Beds{form.type === 'buyer' ? ' (min)' : ''}</label><input className="input" inputMode="numeric" value={form.beds} onChange={set('beds')} /></div>
              <div className="form-group"><label className="form-label">Baths{form.type === 'buyer' ? ' (min)' : ''}</label><input className="input" inputMode="decimal" value={form.baths} onChange={set('baths')} /></div>
              <div className="form-group"><label className="form-label">Living sqft</label><input className="input" inputMode="numeric" value={form.livingSqft} onChange={set('livingSqft')} /></div>
            </div>

            <div className="form-group">
              <label className="form-label">Description *</label>
              <textarea className="input" rows={5} maxLength={2000} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} value={form.message} onChange={set('message')}
                placeholder={form.type === 'fsbo' ? 'Condition, updates, timeline, showing availability… Do not include your phone or email — buyers will message you here.' : 'Financing (cash, FHA, conventional), timeline, must-haves…'} />
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.hasAgent} onChange={set('hasAgent')} style={{ accentColor: '#C4A46B' }} /> I already work with a real estate agent
            </label>
            {form.type === 'fsbo' && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.agentsOk} onChange={set('agentsOk')} style={{ accentColor: '#C4A46B' }} /> Real estate agents may contact me
              </label>
            )}

            {error && <div className="alert alert-danger" style={{ marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gold" disabled={busy} onClick={save}>{busy ? 'Saving…' : editId ? 'Save Changes' : 'Publish Free'}</button>
              <button className="btn btn-outline" onClick={() => { setForm(null); setEditId(null); setError(''); setParams({}) }}>Cancel</button>
            </div>
            <div style={{ fontSize: 11, color: '#9A9488', marginTop: 10, lineHeight: 1.5 }}>
              By publishing you confirm you own the property or are authorized to advertise it, and that the information is accurate. MO does not represent you and is not involved in any sale.
            </div>
          </div>
        </div>
      )}

      {error && !form && <div className="alert alert-danger" style={{ marginBottom: 10 }}>{error}</div>}
      {items === null && <div style={{ color: '#9A9488' }}>Loading…</div>}
      {items && items.length === 0 && !form && (
        <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 30, color: '#7A8584', fontSize: 13 }}>You have no posts yet.</div></div>
      )}

      {(items || []).map(l => (
        <div key={l.id} className="card" style={{ marginBottom: 10 }}>
          <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 220, flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span className={`badge badge-${l.type === 'fsbo' ? 'gold' : 'blue'}`}>{l.type === 'fsbo' ? 'For Sale By Owner' : 'Buyer'}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: STATUS[l.status]?.[1] }}>{STATUS[l.status]?.[0] || l.status}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{l.type === 'fsbo' ? `${l.address} · ${money(l.price)}` : `${l.area} · ${l.budget}`}</div>
              <div style={{ fontSize: 12, color: '#7A8584', marginTop: 3 }}>{l.views} views · {l.inquiries} inquiries{l.unread ? ` · ${l.unread} unread` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {l.unread > 0 && <button className="btn btn-gold btn-sm" onClick={() => nav('/messages')}>Read messages</button>}
              <button className="btn btn-outline btn-sm" onClick={() => edit(l)}>Edit</button>
              {l.status === 'active' && <button className="btn btn-outline btn-sm" onClick={() => setStatus(l.id, 'paused')}>Pause</button>}
              {l.status === 'paused' && <button className="btn btn-outline btn-sm" onClick={() => setStatus(l.id, 'active')}>Reactivate</button>}
              {l.status !== 'sold' && <button className="btn btn-outline btn-sm" onClick={() => setStatus(l.id, 'sold')}>{l.type === 'fsbo' ? 'Mark sold' : 'Found one'}</button>}
              <button className="btn btn-outline btn-sm" style={{ color: '#B84040', borderColor: '#E8B0B0' }} onClick={() => setStatus(l.id, 'removed')}>Remove</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
