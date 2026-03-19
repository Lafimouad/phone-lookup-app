import React, { useState } from 'react'
import axios from 'axios'

export default function AccountLookup() {
  const [phone, setPhone] = useState('')
  const [results, setResults] = useState(null)
  const [status, setStatus] = useState('')

  async function doLookup() {
    setStatus('Searching...')
    try {
      const res = await axios.get('http://localhost:4000/api/lookup', { params: { phone } })
      setResults(res.data)
      setStatus('Done')
    } catch (err) {
      setStatus(err.response?.data?.error || err.message)
    }
  }

  return (
    <div className="card">
      <h2>Account lookup (placeholder)</h2>
      <p>Public lookup across social platforms is generally restricted; this shows where integrations would appear.</p>
      <label>Phone</label>
      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1234567890" />
      <div className="row">
        <button onClick={doLookup}>Search accounts</button>
      </div>

      {status && <p className="status">{status}</p>}
      {results && (
        <pre className="results">{JSON.stringify(results, null, 2)}</pre>
      )}
    </div>
  )
}
