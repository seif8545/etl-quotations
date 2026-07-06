import type { Page } from '../App'

export default function Home({ go }: { go: (p: Page) => void }) {
  return (
    <div className="home">
      <h2>What do you want to create?</h2>
      <div className="modules">
        <button className="module" onClick={() => go('quotation')}>
          <h3>Quotation</h3>
          <p>Excel quotation with live pricing</p>
        </button>
        <button className="module" onClick={() => go('letter')}>
          <h3>Guarantee Letter</h3>
          <p>Word letter with guest list</p>
        </button>
        <button className="module" onClick={() => go('voucher')}>
          <h3>Hotel Voucher</h3>
          <p>Word voucher with room allocation</p>
        </button>
      </div>
      <p className="muted" style={{ marginTop: 24 }}>
        Everything you generate is saved under <b>Documents</b> — reopen, duplicate, or re-download any time.
      </p>
    </div>
  )
}
