/**
 * What Egypt's sites are called, and what to say about them.
 *
 * The paste importer reads a programme written by a supplier — bullets of prose, no
 * structure — and has to answer three questions per day that the text does not answer:
 * which chips go on the day card, which photograph opens it, and how the package intro
 * describes the trip. All three come from recognising the PLACES named in the prose.
 *
 * One entry per place:
 *   re     — how it is actually written by suppliers, in every spelling they use.
 *   chip   — the label that goes in the day's `sites` array. Also the string handed to
 *            `siteInfo()` in sitePhotos.ts, so it must contain a word that file's alias
 *            table can match — that is where the photo comes from, not from here.
 *   blurb  — a noun phrase for the generated intro: "the Giza Plateau and the Great
 *            Sphinx". Written to read in a list, so no leading capital and no verb.
 *   broad  — a general area rather than a site. Kept as a chip only when the day has no
 *            specific sites of its own: "Alexandria · Catacombs · Pompey's Pillar" says
 *            nothing the second two do not already say, and the chip strip is short.
 *   detail — one sentence of real substance, appended to a day whose supplied prose is
 *            too thin to sell anything. OFF unless the agent asks for it, and every
 *            insertion is reported, because it is the one place the importer puts words
 *            in the client's mouth that the supplier did not write.
 *
 * ORDER MATTERS. The list is scanned top to bottom and the first match wins for a given
 * span of text, so the specific must precede the general: the Great Pyramid before
 * "pyramid", Qaitbay's citadel before "citadel", Kom Ombo before "Kom".
 *
 * Every `detail` here is a plain, checkable fact about the site. Nothing about what a
 * client will feel, nothing about what is included, no prices, no durations — those
 * belong to the programme and the rate sheet, not to a dictionary.
 */

export interface Landmark {
  re: RegExp
  chip: string
  blurb?: string
  broad?: boolean
  detail?: string
}

