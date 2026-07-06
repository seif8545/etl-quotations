import type { QuotationDraft, RefData, Site, Transfer } from './types'

/**
 * Pricing engine — mirrors the "Quotation new" sheet formulas exactly:
 *  - Site rate (LE): arrival >= effective_date ? new_price : price
 *  - Transfer rate (LE): price set by arrival vs effective_date, vehicle column by pax tier
 *  - Accommodation (USD): nights * price/night; SGL supplement = rate * sgl factor (0.7)
 *  - Meals (LE): qty * tier
 *  - Services (LE): Guide/Rep = days * rate/day (+ guide ticket + guide accommodation)
 *  - Totals: G39=Σsites/xr  I39=Σtransfers/xr/pax  K39=Σmeals/xr  M39=Σservices/xr/pax
 *  - P.P in DBL (F42) = C39+G39+I39+K39+M39+profit
 */

export function sitePrice(site: Site, arrival: string): number {
  if (site.new_price != null && site.effective_date && arrival && arrival >= site.effective_date) {
    return site.new_price
  }
  return site.price
}

export function vehicleFor(pax: number, ref: RefData): 'limo' | 'coaster' | 'bus' {
  const tier = ref.paxTiers.find((t) => pax >= t.min_pax && pax <= t.max_pax)
  return tier?.vehicle ?? 'bus'
}

export function transferPrice(t: Transfer, arrival: string, pax: number, ref: RefData): number {
  const vehicle = vehicleFor(pax, ref)
  const useNew = t.effective_date && arrival && arrival >= t.effective_date
  const map = {
    limo: useNew ? t.new_price_limo ?? t.price_limo : t.price_limo,
    coaster: useNew ? t.new_price_coaster ?? t.price_coaster : t.price_coaster,
    bus: useNew ? t.new_price_bus ?? t.price_bus : t.price_bus,
  }
  return map[vehicle]
}

/**
 * Effective selections = the quotation's manual picks PLUS everything its
 * added tour days contribute. Tour days are stored separately (d.days) so they
 * stay reversible; pricing, Excel and the review all read the merged result here.
 */
export function effectiveSelections(d: QuotationDraft): {
  siteIds: number[]
  transferCounts: Record<number, number>
  includeGuide: boolean
} {
  const siteIds = new Set<number>(d.siteIds)
  const transferCounts: Record<number, number> = { ...d.transferCounts }
  let includeGuide = d.includeGuide
  for (const day of d.days ?? []) {
    for (const id of day.siteIds) siteIds.add(id)
    for (const [k, v] of Object.entries(day.transferCounts)) {
      transferCounts[+k] = (transferCounts[+k] ?? 0) + v
    }
    if (day.includeGuide) includeGuide = true
  }
  return { siteIds: [...siteIds], transferCounts, includeGuide }
}

export function tripDays(d: QuotationDraft): number {
  if (!d.arrivalDate || !d.departureDate) return 0
  const ms = new Date(d.departureDate).getTime() - new Date(d.arrivalDate).getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

export interface Totals {
  accommodationUSD: number // C39
  sglSupplementUSD: number // D39
  sitesLE: number
  transfersLE: number
  mealsLE: number
  servicesLE: number
  sitesUSD: number // G39
  transfersUSD: number // I39 (per pax)
  mealsUSD: number // K39
  servicesUSD: number // M39 (per pax)
  perPersonDBL: number // F42
}

export function computeTotals(d: QuotationDraft, ref: RefData): Totals {
  const xr = d.exchangeRate || 1
  const pax = d.pax || 1
  const sglFactor = parseFloat(ref.settings['sgl_supplement_factor'] ?? '0.7')

  const accommodationUSD = d.accommodation.reduce(
    (s, a) => s + (a.nights > 0 && a.pricePerNight > 0 ? a.nights * a.pricePerNight : 0), 0)
  const sglSupplementUSD = accommodationUSD * sglFactor

  const eff = effectiveSelections(d)

  let sitesLE = d.flightTicket > 0 ? d.flightTicket : 0
  for (const id of eff.siteIds) {
    const site = ref.sites.find((s) => s.id === id)
    if (site) sitesLE += sitePrice(site, d.arrivalDate)
  }

  let transfersLE = 0
  for (const [idStr, qty] of Object.entries(eff.transferCounts)) {
    if (qty <= 0) continue
    const t = ref.transfers.find((x) => x.id === Number(idStr))
    if (t) transfersLE += qty * transferPrice(t, d.arrivalDate, pax, ref)
  }

  let mealsLE = 0
  for (const [idStr, qty] of Object.entries(d.mealCounts)) {
    if (qty <= 0) continue
    const tier = ref.mealTiers.find((m) => m.id === Number(idStr))
    if (tier) mealsLE += qty * tier.price_le
  }

  const days = tripDays(d)
  let servicesLE = 0
  for (const sr of ref.serviceRates) {
    if (sr.name === 'Guide' && eff.includeGuide)
      servicesLE += (d.guideDays ?? days) * (d.guideRate ?? sr.rate_le_per_day)
    if (sr.name === 'Rep' && d.includeRep)
      servicesLE += (d.repDays ?? days) * (d.repRate ?? sr.rate_le_per_day)
  }
  if (d.guideTicket > 0) servicesLE += d.guideTicket
  if (d.guideAccommodation > 0) servicesLE += d.guideAccommodation

  const sitesUSD = sitesLE / xr
  const transfersUSD = transfersLE / xr / pax
  const mealsUSD = mealsLE / xr
  const servicesUSD = servicesLE / xr / pax

  const perPersonDBL =
    accommodationUSD + sitesUSD + transfersUSD + mealsUSD + servicesUSD + (d.estimateProfit || 0)

  return {
    accommodationUSD, sglSupplementUSD,
    sitesLE, transfersLE, mealsLE, servicesLE,
    sitesUSD, transfersUSD, mealsUSD, servicesUSD,
    perPersonDBL,
  }
}
