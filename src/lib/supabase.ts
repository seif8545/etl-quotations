import { createClient } from '@supabase/supabase-js'
import type { RefData } from './types'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export async function loadRefData(): Promise<RefData> {
  const [regions, sites, transfers, paxTiers, destinations, mealTiers, serviceRates, settings] =
    await Promise.all([
      supabase.from('q_regions').select('*').order('sort'),
      supabase.from('q_sites').select('*').eq('active', true).order('sort'),
      supabase.from('q_transfers').select('*').eq('active', true).order('sort'),
      supabase.from('q_pax_tiers').select('*').order('min_pax'),
      supabase.from('q_accommodation_destinations').select('*').eq('active', true).order('sort'),
      supabase.from('q_meal_tiers').select('*').eq('active', true).order('price_le'),
      supabase.from('q_service_rates').select('*').eq('active', true).order('id'),
      supabase.from('q_settings').select('*'),
    ])
  const err =
    regions.error || sites.error || transfers.error || paxTiers.error ||
    destinations.error || mealTiers.error || serviceRates.error || settings.error
  if (err) throw err
  return {
    regions: regions.data ?? [],
    sites: sites.data ?? [],
    transfers: transfers.data ?? [],
    paxTiers: paxTiers.data ?? [],
    destinations: destinations.data ?? [],
    mealTiers: mealTiers.data ?? [],
    serviceRates: serviceRates.data ?? [],
    settings: Object.fromEntries((settings.data ?? []).map((s: any) => [s.key, s.value])),
  }
}