export const LANDMARKS: Landmark[] = [
  /* ── Giza ─────────────────────────────────────────────────────────────── */
  {
    re: /\b(?:great\s+pyramid|pyramid\s+of\s+(?:cheops|khufu)|cheops|khufu)\b/i,
    chip: 'Great Pyramid of Cheops',
    blurb: 'the Great Pyramid of Cheops',
    detail: 'The Great Pyramid was the tallest building on earth for close to four thousand years, and is the only one of the seven wonders of the ancient world still standing.',
  },
  { re: /\b(?:chephren|khafre)\b/i, chip: 'Pyramid of Chephren' },
  { re: /\b(?:menkaure|mycerinus)\b/i, chip: 'Pyramid of Menkaure' },
  {
    re: /\b(?:great\s+sphinx|the\s+sphinx|sphinx)\b/i,
    chip: 'Great Sphinx',
    blurb: 'the Great Sphinx',
    detail: 'The Sphinx is carved from a single ridge of the plateau’s own limestone — it was not built up from blocks but cut down into the bedrock.',
  },
  { re: /\bpanoramic\s+(?:view|point)|\bpanorama\b/i, chip: 'Panoramic viewpoint' },
  {
    re: /\b(?:giza\s+plateau|giza\s+pyramids|pyramids\s+of\s+giza|giza)\b/i,
    chip: 'Giza Plateau',
    blurb: 'the Giza Plateau',
    broad: true,
  },
  { re: /\bvalley\s+temple\b/i, chip: 'Valley Temple' },
  { re: /\bsolar\s+boat\b/i, chip: 'Solar Boat Museum' },
  { re: /\bcamel\s+(?:ride|back)\b/i, chip: 'Camel ride' },
  { re: /\bhorse\s*(?:back\s*)?rid(?:e|ing)\b/i, chip: 'Horse ride at the pyramids' },
  { re: /\bsound\s*(?:and|&|\/)\s*light\b/i, chip: 'Sound & Light show' },

  /* ── The Cairo museums ────────────────────────────────────────────────── */
  {
    re: /\bgrand\s+egyptian\s+museum\b/i,
    chip: 'Grand Egyptian Museum',
    blurb: 'the Grand Egyptian Museum',
    detail: 'The Grand Egyptian Museum holds the complete Tutankhamun collection together for the first time — more than five thousand objects, shown as one burial rather than scattered across galleries.',
  },
  // Case-SENSITIVE on purpose: the lowercase word "gem" is ordinary English and would
  // file a "gem of a museum" under the Grand Egyptian Museum. Same chip as above, so
  // whichever form the supplier used, one chip comes out.
  { re: /\bGEM\b/, chip: 'Grand Egyptian Museum', blurb: 'the Grand Egyptian Museum' },
  {
    re: /\broyal\s+mumm(?:y|ies)\b/i,
    chip: 'Royal Mummies Hall',
    blurb: 'the Royal Mummies',
    detail: 'The Royal Mummies Hall holds twenty-two kings and queens of the New Kingdom, Ramesses II and Hatshepsut among them, each in its own climate-controlled case.',
  },
  {
    re: /\bnational\s+museum\s+of\s+egyptian\s+civili[sz]ation\b|\bcivili[sz]ation\s+museum\b|\bNMEC\b/i,
    chip: 'Civilization Museum',
    blurb: 'the Museum of Egyptian Civilization',
    detail: 'The Museum of Egyptian Civilization runs the whole sweep of the country’s history under one roof, from prehistory to the modern day, rather than stopping at the pharaohs.',
  },
  {
    re: /\begyptian\s+museum(?:\s+of\s+antiquities)?\b|\btahrir\s+museum\b/i,
    chip: 'Egyptian Museum',
    blurb: 'the Egyptian Museum on Tahrir',
    detail: 'The Egyptian Museum on Tahrir Square has been open since 1902 and remains the largest single collection of pharaonic antiquities anywhere.',
  },
  { re: /\b(?:coptic|abdeen|gayer[\s-]?anderson|manial)\s+museum\b/i, chip: 'Museum visit' },

  /* ── Islamic & Coptic Cairo ───────────────────────────────────────────── */
  {
    re: /\bcitadel\s+of\s+(?:salah|saladin|salad?in|el[\s-]?din)|\bsalah\s+el[\s-]?din\b|\bcitadel\b(?!\s+of\s+qaitbay)/i,
    chip: 'Citadel of Salah El-Din',
    blurb: 'the Citadel of Salah El-Din',
    detail: 'The Citadel was the seat of Egypt’s government for some seven hundred years, from Salah El-Din’s fortifications in the 12th century until the 19th.',
  },
  {
    re: /\b(?:mosque\s+of\s+)?(?:muhammad|mohamed|mohammed)\s+ali\b/i,
    chip: 'Mosque of Muhammad Ali',
    blurb: 'the Mosque of Muhammad Ali',
    detail: 'The Mosque of Muhammad Ali is Ottoman in every line rather than Egyptian, built in the 1830s in deliberate imitation of the great mosques of Istanbul.',
  },
  { re: /\bibn\s+tulun\b/i, chip: 'Mosque of Ibn Tulun', detail: 'Ibn Tulun is the oldest mosque in Cairo still standing in its original form, and its spiral minaret is the only one of its kind in Egypt.' },
  { re: /\bsultan\s+hassan\b/i, chip: 'Sultan Hassan Mosque' },
  { re: /\bal[\s-]?rifa'?i\b/i, chip: 'Al-Rifai Mosque' },
  { re: /\bal[\s-]?azhar\s+(?:mosque|university)\b/i, chip: 'Al-Azhar Mosque' },
  { re: /\bal[\s-]?azhar\s+park\b/i, chip: 'Al-Azhar Park', blurb: 'Al-Azhar Park above the old city', detail: 'Al-Azhar Park was built on what had been six centuries of accumulated rubble, and looks straight across the minarets of historic Cairo.' },
  { re: /\b(?:al[\s-]?)?(?:hussein|hussain)\b/i, chip: 'Al-Hussein Mosque' },
  { re: /\bal[\s-]?hakim\b/i, chip: 'Al-Hakim Mosque' },
  { re: /\b(?:al[\s-]?mo?ez|el[\s-]?mo?ez|muizz)\b/i, chip: 'Al-Moez Street' },
  {
    re: /\bkhan\s+el?[\s-]?khalili\b|\bkhan\s+al[\s-]?khalili\b|\bkhalili\b/i,
    chip: 'Khan el Khalili',
    blurb: 'Khan el Khalili',
    detail: 'Khan el Khalili has been a working market since the 14th century — the coppersmiths, the spice merchants and the old caravanserai courtyards are still in the lanes they have always occupied.',
  },
  { re: /\bbazaar\b|\bsouk\b/i, chip: 'The bazaar', broad: true },
  { re: /\bhanging\s+church\b/i, chip: 'Hanging Church', detail: 'The Hanging Church is built on top of the gatehouse of a Roman fortress, its nave suspended over the old water gate — which is where the name comes from.' },
  { re: /\bcoptic\s+cairo\b/i, chip: 'Coptic Cairo', blurb: 'Coptic Cairo', broad: true },
  { re: /\babu\s+serga\b|\bsergius\b/i, chip: 'Abu Serga Church' },
  { re: /\bben\s+ezra\b/i, chip: 'Ben Ezra Synagogue' },
  { re: /\bold\s+cairo\b/i, chip: 'Old Cairo', broad: true },
  { re: /\bislamic\s+cairo\b/i, chip: 'Islamic Cairo', blurb: 'Islamic Cairo', broad: true },
  { re: /\btahrir\b/i, chip: 'Tahrir Square' },
  { re: /\bcairo\s+tower\b/i, chip: 'Cairo Tower' },

  /* ── Memphis, Sakkara, Dahshur ────────────────────────────────────────── */
  {
    re: /\bstep\s+pyramid\b|\bdjoser\b|\bzoser\b/i,
    chip: 'Step Pyramid of Djoser',
    blurb: 'the Step Pyramid of Djoser',
    detail: 'The Step Pyramid is the oldest large stone building in the world, and the first time anyone attempted a pyramid at all.',
  },
  { re: /\bsa[kq]{1,2}ara\b/i, chip: 'Sakkara', blurb: 'the necropolis at Sakkara' },
  { re: /\bmemphis\b/i, chip: 'Memphis', blurb: 'Memphis, the first capital', detail: 'Memphis was Egypt’s capital for the whole of the Old Kingdom; what stands today is the open-air museum around the fallen colossus of Ramesses II.' },
  { re: /\bbent\s+pyramid\b/i, chip: 'Bent Pyramid' },
  { re: /\bred\s+pyramid\b/i, chip: 'Red Pyramid' },
  { re: /\bdahshur\b/i, chip: 'Dahshur', blurb: 'the pyramids at Dahshur' },
  { re: /\bmastaba\b/i, chip: 'Mastaba tombs' },

  /* ── Alexandria ───────────────────────────────────────────────────────── */
  {
    re: /\bcatacombs?\b|\bkom\s+el[\s-]?sho?[qk]afa\b|\bkom\s+al[\s-]?shuqafa\b/i,
    chip: 'Catacombs of Kom El Shoqafa',
    blurb: 'the Catacombs of Kom El Shoqafa',
    detail: 'The Catacombs of Kom El Shoqafa are cut three levels down into the rock, and are the one place where Egyptian, Greek and Roman funerary art share the same chambers.',
  },
  {
    re: /\bpompey'?s?\s+pillar\b|\bserapeum\b/i,
    chip: "Pompey's Pillar",
    blurb: "Pompey's Pillar",
    detail: 'The single granite column known as Pompey’s Pillar has nothing to do with Pompey — it was raised for Diocletian, on the ruins of the Serapeum that stood around it.',
  },
  {
    re: /\bbibliotheca\s+alexandrina\b|\balexandria\s+librar(?:y|ies)\b|\blibrary\s+of\s+alexandria\b/i,
    chip: 'Bibliotheca Alexandrina',
    blurb: 'the Bibliotheca Alexandrina',
    detail: 'The Bibliotheca Alexandrina stands as a deliberate answer to the library that was lost, its reading room stepped down over eleven levels under a single tilted disc of a roof.',
  },
  {
    re: /\b(?:citadel\s+of\s+)?qaitbay\b|\bqait\s?bey\b/i,
    chip: 'Citadel of Qaitbay',
    blurb: 'the Citadel of Qaitbay on the harbour',
    detail: 'Qaitbay’s fort stands on the exact spot of the Pharos lighthouse, and was built in part from its fallen stone.',
  },
  { re: /\bmontazah\b|\bmontaza\b/i, chip: 'Montazah Gardens' },
  { re: /\bstanley\s+bridge\b/i, chip: 'Stanley Bridge' },
  { re: /\bcorniche\b/i, chip: 'Mediterranean Corniche', blurb: 'the Corniche' },
  { re: /\broman\s+(?:amphi)?theat(?:re|er)\b|\bkom\s+el[\s-]?dikka\b/i, chip: 'Roman Theatre' },
  { re: /\balexandria\b/i, chip: 'Alexandria', blurb: 'a day on the Mediterranean in Alexandria', broad: true },

  /* ── Luxor: East Bank ─────────────────────────────────────────────────── */
  {
    re: /\bkarnak\b/i,
    chip: 'Karnak Temple',
    blurb: 'Karnak',
    detail: 'Karnak was built and rebuilt over some two thousand years by roughly thirty pharaohs, which makes it the largest religious complex ever raised anywhere.',
  },
  { re: /\bhypostyle\b/i, chip: 'Great Hypostyle Hall', detail: 'The Great Hypostyle Hall stands on a hundred and thirty-four columns, the tallest of them twenty-one metres, and once carried a stone roof over all of it.' },
  { re: /\bavenue\s+of\s+(?:the\s+)?sphinxes\b|\bsphinx\s+avenue\b/i, chip: 'Avenue of Sphinxes' },
  { re: /\bluxor\s+temple\b/i, chip: 'Luxor Temple', blurb: 'Luxor Temple' },
  { re: /\bluxor\s+museum\b/i, chip: 'Luxor Museum' },
  { re: /\bmummification\s+museum\b/i, chip: 'Mummification Museum' },

  /* ── Luxor: West Bank ─────────────────────────────────────────────────── */
  {
    re: /\bvalley\s+of\s+the\s+kings\b|\bvalley\s+of\s+kings\b/i,
    chip: 'Valley of the Kings',
    blurb: 'the Valley of the Kings',
    detail: 'Sixty-three tombs have been found in the Valley of the Kings, cut deep into the rock behind a single pyramid-shaped peak that the New Kingdom chose in place of building its own.',
  },
  { re: /\bvalley\s+of\s+the\s+queens\b|\bvalley\s+of\s+queens\b/i, chip: 'Valley of the Queens' },
  { re: /\bhatshepsut\b|\bdeir\s+el[\s-]?bahari\b/i, chip: 'Temple of Hatshepsut', blurb: 'Hatshepsut’s terraces at Deir el-Bahari', detail: 'Hatshepsut’s temple is cut in three colonnaded terraces straight into the cliff behind it, built for the woman who ruled Egypt as king for two decades.' },
  { re: /\bcolossi\s+of\s+memnon\b|\bcolossi\b|\bmemnon\b/i, chip: 'Colossi of Memnon' },
  { re: /\bmedinet\s+habu\b|\bhabu\b/i, chip: 'Medinet Habu' },
  { re: /\bramesseum\b/i, chip: 'Ramesseum' },
  { re: /\bdeir\s+el[\s-]?medina\b|\bworkers?'?\s+village\b/i, chip: 'Deir el-Medina' },
  { re: /\bnobles?'?\s+tombs?\b|\btombs\s+of\s+the\s+nobles\b/i, chip: 'Tombs of the Nobles' },
  { re: /\bwest\s+bank\b/i, chip: 'Luxor West Bank', blurb: 'the Theban West Bank' },
  { re: /\bhot[\s-]?air\s+balloon\b|\bballoon\s+(?:ride|flight)\b/i, chip: 'Hot-air balloon' },

  /* ── Between Luxor and Aswan ──────────────────────────────────────────── */
  { re: /\bkom\s+omb?o\b|\bkom\s+el[\s-]?ombo\b/i, chip: 'Kom Ombo Temple', blurb: 'Kom Ombo', detail: 'Kom Ombo is a double temple, split down its axis between Sobek the crocodile god and Horus the elder, with a mirrored set of chambers for each.' },
  { re: /\bedfu\b|\btemple\s+of\s+horus\b/i, chip: 'Edfu Temple', blurb: 'Edfu', detail: 'Edfu is the best-preserved temple in Egypt, buried in sand up to its cornices until the 1860s, which is exactly why its reliefs survived.' },
  { re: /\besna\b/i, chip: 'Esna Lock' },
  { re: /\bdendera\b|\bdandara\b/i, chip: 'Dendera Temple' },
  { re: /\babydos\b/i, chip: 'Abydos Temple' },

  /* ── Aswan ────────────────────────────────────────────────────────────── */
  {
    re: /\babu\s+simbel\b/i,
    chip: 'Abu Simbel',
    blurb: 'Abu Simbel',
    detail: 'Both temples at Abu Simbel were cut from the cliff, sawn into blocks and rebuilt sixty-five metres higher in the 1960s, ahead of the rising lake.',
  },
  { re: /\bphilae\b|\btemple\s+of\s+isis\b/i, chip: 'Philae Temple', blurb: 'Philae', detail: 'Philae was moved stone by stone to the neighbouring island of Agilkia after the dam left its own island underwater.' },
  { re: /\bhigh\s+dam\b|\baswan\s+dam\b/i, chip: 'Aswan High Dam' },
  { re: /\bunfinished\s+obelisk\b|\bgranite\s+quarr(?:y|ies)\b|\bobelisk\b/i, chip: 'Unfinished Obelisk' },
  { re: /\bnubian\s+village\b/i, chip: 'Nubian Village', blurb: 'a Nubian village on the river' },
  { re: /\bfelucca\b/i, chip: 'Felucca sail' },
  { re: /\belephantine\b/i, chip: 'Elephantine Island' },
  { re: /\bkitchener\b|\bbotanical\s+(?:island|garden)\b/i, chip: "Kitchener's Island" },
  { re: /\baswan\b/i, chip: 'Aswan', blurb: 'Aswan', broad: true },

  /* ── The river itself ─────────────────────────────────────────────────── */
  { re: /\bnile\s+cruise\b|\bcruise\s+ship\b|\bembark\b/i, chip: 'Nile cruise', blurb: 'the Nile between Luxor and Aswan' },
  { re: /\bdahabiya\b/i, chip: 'Dahabiya', blurb: 'a dahabiya under sail' },
  { re: /\bdinner\s+cruise\b|\bnile\s+dinner\b/i, chip: 'Nile dinner cruise' },

  /* ── Red Sea & Sinai ──────────────────────────────────────────────────── */
  { re: /\bhurghada\b/i, chip: 'Hurghada', blurb: 'the Red Sea at Hurghada', broad: true },
  { re: /\bsharm\s+el[\s-]?sheikh\b/i, chip: 'Sharm El Sheikh', blurb: 'Sharm El Sheikh', broad: true },
  { re: /\bdahab\b/i, chip: 'Dahab' },
  { re: /\bmarsa\s+alam\b/i, chip: 'Marsa Alam' },
  { re: /\bras\s+mu?ham+ad\b/i, chip: 'Ras Muhammad' },
  { re: /\btiran\b/i, chip: 'Tiran Island' },
  { re: /\bwhite\s+island\b/i, chip: 'White Island' },
  { re: /\bdolphin\s+house\b/i, chip: 'Dolphin House' },
  { re: /\babu\s+nuhas\b/i, chip: 'Abu Nuhas wrecks' },
  { re: /\bliveaboard\b/i, chip: 'Liveaboard' },
  { re: /\b(?:scuba|dive|diving|dives)\b/i, chip: 'Diving', blurb: 'diving on the Red Sea reefs' },
  { re: /\bsnorkel/i, chip: 'Snorkelling' },
  { re: /\bcoral\s+reef/i, chip: 'Coral reefs' },
  { re: /\bst\.?\s+catherine|\bsaint\s+catherine\b/i, chip: 'Saint Catherine Monastery' },
  { re: /\bmount\s+sinai\b/i, chip: 'Mount Sinai' },

  /* ── Elsewhere ────────────────────────────────────────────────────────── */
  { re: /\bfayoum\b|\bfayyum\b/i, chip: 'Fayoum' },
  { re: /\bwadi\s+el[\s-]?hitan\b|\bwhale\s+valley\b/i, chip: 'Wadi El-Hitan' },
  { re: /\bwhite\s+desert\b/i, chip: 'White Desert' },
  { re: /\bbahariya\b/i, chip: 'Bahariya Oasis' },
  { re: /\bsiwa\b/i, chip: 'Siwa Oasis' },
  { re: /\bsuez\s+canal\b/i, chip: 'Suez Canal' },

  /* ── Things a programme does that are not places ──────────────────────── */
  { re: /\bpyramids?[\s-]*view\s+(?:restaurant|lunch|dinner|table)\b/i, chip: 'Pyramids-view lunch' },
  { re: /\bseaside\s+(?:restaurant|lunch|dinner)\b|\blunch\s+(?:by|overlooking)\s+the\s+(?:sea|mediterranean)\b/i, chip: 'Seaside lunch' },
  { re: /\bconcert\b|\blive\s+show\b|\bperformance\b/i, chip: 'Evening concert' },
  { re: /\bfree\s+(?:time|day|afternoon|morning)\b|\bat\s+leisure\b|\bown\s+leisure\b/i, chip: 'Time at leisure', broad: true },
  { re: /\bmeet\s*(?:and|&)\s*assist\b/i, chip: 'Meet & assist', broad: true },
]

/**
 * Every landmark named in a block of text, in the order they are first mentioned.
 *
 * Order of MENTION, not order of the table — a day that opens on lunch and closes on
 * the museum should chip in that order, because the chips are read as a summary of the
 * day. Ties inside a single position fall back to table order, which is why the
 * specific entries sit above the general ones.
 */
export function landmarksIn(text: string): Landmark[] {
  // Matched against the text AS WRITTEN: one entry (GEM) is deliberately case-sensitive.
  const hay = String(text || '')
  if (!hay) return []
  const hits: { at: number; lm: Landmark }[] = []
  const claimed: [number, number][] = []
  for (const lm of LANDMARKS) {
    const re = new RegExp(lm.re.source, lm.re.flags.includes('g') ? lm.re.flags : lm.re.flags + 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(hay))) {
      const from = m.index
      const to = m.index + m[0].length
      // A span already taken by an earlier (more specific) entry cannot be claimed
      // again: "Great Sphinx" must not also register as a bare "sphinx", and the
      // "citadel" inside "Citadel of Qaitbay" belongs to Qaitbay.
      if (claimed.some(([a, b]) => from < b && to > a)) { if (m[0].length === 0) re.lastIndex++; continue }
      claimed.push([from, to])
      hits.push({ at: from, lm })
      break // one chip per landmark per block, however many times it is named
    }
  }
  hits.sort((a, b) => a.at - b.at)
  const seen = new Set<string>()
  const out: Landmark[] = []
  for (const h of hits) {
    if (seen.has(h.lm.chip)) continue
    seen.add(h.lm.chip)
    out.push(h.lm)
  }
  return out
}
