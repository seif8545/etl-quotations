const { deriveSegments, applyOverrides } = require('/tmp/segtest/segments.js')

const M = (b, l, d) => ({ breakfast: !!b, lunch: !!l, dinner: !!d })
const day = (uid, title, sites, hotel, meals) => ({ uid, title, photo: uid + '.jpg', sites, meals: meals || M(1, 0, 1), hotel: hotel || '' })

let fails = 0
const check = (name, cond, extra) => {
  if (cond) console.log('  PASS  ' + name)
  else { fails++; console.log('  FAIL  ' + name + (extra ? '  ->  ' + JSON.stringify(extra) : '')) }
}

// ---------------------------------------------------------------- Scenario 1
// Classic Cairo + Nile cruise: 8 days, hotels 3 Cairo + 4 cruise (7 nights).
console.log('\n1) Cairo 3n + Nile cruise 4n, 8-day sequence')
{
  const seq = [
    day('a', 'Arrival', ['Meet & assist', 'Hotel check-in'], 'Steigenberger', M(0, 0, 1)),
    day('d1', 'Pyramids', ['Pyramids', 'Sphinx'], 'Steigenberger'),
    day('d2', 'Museum', ['Egyptian Museum', 'Khan el-Khalili'], 'Steigenberger'),
    day('d3', 'Fly to Luxor', ['Karnak', 'Luxor Temple'], 'M/S Royal Lily', M(1, 1, 1)),
    day('d4', 'West Bank', ['Valley of the Kings', 'Hatshepsut'], 'M/S Royal Lily', M(1, 1, 1)),
    day('d5', 'Edfu', ['Edfu', 'Kom Ombo'], 'M/S Royal Lily', M(1, 1, 1)),
    day('d6', 'Aswan', ['Philae', 'High Dam'], 'M/S Royal Lily', M(1, 1, 1)),
    day('z', 'Departure', ['Airport transfer'], '', M(1, 0, 0)),
  ]
  const hotels = [{ nights: 3, destination: 'Cairo & Giza' }, { nights: 4, destination: 'Nile Cruise (Luxor → Aswan)' }]
  const segs = deriveSegments(seq, hotels, { notesByUid: { d3: ['Domestic flight Cairo → Luxor.'] } })
  console.log(JSON.stringify(segs.map(s => ({ l: s.label, r: s.dayRange, d: s.destination, stay: s.stay, meals: s.meals, hl: s.highlights.length, notes: s.notes.length })), null, 1))
  check('2 blocks', segs.length === 2, segs.length)
  check('block 1 = 3 Nights / Days 1-3', segs[0].label === '3 Nights' && segs[0].dayRange === 'Days 1–3', [segs[0].label, segs[0].dayRange])
  check('block 2 absorbs the departure day (Days 4-8)', segs[1].dayRange === 'Days 4–8', segs[1].dayRange)
  check('no day is lost', segs.reduce((n, s) => n + (s.dayTo - s.dayFrom + 1), 0) === seq.length)
  check('cruise stay picked up', segs[1].stay === 'M/S Royal Lily', segs[1].stay)
  check('flight note routed to block 2', segs[1].notes.length === 1, segs[1].notes)
  check('block 1 destination from hotel row', segs[0].destination === 'Cairo & Giza', segs[0].destination)
}

