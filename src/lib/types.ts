export interface Region {
  id: number
  name: string
  kind: 'site' | 'trip'
  sort: number
}

export interface Site {
  id: number
  region_id: number
  name: string
  price: number
  new_price: number | null
  effective_date: string | null
  active: boolean
  sort: number
}

export interface Transfer {
  id: number
  region_id: number
  name: string
  price_limo: number
  price_coaster: number
  price_bus: number
  new_price_limo: number | null
  new_price_coaster: number | null
  new_price_bus: number | null
  effective_date: string | null
  countable: boolean
  active: boolean
  sort: number
}

export interface PaxTier {
  id: number
  min_pax: number
  max_pax: number
  vehicle: 'limo' | 'coaster' | 'bus'
}

export interface AccommodationDestination {
  id: number
  name: string
  active: boolean
  sort: number
}

export interface MealTier {
  id: number
  price_le: number
  active: boolean
}

export interface ServiceRate {
  id: number
  name: string
  rate_le_per_day: number
  active: boolean
}

export interface RefData {
  regions: Region[]
  sites: Site[]
  transfers: Transfer[]
  paxTiers: PaxTier[]
  destinations: AccommodationDestination[]
  mealTiers: MealTier[]
  serviceRates: ServiceRate[]
  settings: Record<string, string>
}

/** Wizard state */
export interface AccommodationEntry {
  destination: string
  nights: number
  pricePerNight: number // USD
}

export interface QuotationDraft {
  name: string
  groupRef: string
  pax: number
  arrivalDate: string // yyyy-mm-dd
  departureDate: string
  exchangeRate: number
  estimateProfit: number
  flightTicket: number // LE, 0 = none
  accommodation: AccommodationEntry[]
  siteIds: number[]
  transferCounts: Record<number, number> // transfer id -> qty (1 for plain checkbox)
  mealCounts: Record<number, number> // meal tier id -> qty
  guideTicket: number // LE
  guideAccommodation: number // LE
  includeGuide: boolean
  includeRep: boolean
  guideDays: number | null   // null = auto (trip days)
  guideRate: number | null   // null = auto (DB rate)
  repDays: number | null
  repRate: number | null
}

export const emptyDraft = (): QuotationDraft => ({
  name: '',
  groupRef: '',
  pax: 1,
  arrivalDate: '',
  departureDate: '',
  exchangeRate: 47.7,
  estimateProfit: 0,
  flightTicket: 0,
  accommodation: [],
  siteIds: [],
  transferCounts: {},
  mealCounts: {},
  guideTicket: 0,
  guideAccommodation: 0,
  includeGuide: true,
  includeRep: true,
  guideDays: null,
  guideRate: null,
  repDays: null,
  repRate: null,
})
