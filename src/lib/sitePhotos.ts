/**
 * Resolve a site name to a photo in the tour library.
 *
 * The compact sheet gives every site its own thumbnail, so each highlight string
 * ("Philae Temple", "Kom Ombo", "Grand Egyptian Museum") has to become a real file
 * under public/images/tours/<area>/. Three passes, in order:
 *
 *   1. ALIASES  — a curated keyword table. Hand-picked because the obvious filename
 *                 often does not exist: there is no edfu.jpeg, so Edfu borrows the
 *                 Kom Ombo shot; the Valley of the Kings borrows the Colossi.
 *   2. manifest — fuzzy match the site name against the real filenames, so photos
 *                 added later are picked up without touching this file.
 *   3. fallback — the photo of the day the site belongs to.
 *
 * Never invents a path: anything unresolved returns the fallback, or '' so the
 * caller can drop the tile rather than render a broken image.
 */

/** Strip everything but letters/digits so "Kom Ombo" and "kom-ombo.jpeg" collide. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** keyword (normalised, matched as a substring of the site name) -> photo path */
const ALIASES: [string, string][] = [
  // --- Giza / Cairo ---
  ['grandegyptianmuseum', 'cairo-giza/gem-pyramids.jpeg'],
  ['gem', 'cairo-giza/gem-pyramids.jpeg'],
  ['egyptianmuseum', 'cairo-giza/civilization-museum.jpg'],
  ['civilizationmuseum', 'cairo-giza/civilization-museum.jpg'],
  ['greatsphinx', 'cairo-giza/sphinx-pyramids.jpeg'],
  ['sphinx', 'cairo-giza/sphinx-pyramids.jpeg'],
  ['khufu', 'cairo-giza/khufu.jpeg'],
  ['pyramid', 'cairo-giza/entrance-pyramids.jpeg'],
  ['giza', 'cairo-giza/entrance-pyramids.jpeg'],
  ['camel', 'cairo-giza/pyramids-camel.jpeg'],
  ['horseride', 'cairo-giza/horse-pyramids.jpeg'],
  ['citadel', 'cairo-giza/citadel-view.jpeg'],
  ['mohammedali', 'cairo-giza/mohammed-ali-mosque.jpeg'],
  ['ibntulun', 'cairo-giza/ibn-tulun.jpeg'],
  ['alhakim', 'cairo-giza/al-hakim-mosque.jpeg'],
  ['hussain', 'cairo-giza/al-hussain.jpeg'],
  ['moez', 'cairo-giza/al-moez.jpeg'],
  ['khanelkhalili', 'cairo-giza/khalili-2.jpeg'],
  ['khalili', 'cairo-giza/khalili-2.jpeg'],
  ['bazaar', 'cairo-giza/khalili-2.jpeg'],
  ['hangingchurch', 'cairo-giza/hanging-church.jpeg'],
  ['copticcairo', 'cairo-giza/hanging-church.jpeg'],
  ['oldcairo', 'cairo-giza/hanging-church.jpeg'],
  ['stgeorge', 'cairo-giza/st-george.jpeg'],
  ['church', 'cairo-giza/church.jpeg'],
  ['dinnercruise', 'cairo-giza/nile-dinner-cruise.jpg'],
  ['bentpyramid', 'cairo-giza/bent-pyramid.jpeg'],

  // --- Memphis / Sakkara / Dahshur ---
  ['sakkara', 'memphis-sakkara-dahshur/sakkara-1.jpeg'],
  ['saqqara', 'memphis-sakkara-dahshur/sakkara-1.jpeg'],
  ['steppyramid', 'memphis-sakkara-dahshur/sakkara-2.jpeg'],
  ['djoser', 'memphis-sakkara-dahshur/sakkara-2.jpeg'],
  ['memphis', 'memphis-sakkara-dahshur/memphis-1.jpeg'],
  ['dahshur', 'memphis-sakkara-dahshur/dahshur-1.jpeg'],

  // --- Luxor / Aswan ---
  ['karnak', 'luxor-aswan/hypostyle.jpeg'],
  ['hypostyle', 'luxor-aswan/hypostyle.jpeg'],
  ['solareclipse', 'luxor-aswan/hypostyle.jpeg'],
  ['eclipse', 'luxor-aswan/hypostyle.jpeg'],
  ['avenueofsphinxes', 'luxor-aswan/avenue-sphinxes.jpeg'],
  ['avenuesphinxes', 'luxor-aswan/avenue-sphinxes.jpeg'],
  ['luxortemple', 'luxor-aswan/luxorpath.jpeg'],
  ['valleyofthekings', 'luxor-aswan/colossi.jpeg'],
  ['valleyofkings', 'luxor-aswan/colossi.jpeg'],
  ['valleyofqueens', 'luxor-aswan/colossi.jpeg'],
  ['valleyofthequeens', 'luxor-aswan/colossi.jpeg'],
  ['hatshepsut', 'luxor-aswan/colossi.jpeg'],
  ['colossi', 'luxor-aswan/colossi.jpeg'],
  ['memnon', 'luxor-aswan/colossi.jpeg'],
  ['habo', 'luxor-aswan/colossi.jpeg'],
  ['balloon', 'luxor-aswan/balloon.jpeg'],
  ['abusimbel', 'luxor-aswan/abusimbel.jpeg'],
  ['philae', 'luxor-aswan/aswan-temple.jpeg'],
  ['unfinishedobelisk', 'luxor-aswan/aswan-temple.jpeg'],
  ['obelisk', 'luxor-aswan/aswan-temple.jpeg'],
  ['highdam', 'luxor-aswan/nile.jpeg'],
  ['aswan', 'luxor-aswan/aswan-temple.jpeg'],
  ['komombo', 'luxor-aswan/kom-ombo.jpeg'],
  ['edfu', 'luxor-aswan/kom-ombo.jpeg'],
  ['horus', 'luxor-aswan/kom-ombo.jpeg'],
  ['nubianvillage', 'luxor-aswan/nubianvillage.jpeg'],
  ['nubian', 'luxor-aswan/sailing-nubian.jpeg'],
  ['felucca', 'luxor-aswan/sailing.jpeg'],
  ['sailing', 'luxor-aswan/sailing.jpeg'],
  ['nilecruise', 'luxor-aswan/boats.jpeg'],
  ['nile', 'luxor-aswan/nile.jpeg'],

  // --- Alexandria ---
  ['bibliotheca', 'alexandria/alex-library.jpeg'],
  ['library', 'alexandria/alex-library.jpeg'],
  ['qaitbaycitadel', 'alexandria/qaitbay-2.jpeg'],
  ['citadelofqaitbay', 'alexandria/qaitbay-2.jpeg'],
  ['qaitbay', 'alexandria/qaitbay-2.jpeg'],
  ['montazah', 'alexandria/montazah.jpeg'],
  ['stanley', 'alexandria/stanley.jpeg'],
  ['alexandria', 'alexandria/qaitbay-2.jpeg'],

  // --- Red Sea ---
  ['hurghada', 'red-sea/hurghada-signs.jpeg'],
  ['sharmelsheikh', 'red-sea/sharm-el-sheikh.jpeg'],
  ['sharm', 'red-sea/sharm-el-sheikh.jpeg'],
  ['dahab', 'red-sea/dahab-night.jpeg'],
  ['marsaalam', 'red-sea/marsa-alam.jpeg'],
  ['rasmuhammad', 'red-sea/ras-muhammad.jpeg'],
  ['tiran', 'red-sea/tiran.jpeg'],
  ['whiteisland', 'red-sea/white-island.jpeg'],
  ['scuba', 'red-sea/scuba-diving.jpeg'],
  ['diving', 'red-sea/scuba-diving.jpeg'],
  ['snorkel', 'red-sea/coral-reef.jpeg'],
  ['coral', 'red-sea/coral-reef.jpeg'],
  ['reef', 'red-sea/coral-reef.jpeg'],
  ['jetski', 'red-sea/jet-ski-red-sea.jpeg'],
  ['saintcatherine', 'red-sea/saint-catherine-monastery.jpg'],
  ['redsea', 'red-sea/red-sea-boat.jpeg'],
  ['beach', 'red-sea/red-sea-hotels.jpeg'],

  // --- logistics ---
  ['airporttransfer', 'arrivedepart/departure-plane.jpg'],
  ['departure', 'arrivedepart/departure-plane.jpg'],
  ['arrival', 'arrivedepart/arrival-plane.jpg'],
  ['meetassist', 'arrivedepart/arrival-plane.jpg'],
  ['domesticflight', 'arrivedepart/arrival-plane.jpg'],
  ['flight', 'arrivedepart/arrival-plane.jpg'],
]

// Longest keyword first: "valleyofthekings" must win over "valley", "grandegyptian
// museum" over "museum". Sorting here means callers cannot get the order wrong.
const SORTED = [...ALIASES].sort((a, b) => b[0].length - a[0].length)

export type PhotoManifest = Record<string, string[]>

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
      const hit = n.includes(base) || base.includes(n)
      if (hit && base.length > bestLen) { best = `${area}/${file}`; bestLen = base.length }
    }
  }
  return best
}

/**
 * Best photo for a site name.
 * @param fallback photo of the day this site belongs to, used when nothing matches.
 */
export function sitePhoto(site: string, manifest: PhotoManifest, fallback = ''): string {
  const n = norm(site)
  if (!n) return fallback
  for (const [key, path] of SORTED) if (n.includes(key)) return path
  return fromManifest(site, manifest) || fallback
}
