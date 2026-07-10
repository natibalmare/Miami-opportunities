import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ScoreRing from '../components/ScoreRing'

const MOCK_LEADS = [
  { id: 1, address: '332 NW 35th St', city: 'Miami', neighborhood: 'Northern Blvd', score: 86, status: 'researched', tags: ['pre-foreclosure', 'vacant'], lastContact: '2026-07-01', asIsValue: 1113750, notes: ['LLC owns property — SunBiz lookup required', 'Auction 07/27/2026 — call attorney'], contacts: [{ type: 'mail', date: '2026-06-30', note: 'No response yet' }] },
  { id: 2, address: '1425 NE 83rd St', city: 'Miami', neighborhood: 'Shorecrest', score: 78, status: 'contacted', tags: ['absentee', 'tax-delinquent', 'code-issue'], lastContact: '2026-06-20', asIsValue: 490000, notes: ['Owner in Hialeah — sent direct mail'], contacts: [{ type: 'mail', date: '2026-06-20', note: 'Direct mail sent to Hialeah address' }, { type: 'call', date: '2026-06-25', note: 'Voicemail — no callback' }] },
  { id: 3, address: '415 NE 75th St', city: 'Miami', neighborhood: 'Upper East Side', score: 71, status: 'researched', tags: ['probate', 'absentee'], lastContact: null, asIsValue: 680000, notes: [], contacts: [] },
  { id: 4, address: '820 NE 96th St', city: 'Miami', neighborhood: 'Miami Shores', score: 64, status: 'new', tags: ['absentee', 'open-permits'], lastContact: null, asIsValue: 510000, notes: [], contacts: [] },
  { id: 5, address: '2244 Funston St', city: 'Hollywood', neighborhood: 'Hollywood', score: 38, status: 'dead-lead', tags: ['avoid'], lastContact: '2026-06-10', asIsValue: 420000, notes: ['Owner not interested — listed with agent'], contacts: [] },
]

const STATUSES = ['all', 'new', 'researched', 'contacted', 'interested', 'appointment', 'offer sent', 'under contract', 'dead lead']
const ALL_TAGS  = ['pre-foreclosure', 'probate', 'divorce', 'absentee', 'vacant', 'tax-delinquent', 'code-issue', 'open-permits', 'expired-listing', 'elderly-owner', 'investor-owned', 'avoid']

