import { createRoot } from 'react-dom/client'
import type { ReactElement } from 'react'
import { pdfFromNode } from '../lib/pdf'
import { fmtDate } from '../lib/docx'
import type { InvoiceData } from './Invoice'
import type { VoucherData } from './Voucher'
import type { LetterData } from './Letter'

/**
 * The invoice, the hotel voucher and the guarantee letter as A4 sheets in the DOM.
 *
 * WHY THIS EXISTS. Their PDFs used to be made by rendering the .docx in the browser with
 * docx-preview and photographing the result. It never worked properly: docx-preview lays these
 * templates out differently from Word — the voucher's content landed on page 2 in a squeezed
 * column, the invoice's item table drew its left column at negative x — and every attempt to
 * fix the capture fixed one document by breaking another.
 *
 * Meanwhile the package PDF and the Text → Pages PDF have never once come out wrong, because
 * they do the obvious thing: they ARE a styled 794px-wide DOM node, and the exporter captures
 * it page by page. These three now do the same. The Word files still come from the templates
 * via docxtemplater — that path is fine and is what the hotels and clients receive as .docx.
 *
 * CONSEQUENCE, worth knowing: a PDF and a .docx of the same invoice are no longer the same
 * layout. They carry the same facts, the same letterhead and the same bank details, but this
 * is a sheet built for the screen and the printer rather than a photograph of a Word file.
 */

/* 794 × 1123 is A4 at 96dpi — the same geometry ItineraryDoc and TextDoc use, so the exporter
   in lib/pdf.ts needs no special case for these. `min-height` rather than `height`: a letter
   with twenty guests must grow and be sliced across pages, never be cut off. */
const NAVY = '#0e2a47', GOLD = '#c8960a', INK = '#22344c', LINE = '#e3d7b6'

