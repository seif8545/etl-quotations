/**
 * Resolve a site name to a photo AND the city it belongs to.
 *
 * The compact sheet groups by place, not by day: "Luxor — Karnak, Luxor Temple,
 * Valley of the Kings". That needs a per-site city, because where a guest sleeps is
 * often not where they sightsee — the Luxor West Bank morning of a Hurghada transfer
 * day would otherwise file the Valley of the Kings under "Hurghada". The folder a
 * photo lives in is too coarse to infer it (luxor-aswan spans two cities), so the
 * city is stated explicitly per entry.
 *
 * Three passes: curated aliases, then a fuzzy match against real filenames (so
 * photos added later are picked up without touching this file), then nothing. Never
 * invents a path — an unresolved site returns '' so the caller can list it as text
 * rather than render a wrong or broken image.
 */

/** Strip everything but letters/digits so "Kom Ombo" and "kom-ombo.jpeg" collide. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** [keyword matched inside the site name, photo path, city label] */
const ALIASES: [string, string, string][] = [
  // --- Cairo & Giza (Memphis/Sakkara/Dahshur folded in: they are Cairo day trips
  //     and a separate group would fragment the card for no reader benefit) ---
  ['grandegyptianmuseum', 'cairo-giza/gem-pyramids.jpeg', 'Cairo & Giza'],
  ['gem', 'cairo-giza/inside-gem.jpeg', 'Cairo & Giza'],
  ['egyptianmuseum', 'cairo-giza/civilization-museum.jpg', 'Cairo & Giza'],
  ['civilizationmuseum', 'cairo-giza/civilization-museum.jpg', 'Cairo & Giza'],
  ['greatsphinx', 'cairo-giza/sphinx-pyramids.jpeg', 'Cairo & Giza'],
  ['sphinx', 'cairo-giza/sphinx-pyramids.jpeg', 'Cairo & Giza'],
  ['khufu', 'cairo-giza/khufu.jpeg', 'Cairo & Giza'],
  ['bentpyramid', 'cairo-giza/bent-pyramid.jpeg', 'Cairo & Giza'],
  ['pyramid', 'cairo-giza/entrance-pyramids.jpeg', 'Cairo & Giza'],
  ['giza', 'cairo-giza/entrance-pyramids.jpeg', 'Cairo & Giza'],
  ['camel', 'cairo-giza/pyramids-camel.jpeg', 'Cairo & Giza'],
  ['horseride', 'cairo-giza/horse-pyramids.jpeg', 'Cairo & Giza'],
  ['citadel', 'cairo-giza/citadel-view.jpeg', 'Cairo & Giza'],
  ['mohammedali', 'cairo-giza/mohammed-ali-mosque.jpeg', 'Cairo & Giza'],
  ['ibntulun', 'cairo-giza/ibn-tulun.jpeg', 'Cairo & Giza'],
  ['alhakim', 'cairo-giza/al-hakim-mosque.jpeg', 'Cairo & Giza'],
  ['hussain', 'cairo-giza/al-hussain.jpeg', 'Cairo & Giza'],
  ['moez', 'cairo-giza/al-moez.jpeg', 'Cairo & Giza'],
  ['khanelkhalili', 'cairo-giza/khalili-2.jpeg', 'Cairo & Giza'],
  ['khalili', 'cairo-giza/khalili-2.jpeg', 'Cairo & Giza'],
  ['bazaar', 'cairo-giza/khalili-3.jpeg', 'Cairo & Giza'],
  ['hangingchurch', 'cairo-giza/hanging-church.jpeg', 'Cairo & Giza'],
  ['copticcairo', 'cairo-giza/hanging-church.jpeg', 'Cairo & Giza'],
  ['oldcairo', 'cairo-giza/church.jpeg', 'Cairo & Giza'],
  ['stgeorge', 'cairo-giza/st-george.jpeg', 'Cairo & Giza'],
  ['marychurch', 'cairo-giza/mary-church.jpeg', 'Cairo & Giza'],
  ['dinnercruise', 'cairo-giza/nile-dinner-cruise.jpg', 'Cairo & Giza'],
  ['sakkara', 'memphis-sakkara-dahshur/sakkara-1.jpeg', 'Cairo & Giza'],
  ['saqqara', 'memphis-sakkara-dahshur/sakkara-1.jpeg', 'Cairo & Giza'],
  ['steppyramid', 'memphis-sakkara-dahshur/sakkara-2.jpeg', 'Cairo & Giza'],
  ['djoser', 'memphis-sakkara-dahshur/sakkara-2.jpeg', 'Cairo & Giza'],
  ['memphis', 'memphis-sakkara-dahshur/memphis-1.jpeg', 'Cairo & Giza'],
  ['dahshur', 'memphis-sakkara-dahshur/dahshur-1.jpeg', 'Cairo & Giza'],

  // --- Alexandria ---
  ['bibliotheca', 'alexandria/alex-library.jpeg', 'Alexandria'],
  ['alexandrialibrary', 'alexandria/alex-library.jpeg', 'Alexandria'],
  ['library', 'alexandria/alexandria-library-outside.jpeg', 'Alexandria'],
  ['qaitbaycitadel', 'alexandria/qaitbay-2.jpeg', 'Alexandria'],
  ['citadelofqaitbay', 'alexandria/qaitbay-2.jpeg', 'Alexandria'],
  ['qaitbay', 'alexandria/qaitbay-2.jpeg', 'Alexandria'],
  ['komalshuqafa', 'alexandria/alex-street.jpeg', 'Alexandria'],
  ['komelshoqafa', 'alexandria/alex-street.jpeg', 'Alexandria'],
  ['catacomb', 'alexandria/alex-street.jpeg', 'Alexandria'],
  ['pompey', 'alexandria/alex-street.jpeg', 'Alexandria'],
  ['montazah', 'alexandria/montazah.jpeg', 'Alexandria'],
  ['stanley', 'alexandria/stanley.jpeg', 'Alexandria'],
  ['alexandria', 'alexandria/qaitbay-top-view.jpeg', 'Alexandria'],

  // --- The Nile Cruise leg: Luxor, Aswan and the temples between them ---
  ['karnak', 'luxor-aswan/hypostyle.jpeg', 'Nile Cruise'],
  ['hypostyle', 'luxor-aswan/hypostyle.jpeg', 'Nile Cruise'],
  ['solareclipse', 'luxor-aswan/hypostyle.jpeg', 'Nile Cruise'],
  ['eclipse', 'luxor-aswan/hypostyle.jpeg', 'Nile Cruise'],
  ['avenueofsphinxes', 'luxor-aswan/avenue-sphinxes.jpeg', 'Nile Cruise'],
  ['avenuesphinxes', 'luxor-aswan/avenue-sphinxes.jpeg', 'Nile Cruise'],
  ['luxortemple', 'luxor-aswan/luxorpath.jpeg', 'Nile Cruise'],
  ['valleyofthekings', 'luxor-aswan/colossi.jpeg', 'Nile Cruise'],
  ['valleyofkings', 'luxor-aswan/colossi.jpeg', 'Nile Cruise'],
  ['valleyofqueens', 'luxor-aswan/colossi.jpeg', 'Nile Cruise'],
  ['valleyofthequeens', 'luxor-aswan/colossi.jpeg', 'Nile Cruise'],
  ['hatshepsut', 'luxor-aswan/colossi.jpeg', 'Nile Cruise'],
  ['colossi', 'luxor-aswan/colossi.jpeg', 'Nile Cruise'],
  ['memnon', 'luxor-aswan/colossi.jpeg', 'Nile Cruise'],
  ['habo', 'luxor-aswan/colossi.jpeg', 'Nile Cruise'],
  ['balloon', 'luxor-aswan/balloon.jpeg', 'Nile Cruise'],
  ['westbank', 'luxor-aswan/colossi.jpeg', 'Nile Cruise'],
  ['luxor', 'luxor-aswan/luxorpath.jpeg', 'Nile Cruise'],

  // (Aswan end)
  ['abusimbel', 'luxor-aswan/abusimbel.jpeg', 'Nile Cruise'],
  ['philae', 'luxor-aswan/aswan-temple.jpeg', 'Nile Cruise'],
  ['unfinishedobelisk', 'luxor-aswan/boats.jpeg', 'Nile Cruise'],
  ['obelisk', 'luxor-aswan/boats.jpeg', 'Nile Cruise'],
  ['highdam', 'luxor-aswan/nile.jpeg', 'Nile Cruise'],
  ['nubianvillage', 'luxor-aswan/nubianvillage.jpeg', 'Nile Cruise'],
  ['nubian', 'luxor-aswan/sailing-nubian.jpeg', 'Nile Cruise'],
  ['aswan', 'luxor-aswan/aswan-temple.jpeg', 'Nile Cruise'],

  // (stops along the way)
  ['komombo', 'luxor-aswan/kom-ombo.jpeg', 'Nile Cruise'],
  ['edfu', 'luxor-aswan/sunset-boat.jpeg', 'Nile Cruise'],
  ['horus', 'luxor-aswan/sunset-boat.jpeg', 'Nile Cruise'],
  ['esna', 'luxor-aswan/sailing.jpeg', 'Nile Cruise'],
  ['felucca', 'luxor-aswan/sailing.jpeg', 'Nile Cruise'],
  ['sailing', 'luxor-aswan/sailing.jpeg', 'Nile Cruise'],
  ['nilecruise', 'luxor-aswan/boats.jpeg', 'Nile Cruise'],
  ['dahabiya', 'dahabiya-philae/1.jpg', 'Nile Cruise'],

  // --- Red Sea ---
  ['hurghada', 'red-sea/hurghada-signs.jpeg', 'Hurghada'],
  ['sharmelsheikh', 'red-sea/sharm-el-sheikh.jpeg', 'Sharm El Sheikh'],
  ['sharm', 'red-sea/sharm-el-sheikh.jpeg', 'Sharm El Sheikh'],
  ['dahab', 'red-sea/dahab-night.jpeg', 'Dahab'],
  ['marsaalam', 'red-sea/marsa-alam.jpeg', 'Marsa Alam'],
  ['rasmuhammad', 'red-sea/ras-muhammad.jpeg', 'Red Sea'],
  ['tiran', 'red-sea/tiran.jpeg', 'Red Sea'],
  ['whiteisland', 'red-sea/white-island.jpeg', 'Red Sea'],
  ['scuba', 'red-sea/scuba-diving.jpeg', 'Red Sea'],
  ['diving', 'red-sea/scuba-diving.jpeg', 'Red Sea'],
  ['snorkel', 'red-sea/coral-reef.jpeg', 'Red Sea'],
  ['coral', 'red-sea/coral-reefs.jpeg', 'Red Sea'],
  ['reef', 'red-sea/coral-reef.jpeg', 'Red Sea'],
  ['jetski', 'red-sea/jet-ski-red-sea.jpeg', 'Red Sea'],
  ['saintcatherine', 'red-sea/saint-catherine-monastery.jpg', 'Sinai'],
  ['redsea', 'red-sea/red-sea-boat.jpeg', 'Red Sea'],
  ['beach', 'red-sea/red-sea-hotels.jpeg', 'Red Sea'],
]

