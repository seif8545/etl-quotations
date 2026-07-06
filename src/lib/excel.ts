import ExcelJS from 'exceljs'
import type { QuotationDraft, RefData } from './types'
import { sitePrice, transferPrice, tripDays, effectiveSelections } from './pricing'

/**
 * Fills the "Quotation new" sheet of the base template with the draft's data.
 * Layout (matches the current template exactly):
 *   D2 group ref | E3 pax | J2 arrival | J3 departure | M2 exchange rate | M3 profit
 *   B10:C15  accommodation ("N nights X", USD total)   D has =C*0.7 formulas (kept)
 *   F10:F38  site names, G10:G38 rate LE (values)
 *   H10:H38  transfer names, I10:I38 rate LE (values)
 *   J10:K..  meals ("N x LE meals", LE total)
 *   L10/L11  Guide / Rep (template formulas in M kept), L12/M12 guide ticket, L13/M13 guide accom
 */
export async function generateQuotationXlsx(d: QuotationDraft, ref: RefData): Promise<Blob> {
  const res = await fetch('/templates/newbasequotation.xlsx')
  const buf = await res.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  // Force Excel to recalculate all formulas (totals row, S.Sup, Guide/Rep) on open —
  // otherwise it shows the template's stale cached results.
  wb.calcProperties.fullCalcOnLoad = true
  const ws = wb.getWorksheet('Quotation new')
  if (!ws) throw new Error('Template sheet "Quotation new" not found')

  const pax = d.pax || 1
  const eff = effectiveSelections(d)

  ws.getCell('D2').value = d.groupRef
  ws.getCell('E3').value = pax
  // Dates must be written as UTC midnight: ExcelJS converts JS Dates to Excel
  // serials via UTC, so local-time midnight shifts a day back in UTC+ timezones.
  if (d.arrivalDate) ws.getCell('J2').value = new Date(d.arrivalDate + 'T00:00:00Z')
  if (d.departureDate) ws.getCell('J3').value = new Date(d.departureDate + 'T00:00:00Z')
  ws.getCell('M2').value = d.exchangeRate
  ws.getCell('M3').value = d.estimateProfit

  // Accommodation B10:C15
  let row = 10
  for (const a of d.accommodation) {
    if (row > 15) break
    if (a.nights > 0 && a.pricePerNight > 0) {
      ws.getCell(`B${row}`).value = `${a.nights} nights ${a.destination}`
      ws.getCell(`C${row}`).value = a.nights * a.pricePerNight
      row++
    }
  }

  // Sites F/G from row 10 (flight ticket first, like the old app)
  let rf = 10
  if (d.flightTicket > 0 && rf <= 38) {
    ws.getCell(`F${rf}`).value = 'Flight Ticket'
    ws.getCell(`G${rf}`).value = d.flightTicket
    rf++
  }
  for (const id of eff.siteIds) {
    if (rf > 38) break
    const site = ref.sites.find((s) => s.id === id)
    if (!site) continue
    ws.getCell(`F${rf}`).value = site.name
    ws.getCell(`G${rf}`).value = sitePrice(site, d.arrivalDate)
    rf++
  }

  // Transfers H/I from row 10, repeated by quantity
  let rh = 10
  outer: for (const t of ref.transfers) {
    const qty = eff.transferCounts[t.id] ?? 0
    for (let i = 0; i < qty; i++) {
      if (rh > 38) break outer
      ws.getCell(`H${rh}`).value = t.name
      ws.getCell(`I${rh}`).value = transferPrice(t, d.arrivalDate, pax, ref)
      rh++
    }
  }

  // Meals J/K from row 10
  let rj = 10
  for (const tier of ref.mealTiers) {
    const qty = d.mealCounts[tier.id] ?? 0
    if (qty > 0 && rj <= 38) {
      ws.getCell(`J${rj}`).value = `${qty} ${tier.price_le} meals`
      ws.getCell(`K${rj}`).value = qty * tier.price_le
      rj++
    }
  }

  // Services: L10 Guide / L11 Rep already in template with M formulas.
  // Clear them if excluded; guide ticket / accommodation go to L12/M12, L13/M13.
  const days = tripDays(d)
  const guideRate = ref.serviceRates.find((s) => s.name === 'Guide')?.rate_le_per_day ?? 0
  const repRate = ref.serviceRates.find((s) => s.name === 'Rep')?.rate_le_per_day ?? 0
  if (eff.includeGuide) {
    ws.getCell('M10').value = (d.guideDays ?? days) * (d.guideRate ?? guideRate)
  } else { ws.getCell('L10').value = null; ws.getCell('M10').value = null }
  if (d.includeRep) {
    ws.getCell('M11').value = (d.repDays ?? days) * (d.repRate ?? repRate)
  } else { ws.getCell('L11').value = null; ws.getCell('M11').value = null }
  if (d.guideTicket > 0) {
    ws.getCell('L12').value = 'Guide Ticket'
    ws.getCell('M12').value = d.guideTicket
  }
  if (d.guideAccommodation > 0) {
    ws.getCell('L13').value = 'GuideAccomodation'
    ws.getCell('M13').value = d.guideAccommodation
  }

  const out = await wb.xlsx.writeBuffer()
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