const CSS = `
/* Flex column with the footer pushed down by margin-top:auto, NOT positioned absolutely at
   bottom:0. Absolute was the first attempt and it cost a page: when the content grew past the
   1123px minimum the sheet grew with it, the footer went to the very bottom of the taller box,
   and the exporter's second A4 band held nothing but a 49px strip of footer. In flow it always
   ends whichever band the content ends on. */
.sheet { width: 794px; min-height: 1123px; background: #ffffff; color: ${INK};
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 12px; line-height: 1.5;
  padding: 38px 46px 26px; box-sizing: border-box; display: flex; flex-direction: column; }
.sheet * { box-sizing: border-box; }
/* iOS inflates text inside a block wider than the viewport, which reflows every page. */
.sheet, .sheet * { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

.sh-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.sh-head img { height: 44px; display: block; }
.sh-brand { font-family: Fraunces, Georgia, serif; color: ${NAVY}; font-size: 15px; letter-spacing: 1.5px; }
.sh-head-right { text-align: right; font-size: 11px; color: #5b6472; line-height: 1.7; white-space: nowrap; }
.sh-head-right b { color: ${NAVY}; letter-spacing: .5px; }
.sh-rule { height: 2px; background: ${GOLD}; margin: 14px 0 0; }

.sh-title { font-family: Fraunces, Georgia, serif; font-size: 25px; color: ${NAVY}; text-align: center;
  margin: 22px 0 4px; font-weight: 600; letter-spacing: .5px; }
.sh-sub { text-align: center; font-size: 10.5px; letter-spacing: 2.4px; text-transform: uppercase;
  color: #806000; margin-bottom: 20px; }

.sh-cards { display: flex; gap: 14px; margin: 18px 0 6px; flex: 0 0 auto; }
.sh-card { flex: 1 1 0; border: 1px solid ${LINE}; border-radius: 4px; padding: 12px 14px; background: #fffdf7; }
.sh-card h4 { margin: 0 0 6px; font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase; color: #806000; }
.sh-card .nm { font-family: Fraunces, Georgia, serif; font-size: 15px; color: ${NAVY}; margin-bottom: 4px; }
.sh-card p { margin: 0; font-size: 11.5px; line-height: 1.6; white-space: pre-line; }

.sh-kv { margin: 4px 0 0; font-size: 11.5px; line-height: 1.75; }
.sh-kv b { color: ${NAVY}; }

table.sh-t { width: 100%; border-collapse: collapse; margin: 16px 0 0; flex: 0 0 auto; }
table.sh-t th { background: ${NAVY}; color: #fff; font-size: 9.5px; letter-spacing: 1.2px; text-transform: uppercase;
  text-align: left; padding: 8px 10px; font-weight: 600; }
table.sh-t td { padding: 9px 10px; border-bottom: 1px solid #eee7d6; font-size: 11.5px; vertical-align: top; }
table.sh-t tr:nth-child(even) td { background: #fbf9f2; }
table.sh-t td.num, table.sh-t th.num { text-align: right; white-space: nowrap; }
table.sh-t td.mid, table.sh-t th.mid { text-align: center; white-space: nowrap; }

.sh-tot { margin: 18px 0 0; margin-left: auto; width: 320px; flex: 0 0 auto; align-self: flex-end; }
.sh-tot div { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 12.5px; }
.sh-tot .grand { background: ${NAVY}; color: #fff; font-weight: 600; border-radius: 3px 3px 0 0; }
.sh-tot .paid { border-left: 1px solid ${LINE}; border-right: 1px solid ${LINE}; }
.sh-tot .bal { border: 1px solid ${GOLD}; background: #fdf6e4; color: ${NAVY}; font-weight: 600; border-radius: 0 0 3px 3px; }

.sh-block { margin: 22px 0 0; flex: 0 0 auto; }
.sh-block h4 { margin: 0 0 8px; font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase; color: #806000; }
.sh-block .body { font-size: 11.5px; line-height: 1.65; white-space: pre-line; }
.sh-note { border-left: 3px solid ${GOLD}; background: #fdf9ee; padding: 10px 14px; white-space: pre-line;
  font-size: 11.5px; line-height: 1.6; margin: 14px 0 0; }

.sh-bank { margin: 22px 0 0; flex: 0 0 auto; border: 1px solid ${LINE}; border-radius: 4px; padding: 12px 14px; background: #fffdf7; }
.sh-bank h4 { margin: 0 0 8px; font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase; color: #806000; }
.sh-bank dl { margin: 0; display: grid; grid-template-columns: 150px 1fr; row-gap: 3px; font-size: 11.5px; }
.sh-bank dt { color: #5b6472; }
.sh-bank dd { margin: 0; color: ${NAVY}; }

.sh-sign { margin: 30px 0 0; font-size: 11.5px; line-height: 1.8; }
.sh-sign b { color: ${NAVY}; }

.sh-foot { margin-top: auto; padding-top: 9px; border-top: 1px solid ${LINE};
  display: flex; justify-content: space-between; gap: 12px; font-size: 9.5px; color: #6a7789; }
.sh-foot i { font-style: normal; color: ${GOLD}; }
`

/** The letterhead block, identical on all three documents. */
const COMPANY = {
  name: 'Egypt Top Light Travel',
  address: '20 B. El Shams Buildings, behind Le Meridien Pyramids Hotel,\nHaram Street, Giza, Egypt',
  tel: '+202 3377 8015',
  fax: '+202 3377 8016',
  email: 'info@egypttoplight.net',
  web: 'egypttoplight.net',
}

const BANK = [
  ['Bank name', 'National Bank of Egypt'],
  ['Account name', 'EGYPT TOP LIGHT'],
  ['Account USD no.', '0203061068387501011'],
  ['SWIFT code', 'NBEGEGCX020'],
  ['Bank address', 'North Fifteen Street, Zahraa El Maadi, Cairo, Egypt'],
  ['IBAN', 'EG590003002030610683875 0'],
]