// ---------------------------------------------------------------- Scenario 2
// Meal summarisation edge cases.
console.log('\n2) Meal summarisation')
{
  const fb = [day('1', 'a', [], 'X', M(1, 1, 1)), day('2', 'b', [], 'X', M(1, 1, 1)), day('3', 'c', [], 'X', M(1, 1, 1))]
  const hb = [day('1', 'a', [], 'X', M(1, 0, 1)), day('2', 'b', [], 'X', M(1, 0, 1))]
  const mix = [day('1', 'a', [], 'X', M(1, 0, 1)), day('2', 'b', [], 'X', M(1, 0, 0)), day('3', 'c', [], 'X', M(1, 0, 0))]
  const none = [day('1', 'a', [], 'X', M(0, 0, 0)), day('2', 'b', [], 'X', M(0, 0, 0))]
  const s = (seq) => deriveSegments(seq, [{ nights: seq.length, destination: 'X' }])[0].meals
  console.log('  full:', JSON.stringify(s(fb)), ' half:', JSON.stringify(s(hb)), ' mixed:', JSON.stringify(s(mix)), ' none:', JSON.stringify(s(none)))
  check('full board', s(fb) === 'Full board', s(fb))
  check('half board', s(hb) === 'Half board', s(hb))
  check('mixed enumerates', s(mix) === 'Breakfast daily · 1 dinner', s(mix))
  check('no meals -> empty', s(none) === '', s(none))
}

// ---------------------------------------------------------------- Scenario 3
// No accommodation rows at all (the 23 imported tours, priceTableOn:false).
console.log('\n3) No hotel rows -> group by per-day hotel')
{
  const seq = [
    day('a', 'Arrival', [], 'Marriott'),
    day('d1', 'Giza', ['Pyramids'], 'Marriott'),
    day('d2', 'Alex', ['Qaitbay'], 'Hilton Alex'),
    day('z', 'Departure', [], 'Hilton Alex'),
  ]
  const segs = deriveSegments(seq, [])
  console.log(JSON.stringify(segs.map(s => ({ l: s.label, r: s.dayRange, d: s.destination })), null, 1))
  check('2 blocks by hotel name', segs.length === 2, segs.length)
  check('nights = run length, minus 1 for the run holding the last day', segs[0].nights === 2 && segs[1].nights === 1, [segs[0].nights, segs[1].nights])
  check('destination falls back to hotel', segs[0].destination === 'Marriott', segs[0].destination)
  check('covers all days', segs.reduce((n, s) => n + (s.dayTo - s.dayFrom + 1), 0) === 4)
}

// ---------------------------------------------------------------- Scenario 4
// Nothing to go on at all: no hotel rows, no per-day hotels.
console.log('\n4) No hotels anywhere -> one block per day, still renderable')
{
  const seq = [day('a', 'Arrival', []), day('d1', 'Giza', ['Pyramids']), day('z', 'Departure', [])]
  const segs = deriveSegments(seq, [])
  check('3 blocks', segs.length === 3, segs.length)
  // Day 1 is still followed by a night even when we know nothing about the hotel;
  // only the final day of the trip contributes none. So '1 Night' then '1 Day'.
  check('first block counts its night', segs[0].label === '1 Night', segs[0].label)
  check('final block has no night', segs[2].label === '1 Day' && segs[2].nights === 0, segs[2].label)
  check('2 nights across a 3-day trip', segs.reduce((n, x) => n + x.nights, 0) === 2, segs.map(x => x.nights))
  check('destination falls back to title', segs[1].destination === 'Giza', segs[1].destination)
  check('single-day range reads "Day N"', segs[1].dayRange === 'Day 2', segs[1].dayRange)
}

// ---------------------------------------------------------------- Scenario 5
// Hotel rows claiming more nights than there are days (bad data).
console.log('\n5) Over-claiming hotel rows must not lose or duplicate days')
{
  const seq = [day('a', 'A', []), day('b', 'B', []), day('c', 'C', [])]
  const hotels = [{ nights: 5, destination: 'Cairo' }, { nights: 4, destination: 'Luxor' }, { nights: 2, destination: 'Aswan' }]
  const segs = deriveSegments(seq, hotels)
  console.log(JSON.stringify(segs.map(s => ({ d: s.destination, r: s.dayRange })), null, 1))
  const covered = []
  segs.forEach(s => { for (let i = s.dayFrom; i <= s.dayTo; i++) covered.push(i) })
  check('every day covered exactly once', JSON.stringify(covered.sort()) === '[0,1,2]', covered)
  check('no empty trailing blocks', segs.every(s => s.dayTo >= s.dayFrom))
}

