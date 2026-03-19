import React from 'react'
import PhoneLookupForm from './PhoneLookupForm'
import AccountLookup from './AccountLookup'

export default function App() {
  return (
    <div className="container">
      <h1>Phone Lookup & Verification Demo</h1>
      <PhoneLookupForm />
      <hr />
      <AccountLookup />
    </div>
  )
}