export default function LeadsDashboard() {
  const [leads, setLeads] = useState(MOCK_LEADS)
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedLead, setSelectedLead] = useState(null)
  const [newNote, setNewNote] = useState('')
  const nav = useNavigate()

  const filtered = leads.filter(l => filterStatus === 'all' || l.status === filterStatus).sort((a, b) => b.score - a.score)
  const scoreColor = s => s >= 76 ? '#B84040' : s >= 51 ? '#A88C38' : s >= 26 ? '#8C6010' : '#9A9488'
  const scoreBg = s => s >= 76 ? '#F5E8E8' : s >= 51 ? '#F5EDD8' : s >= 26 ? '#F5EDD8' : '#F4F0E8'

  const addNote = (id) => {
    if (!newNote.trim()) return
    setLeads(ls => ls.map(l => l.id === id ? { ...l, notes: [...l.notes, newNote.trim()] } : l))
    if (selectedLead?.id === id) setSelectedLead(s => ({ ...s, notes: [...s.notes, newNote.trim()] }))
    setNewNote('')
  }

  const updateStatus = (id, status) => {
    setLeads(ls => ls.map(l => l.id === id ? { ...l, status } : l))
    if (selectedLead?.id === id) setSelectedLead(s => ({ ...s, status }))
  }

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>Lead Dashboard</div>
          <div style={{ fontSize: 12, color: '#9A9488', marginTop: 3 }}>Track, manage, and prioritize acquisition leads</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm">📤 Export CSV</button>
          <button className="btn btn-gold btn-sm" onClick={() => nav('/')}>+ New Search</button>
        </div>
      </div>

      {/* SUMMARY STATS */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        {[
          ['Total Leads', leads.length, null],
          ['High Priority', leads.filter(l => l.score >= 76).length, '#B84040'],
          ['Active Pipeline', leads.filter(l => !['dead-lead', 'new'].includes(l.status)).length, '#A88C38'],
          ['Avg Score', Math.round(leads.reduce((a, b) => a + b.score, 0) / leads.length), '#2E6E4A'],
        ].map(([l, v, c]) => (
          <div key={l} className="mini-stat">
            <div className="mini-stat-label">{l}</div>
            <div className="mini-stat-value" style={{ color: c || '#2A2A2A', fontSize: 22 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
        {STATUSES.map(s => (
          <button
            key={s}
            className={`btn btn-sm ${filterStatus === s ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setFilterStatus(s)}
            style={{ textTransform: 'capitalize' }}
          >{s}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedLead ? '1fr 340px' : '1fr', gap: 14 }}>

        {/* LEAD GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: selectedLead ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
          {filtered.map(lead => (
            <div key={lead.id} className="lead-card" onClick={() => setSelectedLead(lead === selectedLead ? null : lead)} style={{ borderColor: selectedLead?.id === lead.id ? '#C8A84B' : '#DDD8CC' }}>
              <div className="lead-card-score" style={{ background: scoreBg(lead.score) }}>
                <div style={{ fontSize: 18, fontWeight: 300, color: scoreColor(lead.score), letterSpacing: -0.5, lineHeight: 1 }}>{lead.score}</div>
                <div style={{ fontSize: 8, color: scoreColor(lead.score), fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>OPP</div>
              </div>
              <div style={{ paddingRight: 50 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 1 }}>{lead.address}</div>
                <div style={{ fontSize: 11, color: '#9A9488', marginBottom: 8 }}>{lead.city} · {lead.neighborhood}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {lead.tags.map(t => <span key={t} className={`tag tag-${t.split('-')[0] === 'pre' ? 'foreclosure' : t.split('-')[0]}`} style={{ fontSize: 8 }}>{t.replace(/-/g, ' ')}</span>)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>${(lead.asIsValue / 1000).toFixed(0)}K est.</span>
                  <span className={`badge badge-${lead.status === 'new' ? 'silver' : lead.status === 'dead-lead' ? 'red' : lead.status === 'under contract' ? 'green' : 'blue'}`} style={{ textTransform: 'capitalize', fontSize: 9 }}>{lead.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* DETAIL PANEL */}
        {selectedLead && (
          <div style={{ position: 'sticky', top: 70, display: 'flex', flexDirection: 'column', gap: 10 }}>

            <div className="card">
              <div className="card-header">
                <div className="t-label">Lead Detail</div>
                <button onClick={() => setSelectedLead(null)} style={{ background: 'none', border: 'none', fontSize: 16, color: '#9A9488', cursor: 'pointer' }}>×</button>
              </div>
              <div className="card-body">
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{selectedLead.address}</div>
                <div style={{ fontSize: 11, color: '#9A9488', marginBottom: 12 }}>{selectedLead.city} · {selectedLead.neighborhood}</div>

                <div className="form-label" style={{ marginBottom: 6 }}>Lead Status</div>
                <select
                  value={selectedLead.status}
                  onChange={e => updateStatus(selectedLead.id, e.target.value)}
                  style={{ border: '1px solid #DDD8CC', borderRadius: 5, padding: '7px 10px', fontSize: 12, width: '100%', fontFamily: 'inherit', background: '#FAFAF8', color: '#2A2A2A', marginBottom: 12 }}
                >
                  {STATUSES.slice(1).map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>

                <div className="form-label" style={{ marginBottom: 6 }}>Tags</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                  {selectedLead.tags.map(t => <span key={t} className={`tag tag-${t.split('-')[0] === 'pre' ? 'foreclosure' : t.split('-')[0]}`}>{t.replace(/-/g, ' ')}</span>)}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-gold btn-sm" style={{ flex: 1 }} onClick={() => nav(`/report?q=${encodeURIComponent(selectedLead.address + ' ' + selectedLead.city)}`)}>View Report →</button>
                  <button className="btn btn-outline btn-sm">PDF</button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="t-label">Contact Attempts</div></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {['📞 Call', '✉ Mail', '💬 Text', '📧 Email'].map(c => (
                    <button key={c} className="btn btn-outline btn-sm" style={{ fontSize: 9.5, padding: '4px 8px' }}>{c}</button>
                  ))}
                </div>
                {selectedLead.contacts.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #EDE8DC', fontSize: 12 }}>
                    <span style={{ fontSize: 14 }}>{c.type === 'call' ? '📞' : c.type === 'mail' ? '✉' : '💬'}</span>
                    <div><div>{c.note}</div><div style={{ fontSize: 10, color: '#9A9488' }}>{c.date}</div></div>
                  </div>
                ))}
                {selectedLead.contacts.length === 0 && <div style={{ fontSize: 12, color: '#BCB8B0' }}>No contact attempts logged yet</div>}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="t-label">Notes</div></div>
              <div className="card-body">
                {selectedLead.notes.map((n, i) => (
                  <div key={i} style={{ background: '#F4F0E8', borderRadius: 5, padding: '8px 10px', marginBottom: 6, fontSize: 12 }}>{n}</div>
                ))}
                <textarea
                  className="textarea"
                  placeholder="Add a research note, observation, or reminder…"
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  style={{ minHeight: 60, marginBottom: 8 }}
                />
                <button className="btn btn-gold btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => addNote(selectedLead.id)}>Add Note</button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