// Longest keyword first: "valleyofthekings" must beat "valley", "qaitbaycitadel"
// must beat "citadel". Sorting here means callers cannot get the order wrong.
const SORTED = [...ALIASES].sort((a, b) => b[0].length - a[0].length)

export type PhotoManifest = Record<string, string[]>

export interface SiteInfo {
  /** Photo path under /images/tours/, or '' when nothing sensible matched. */
  photo: string
  /** City label, or '' when unknown. */
  city: string
}

/** Fuzzy pass: does any real filename share a long token with the site name? */
function fromManifest(site: string, manifest: PhotoManifest): string {
  const n = norm(site)
  if (n.length < 4) return ''
  let best = ''
  let bestLen = 0
  for (const area of Object.keys(manifest || {})) {
    for (const file of manifest[area] || []) {
      const base = norm(file.replace(/\.[a-z0-9]+$/i, '').replace(/\d+$/, ''))
      if (base.length < 4) continue
      if ((n.includes(base) || base.includes(n)) && base.length > bestLen) {
        best = `${area}/${file}`
        bestLen = base.length
      }
    }
  }
  return best
}

/** Photo + city for a site name. */
export function siteInfo(site: string, manifest: PhotoManifest): SiteInfo {
  const n = norm(site)
  if (!n) return { photo: '', city: '' }
  for (const [key, photo, city] of SORTED) if (n.includes(key)) return { photo, city }
  return { photo: fromManifest(site, manifest), city: '' }
}

/** Photo only — for callers that don't care about the city. */
export function sitePhoto(site: string, manifest: PhotoManifest, fallback = ''): string {
  return siteInfo(site, manifest).photo || fallback
}
