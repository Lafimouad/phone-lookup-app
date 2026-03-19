import React, { useState } from 'react'
import axios from 'axios'

export default function PhoneLookupForm() {
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState(null)
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')

  async function sendVerify() {
    setStatus('Sending...')
    try {
      const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/'
      const url = base.replace(/\/$/, '') + '/send-verify'
      const res = await axios.post(url, { phone })
      setStatus(res.data.message || 'Sent')
      if (res.data.token) setToken(res.data.token)
      if (res.data.devCode) setStatus(`Dev code: ${res.data.devCode}`)
    } catch (err) {
      setStatus(err.response?.data?.error || err.message)
    }
  }

  async function checkVerify() {
    setStatus('Checking...')
    try {
      if (!token) return setStatus('Verification token missing; request a new code')
      const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/'
      const url = base.replace(/\/$/, '') + '/check-verify'
      const res = await axios.post(url, { phone, code, token })
      setStatus(res.data.message)
    } catch (err) {
      setStatus(err.response?.data?.error || err.message)
    }
  }

  return (
    <div className="card">
      <h2>Verify your phone</h2>
      <label>Phone number (E.164 recommended):</label>
      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1234567890" />
      <div className="row">
        <button onClick={sendVerify}>Send verification SMS</button>
      </div>

      <label>Enter code</label>
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="123456" />
      <div className="row">
        <button onClick={checkVerify}>Verify code</button>
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  )
}