// ---------------------------------------------------------------- Scenario 6
console.log('\n6) Highlight dedupe + cap')
{
  const seq = [
    day('1', 'a', ['Pyramids', 'Sphinx', 'pyramids', 'Museum'], 'X'),
    day('2', 'b', ['Sphinx', 'Citadel', 'Moez', 'Coptic', 'Bazaar', 'Nile', 'Memphis'], 'X'),
  ]
  const segs = deriveSegments(seq, [{ nights: 2, destination: 'Cairo' }], { highlightCap: 5 })
  console.log('  ', JSON.stringify(segs[0].highlights))
  check('case-insensitive dedupe', !segs[0].highlights.some((h, i, a) => a.findIndex(x => x.toLowerCase() === h.toLowerCase()) !== i))
  check('capped to 5 + tail', segs[0].highlights.length === 6 && /^\+\d+ more$/.test(segs[0].highlights[5]), segs[0].highlights)
}

// ---------------------------------------------------------------- Scenario 7
console.log('\n7) Overrides + empty input')
{
  const seq = [day('1', 'a', ['Pyramids'], 'X'), day('2', 'b', ['Sphinx'], 'X')]
  const auto = deriveSegments(seq, [{ nights: 2, destination: 'Cairo' }])
  const merged = applyOverrides(auto, [{ destination: 'Cairo & Giza', hidden: true }])
  check('override applied', merged[0].destination === 'Cairo & Giza', merged[0].destination)
  check('untouched fields survive', merged[0].stay === 'X', merged[0].stay)
  check('hidden flag set', merged[0].hidden === true)
  check('empty override array is a no-op', applyOverrides(auto, [])[0].destination === 'Cairo')
  check('empty sequence -> empty result', deriveSegments([], [{ nights: 3, destination: 'Cairo' }]).length === 0)
}

// ---------------------------------------------------------------- Scenario 8
// THE RETURN-TO-CITY CASE. Real trip: 4 nights Cairo, 3 cruise, 3 Hurghada, then
// 1 more night back in Cairo. The agent enters accommodation aggregated BY
// DESTINATION -> "5 nights Cairo" -- so a naive walk of the rows glues the closing
// Cairo night onto the opening stay and swallows the cruise days.
console.log('\n8) Trip returns to a city; rows are aggregated by destination')
{
  const H_CAI = 'Hyatt Regency West Cairo or equal'
  const H_CRU = 'Sonesta Moon Goddess or equal'
  const H_HRG = 'Sunrise Holidays Resort or equal'
  const seq = [
    day('d1', 'Arrival Cairo', ['Meet & assist'], H_CAI, M(0, 0, 1)),
    day('d2', 'Pyramids', ['Pyramids', 'Grand Egyptian Museum'], H_CAI),
    day('d3', 'Concert', ['Shakira Concert'], H_CAI),
    day('d4', 'Old Cairo', ['Coptic Cairo'], H_CAI),
    day('d5', 'Fly Aswan', ['High Dam', 'Philae'], H_CRU, M(1, 1, 1)),
    day('d6', 'Kom Ombo', ['Kom Ombo', 'Edfu'], H_CRU, M(1, 1, 1)),
    day('d7', 'Luxor', ['Karnak', 'Valley of Kings'], H_CRU, M(1, 1, 1)),
    day('d8', 'Fly Hurghada', ['Red Sea'], H_HRG),
    day('d9', 'Leisure', ['Snorkelling'], H_HRG),
    day('d10', 'Leisure', [], H_HRG),
    day('d11', 'Fly Cairo', ['Khan el-Khalili'], H_CAI),
    day('d12', 'Departure', [], '', M(1, 0, 0)),
  ]
  const rows = [
    { nights: 5, destination: 'Cairo/Giza' },   // 4 at the start + 1 at the end
    { nights: 3, destination: 'Nile Cruise' },
    { nights: 3, destination: 'Hurghada' },
  ]
  const segs = deriveSegments(seq, rows)
  console.log(JSON.stringify(segs.map(s => ({ l: s.label, r: s.dayRange, d: s.destination })), null, 1))
  check('splits into 4 blocks, not 3', segs.length === 4, segs.length)
  check('opening Cairo = 4 nights, days 1-4', segs[0].nights === 4 && segs[0].dayRange === 'Days 1–4', [segs[0].nights, segs[0].dayRange])
  check('cruise = 3 nights, days 5-7', segs[1].nights === 3 && segs[1].dayRange === 'Days 5–7', [segs[1].nights, segs[1].dayRange])
  check('hurghada = 3 nights, days 8-10', segs[2].nights === 3 && segs[2].dayRange === 'Days 8–10', [segs[2].nights, segs[2].dayRange])
  check('closing Cairo = 1 night, days 11-12', segs[3].nights === 1 && segs[3].dayRange === 'Days 11–12', [segs[3].nights, segs[3].dayRange])
  check('return visit reuses the Cairo label', segs[3].destination === 'Cairo/Giza', segs[3].destination)
  check('nights still total 11', segs.reduce((n, x) => n + x.nights, 0) === 11, segs.map(x => x.nights))
  check('cruise days did NOT leak into the Cairo block', !segs[0].highlights.some(h => /philae|kom ombo|karnak/i.test(h)), segs[0].highlights)
  check('every day covered exactly once', JSON.stringify(segs.flatMap(x => { const o = []; for (let i = x.dayFrom; i <= x.dayTo; i++) o.push(i); return o })) === JSON.stringify([...Array(12).keys()]))
}

