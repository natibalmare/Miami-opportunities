import { useEffect, useState } from 'react'
import { useAuth } from '../utils/AuthContext'
import { api } from '../utils/api'

const AUDIENCES = [
  ['all', 'Everyone'],
  ['paid', 'All paid members'],
  ['free', 'Free accounts only'],
  ['plan:investor', 'Investor plan'],
  ['plan:agent', 'Agent plan'],
  ['plan:pro', 'Pro plan'],
  ['plan:business', 'Business plan'],
  ['role:buyer', 'Buyers / investors'],
  ['role:seller', 'Sellers'],
  ['role:agent', 'Agents'],
]
const label = (a) => (AUDIENCES.find(x => x[0] === a) || [a, a])[1]

export default function AdminCampaigns() {
  const { user } = useAuth()
  const [info, setInfo] = useState(null)
  const [address, setAddress] = useState('')
  const [saved, setSaved] = useState('')
  const [channel, setChannel] = useState('email')
  const [audience, setAudience] = useState('paid')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [count, setCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const load = () => api.adminCampaigns().then(d => { setInfo(d); setAddress(d.mailingAddress || '') }).catch(e => setError(e.message))
  useEffect(() => { if (user?.isAdmin) load() }, [user])
  useEffect(() => {
    if (!user?.isAdmin) return
    setCount(null)
    api.adminPreview({ channel, audience }).then(r => setCount(r.recipients)).catch(() => setCount(null))
  }, [user, channel, audience])

  if (!user?.isAdmin) return <div style={{ padding: 40, color: '#7A8584' }}>This page is only available to the MO owner.</div>

  const saveAddress = async () => {
    setSaved('')
    try { await api.adminSaveSettings({ mailingAddress: address }); setSaved('Saved'); load() } catch (e) { setSaved(e.message) }
  }

  const send = async () => {
    if (!window.confirm(`Send this ${channel === 'sms' ? 'text' : 'email'} to ${count} ${count === 1 ? 'person' : 'people'} (${label(audience)})?`)) return
    setBusy(true); setError(''); setResult(null)
    try {
      const r = await api.adminSend({ channel, audience, subject, body })
      setResult(r); setSubject(''); setBody(''); load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const smsLen = `MO Miami Opportunities: ${body} Reply STOP to opt out.`.length
  const tab = (on) => ({ border: `1px solid ${on ? '#C4A46B' : '#D8D4C8'}`, background: on ? '#F5EDD8' : '#FFFFFF', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: on ? 600 : 400, fontFamily: 'inherit' })

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>Email & Text Members</div>
      <div style={{ fontSize: 12.5, color: '#7A8584', marginTop: 3, marginBottom: 16 }}>Send announcements, new features or market updates to your members. Every email includes an unsubscribe link; texts go only to people who agreed to receive them.</div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><div className="t-label">Business mailing address (required in marketing emails)</div></div>
        <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" style={{ flex: 1, minWidth: 240 }} value={address} onChange={e => setAddress(e.target.value)} placeholder="USA Oportunidades LLC, street address, city, FL ZIP" />
          <button className="btn btn-outline btn-sm" onClick={saveAddress}>Save</button>
          {saved && <span style={{ fontSize: 12, color: '#2E7D6B' }}>{saved}</span>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><div className="t-label">New message</div></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button style={tab(channel === 'email')} onClick={() => setChannel('email')}>Email</button>
            <button style={tab(channel === 'sms')} onClick={() => setChannel('sms')}>Text message</button>
          </div>

          {channel === 'sms' && !info?.smsConnected && (
            <div className="alert alert-warning" style={{ marginBottom: 12 }}>
              Texting is not connected yet. It needs a texting account (Twilio) with a registered business number. You can still write and preview; sending turns on once it’s connected.
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Send to</label>
            <select className="input" value={audience} onChange={e => setAudience(e.target.value)}>
              {AUDIENCES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <div style={{ fontSize: 12, color: '#8A6A2E', marginTop: 5 }}>
              {count === null ? 'Counting…' : `${count} ${count === 1 ? 'person' : 'people'} will receive this`}
              {channel === 'email' ? ' (verified emails that have not unsubscribed)' : ' (agreed to texts and have a phone number)'}
            </div>
          </div>

          {channel === 'email' && (
            <div className="form-group">
              <label className="form-label">Subject</label>
              <input className="input" maxLength={150} value={subject} onChange={e => setSubject(e.target.value)} placeholder="New on MO: Map View with every property in South Florida" />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea className="input" rows={channel === 'email' ? 9 : 4} maxLength={channel === 'email' ? 10000 : 280} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} value={body} onChange={e => setBody(e.target.value)}
              placeholder={channel === 'email' ? 'Write your email. Leave a blank line between paragraphs. “Hi [first name],” is added automatically.' : 'Short and clear. “MO Miami Opportunities:” and “Reply STOP to opt out.” are added automatically.'} />
            {channel === 'sms' && <div style={{ fontSize: 11.5, color: smsLen > 160 ? '#B84040' : '#9A9488', marginTop: 4 }}>{smsLen} characters{smsLen > 160 ? ' — over 160 is sent as 2+ texts (costs more)' : ''}</div>}
          </div>

          {error && <div className="alert alert-danger" style={{ marginBottom: 10 }}>{error}</div>}
          {result && <div className="alert alert-success" style={{ marginBottom: 10 }}>Sent to {result.sent} of {result.recipients}{result.failed ? ` · ${result.failed} could not be delivered` : ''}.</div>}

          <button className="btn btn-gold" disabled={busy || !body.trim() || !count || (channel === 'email' && (!subject.trim() || !info?.mailingAddress)) || (channel === 'sms' && !info?.smsConnected)} onClick={send}>
            {busy ? 'Sending…' : `Send ${channel === 'sms' ? 'Text' : 'Email'}`}
          </button>
          {channel === 'email' && !info?.mailingAddress && <span style={{ fontSize: 12, color: '#B84040', marginLeft: 10 }}>Add your mailing address above first.</span>}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="t-label">Sent</div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Date</th><th>Type</th><th>Audience</th><th>Subject / message</th><th>Delivered</th></tr></thead>
            <tbody>
              {(info?.history || []).map(h => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td>{h.channel === 'sms' ? 'Text' : 'Email'}</td>
                  <td>{label(h.audience)}</td>
                  <td style={{ maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.subject || h.body}</td>
                  <td>{h.sent} / {h.recipients}</td>
                </tr>
              ))}
              {info && !info.history.length && <tr><td colSpan={5} style={{ color: '#9A9488' }}>Nothing sent yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