const usd = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USD`

function Head({ logoUrl, right }: { logoUrl: string; right?: ReactElement | string }) {
  return (
    <>
      <div className="sh-head">
        <div>
          {logoUrl
            ? <img src={logoUrl} crossOrigin="anonymous" alt="Egypt Top Light Travel" />
            : <div className="sh-brand">EGYPT TOP LIGHT TRAVEL</div>}
        </div>
        <div className="sh-head-right">{right}</div>
      </div>
      <div className="sh-rule" />
    </>
  )
}

function Foot() {
  return (
    <div className="sh-foot">
      <span>{COMPANY.address.replace('\n', ' ')}</span>
      <span><i>Tel</i> {COMPANY.tel} &nbsp; <i>Web</i> {COMPANY.web}</span>
    </div>
  )
}

/* ---------------------------------- invoice ---------------------------------- */

function guestLines(d: InvoiceData) {
  const out: { label: string; amount: number }[] = []
  const add = (n: number, rate: number, what: string) => {
    if (n > 0) out.push({ label: `${String(n).padStart(2, '0')} ${what} × ${usd(rate)}`, amount: n * rate })
  }
  add(d.singleCount, d.singleRate, 'guests in single occupancy')
  add(d.doubleCount, d.doubleRate, 'guests in double/twin sharing')
  add(d.tripleCount, d.tripleRate, 'guests in triple sharing')
  for (const x of d.extras) if (x.label.trim() || x.rate) out.push({ label: x.label || 'Extra', amount: Number(x.rate) || 0 })
  return out
}

export function InvoiceSheet({ d, serial, logoUrl }: { d: InvoiceData; serial: string; logoUrl: string }) {
  const items = guestLines(d)
  const total = items.reduce((s, x) => s + x.amount, 0)
  const paid = d.deductions.reduce((s, x) => s + (Number(x.rate) || 0), 0)
  const showBalance = d.deductions.length > 0
  return (
    <div className="sheet">
      <Head logoUrl={logoUrl} right={<><b>Invoice</b><br />No. {serial}<br />{fmtDate(d.issueDate)}</>} />
      <div className="sh-title">Invoice</div>
      <div className="sh-sub">Egypt Top Light Travel</div>

      <div className="sh-cards">
        <div className="sh-card">
          <h4>From</h4>
          <div className="nm">{COMPANY.name}</div>
          <p>{COMPANY.address}{'\n'}Tel {COMPANY.tel} · Fax {COMPANY.fax}{'\n'}{COMPANY.email}</p>
        </div>
        <div className="sh-card">
          <h4>Billed to</h4>
          <div className="nm">{d.clientName || '—'}</div>
          {d.clientDetails.trim() && <p>{d.clientDetails.trim()}</p>}
        </div>
      </div>

      <table className="sh-t">
        <thead><tr><th>Description</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td>—</td><td className="num">{usd(0)}</td></tr>}
          {items.map((x, i) => <tr key={i}><td>{x.label}</td><td className="num">{usd(x.amount)}</td></tr>)}
        </tbody>
      </table>

      <div className="sh-tot">
        <div className="grand"><span>TOTAL</span><b>{usd(total)}</b></div>
        {showBalance && d.deductions.map((x, i) => (
          <div className="paid" key={i}><span>{x.label || 'Paid'}</span><span>{usd(Number(x.rate) || 0)}</span></div>
        ))}
        {showBalance && <div className="bal"><span>Balance due</span><b>{usd(total - paid)}</b></div>}
      </div>

      {d.inclusions.trim() && (
        <div className="sh-block">
          <h4>Included in the package</h4>
          <div className="body">{d.inclusions.trim()}</div>
        </div>
      )}

      <div className="sh-bank">
        <h4>Bank account</h4>
        <dl>{BANK.map(([k, v]) => <><dt key={k}>{k}</dt><dd key={v}>{v}</dd></>)}</dl>
      </div>

      <Foot />
    </div>
  )
}

/* ---------------------------------- voucher ---------------------------------- */

function rooms(d: VoucherData) {
  const out: { no: string; type: string; guests: string[] }[] = []
  const kinds: [string, number, number][] = [
    ['Single', d.singles, 1], ['Double', d.doubles, 2], ['Twin', d.twins, 2], ['Triple', d.triples, 3],
  ]
  let n = 1, gi = 0
  for (const [type, count, cap] of kinds) {
    for (let i = 0; i < count; i++) {
      const g: string[] = []
      for (let k = 0; k < cap; k++) g.push(d.guestNames[gi++] ?? '')
      out.push({ no: `EGTO${n++}`, type, guests: g.filter(Boolean) })
    }
  }
  return out
}

export function VoucherSheet({ d, logoUrl }: { d: VoucherData; logoUrl: string }) {
  const rs = rooms(d)
  const nights = d.fromDate && d.toDate
    ? Math.max(0, Math.round((new Date(d.toDate).getTime() - new Date(d.fromDate).getTime()) / 86400000))
    : 0
  const totalRooms = d.singles + d.doubles + d.twins + d.triples
  return (
    <div className="sheet">
      <Head logoUrl={logoUrl} right={<><b>Hotel voucher</b><br />Issued {fmtDate(new Date().toISOString().slice(0, 10))}</>} />
      <div className="sh-title">Hotel Voucher</div>
      <div className="sh-sub">Egypt Top Light Travel</div>

      <div className="sh-cards">
        <div className="sh-card">
          <h4>Property</h4>
          <div className="nm">{d.hotelName || '—'}</div>
          <p>{[d.hotelAddress, d.hotelTel && `Tel ${d.hotelTel}`, d.hotelFax && `Fax ${d.hotelFax}`]
            .filter(Boolean).join('\n')}</p>
        </div>
        <div className="sh-card">
          <h4>Guest or group</h4>
          <div className="nm">{d.groupName || '—'}</div>
          {d.nationality && <p>Nationality: {d.nationality}</p>}
        </div>
      </div>

      <table className="sh-t">
        <thead>
          <tr>
            <th>From</th><th>To</th><th className="mid">Nights</th>
            <th className="mid">SGL</th><th className="mid">DBL / TWIN</th><th className="mid">TPL</th>
            <th className="mid">Rooms</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{fmtDate(d.fromDate) || '—'}</td>
            <td>{fmtDate(d.toDate) || '—'}</td>
            <td className="mid">{nights}</td>
            <td className="mid">{d.singles}</td>
            <td className="mid">{d.doubles + d.twins}</td>
            <td className="mid">{d.triples}</td>
            <td className="mid">{totalRooms}</td>
          </tr>
        </tbody>
      </table>

      {String(d.roomNote ?? '').trim() && <div className="sh-note">{String(d.roomNote).trim()}</div>}

      <table className="sh-t">
        <thead><tr><th>Room</th><th>Name of guests in room</th><th>Room type</th></tr></thead>
        <tbody>
          {rs.length === 0 && <tr><td>—</td><td>—</td><td>—</td></tr>}
          {rs.map((r) => (
            <tr key={r.no}>
              <td>{r.no}</td>
              <td>{r.guests.length ? r.guests.join(' · ') : '—'}</td>
              <td>{r.type}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sh-sign">
        Kindly extend your usual courtesies to our guests. All charges as detailed above are for
        the account of Egypt Top Light Travel; extras are settled directly by the guest.
        <br /><br /><b>Egypt Top Light Travel</b> · Reservations
      </div>

      <Foot />
    </div>
  )
}

/* ------------------------------ guarantee letter ------------------------------ */

export function LetterSheet({ d, logoUrl }: { d: LetterData; logoUrl: string }) {
  const pax = String(d.guests.length).padStart(2, '0')
  return (
    <div className="sheet">
      <Head logoUrl={logoUrl} right={<><b>Guarantee letter</b><br />{new Date().toLocaleDateString('en-GB')}</>} />
      <div className="sh-title">Guarantee Letter</div>
      <div className="sh-sub">To whom it may concern</div>

      <div className="sh-kv">
        <b>To:</b> {d.to || '—'}<br />
        <b>From:</b> {COMPANY.name}<br />
        <b>Date:</b> {new Date().toLocaleDateString('en-GB')}
      </div>

      <div className="sh-block">
        <div className="body">
          {`We, ${COMPANY.name}, guarantee that our agency is fully responsible for all arrangements and expenses related to the ${pax} client(s) named below, and we bear full responsibility for them during their stay in Egypt — including the visa arrangement on arrival at the airport through our representative, hotel accommodation, transportation, guiding and meals as booked.`}
        </div>
      </div>

      <table className="sh-t">
        <thead>
          <tr><th className="mid">Arrival date</th><th className="mid">Flight</th><th className="mid">Time</th>
            <th className="mid">Departure date</th><th className="mid">Flight</th><th className="mid">Time</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="mid">{fmtDate(d.arrivalDate) || '—'}</td>
            <td className="mid">{d.arrivalFlight || '—'}</td>
            <td className="mid">{d.arrivalTime || '—'}</td>
            <td className="mid">{fmtDate(d.departureDate) || '—'}</td>
            <td className="mid">{d.departureFlight || '—'}</td>
            <td className="mid">{d.departureTime || '—'}</td>
          </tr>
        </tbody>
      </table>

      <table className="sh-t">
        <thead>
          <tr><th className="mid">#</th><th>Name</th><th>Date of birth</th><th>Passport</th>
            <th>Expiry</th><th>Booking ref.</th></tr>
        </thead>
        <tbody>
          {d.guests.map((g, i) => (
            <tr key={i}>
              <td className="mid">{i + 1}</td>
              <td>{g.name || '—'}</td>
              <td>{g.dob || '—'}</td>
              <td>{g.passport || '—'}</td>
              <td>{g.expiry || '—'}</td>
              <td>{g.booking || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sh-sign">
        And this is a certification from our company, to whom it may concern.
        <br /><br />Best regards,
        <br /><br /><b>Omar Aly</b><br />General Manager · {COMPANY.name}
      </div>

      <Foot />
    </div>
  )
}

/* --------------------------------- the export --------------------------------- */

/** The logo as a data URL, so html2canvas never photographs a half-loaded image. Falls back to
 *  set type in the sheet if the file cannot be read. */
async function logoDataUrl(): Promise<string> {
  try {
    const res = await fetch('/images/logo.png')
    if (!res.ok) return ''
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(fr.error)
      fr.readAsDataURL(blob)
    })
  } catch { return '' }
}

/**
 * Mount a sheet, capture it, download the PDF, take it back down.
 *
 * Called from the document forms AND from the Documents list, so it cannot rely on anything
 * already being on screen. The host sits at the top-left under the app's own UI (z-index -1)
 * rather than off-screen at -99999px: html2canvas has to lay the node out to photograph it, and
 * an element parked outside the viewport is the case its clone step gets wrong.
 */
export async function exportSheetPdf(build: (logoUrl: string) => ReactElement, filename: string): Promise<void> {
  let styleEl = document.getElementById('doc-sheet-css')
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'doc-sheet-css'
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = CSS

  const logoUrl = await logoDataUrl()
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '0'
  host.style.top = '0'
  host.style.zIndex = '-1'
  host.style.pointerEvents = 'none'
  host.style.background = '#ffffff'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    root.render(build(logoUrl))
    // One frame to mount, then let the webfonts and the logo settle — pdfFromNode waits on
    // images and fonts itself, but the node has to exist first.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)))
    await pdfFromNode(host, filename)
  } finally {
    root.unmount()
    host.remove()
  }
}