// ---------------------------------------------------------------- Scenario 9
// Sparse hotel data: the agent named the hotel only on the first day of each stay.
console.log('\n9) Hotel named only on the first day of each stay')
{
  const seq = [
    day('d1', 'Arrival', [], 'Marriott Cairo'),
    day('d2', 'Giza', ['Pyramids'], ''),
    day('d3', 'Cairo', ['Citadel'], ''),
    day('d4', 'Fly Luxor', ['Karnak'], 'Sofitel Luxor'),
    day('d5', 'West Bank', ['Valley of Kings'], ''),
    day('d6', 'Departure', [], ''),
  ]
  const rows = [{ nights: 3, destination: 'Cairo' }, { nights: 2, destination: 'Luxor' }]
  const segs = deriveSegments(seq, rows)
  console.log(JSON.stringify(segs.map(s => ({ l: s.label, r: s.dayRange, d: s.destination })), null, 1))
  check('blank days continue the stay, not start a new one', segs.length === 2, segs.length)
  check('Cairo = 3 nights days 1-3', segs[0].nights === 3 && segs[0].dayRange === 'Days 1–3', [segs[0].nights, segs[0].dayRange])
  check('Luxor = 2 nights days 4-6', segs[1].nights === 2 && segs[1].dayRange === 'Days 4–6', [segs[1].nights, segs[1].dayRange])
  check('nights total matches rows', segs.reduce((n, x) => n + x.nights, 0) === 5)
}

// --------------------------------------------------------------- Scenario 10
// Rows already chronological (4/3/3/1) and days name only 3 distinct hotels ->
// the rows are the finer-grained source, so trust them.
console.log('\n10) Chronological rows are finer-grained than the day hotels')
{
  const H = ['Cairo H', 'Cruise', 'Resort', 'Cairo H']
  const seq = []
  for (let i = 0; i < 12; i++) seq.push(day('d' + i, 'Day ' + i, [], H[Math.min(3, Math.floor(i / 3))]))
  const rows = [
    { nights: 4, destination: 'Cairo' }, { nights: 3, destination: 'Cruise' },
    { nights: 3, destination: 'Hurghada' }, { nights: 1, destination: 'Cairo' },
  ]
  const segs = deriveSegments(seq, rows)
  check('falls back to walking the rows', segs.length === 4, segs.length)
  check('nights come straight from the rows', JSON.stringify(segs.map(x => x.nights)) === '[4,3,3,1]', segs.map(x => x.nights))
}

console.log('\n' + (fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'))
process.exit(fails === 0 ? 0 : 1)
