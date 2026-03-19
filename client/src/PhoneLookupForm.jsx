import React, { useState } from 'react'
import axios from 'axios'

export default function PhoneLookupForm() {
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState(null)
  const [code, setCode] = useState('')

  async function sendVerify() {
    setStatus('Sending...')
    try {
      const res = await axios.post('http://localhost:4000/api/send-verify', { phone })
      setStatus(res.data.message || 'Sent')
      if (res.data.devCode) setStatus(`Dev code: ${res.data.devCode}`)
    } catch (err) {
      setStatus(err.response?.data?.error || err.message)
    }
  }

  async function checkVerify() {
    setStatus('Checking...')
    try {
      const res = await axios.post('http://localhost:4000/api/check-verify', { phone, code })
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
