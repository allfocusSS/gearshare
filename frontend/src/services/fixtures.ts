import type { Asset } from './types.ts'
import { addDays } from './dates.ts'

/** Original fictional inventory: each record is one physical unit, never a model quantity. */
export function catalogueFixtures(today: string): { assets: Asset[]; occupied: Map<string, Set<string>> } {
  const assets: Asset[] = [
    { id: 'camera-01', inventoryCode: 'CAM-001', name: 'Field Camera · Unit 01', category: 'Cameras', description: 'A fictional mirrorless camera kit for interviews, club films and everyday storytelling. Includes a standard lens and a padded case.', location: 'Media room · North desk', state: 'active' },
    { id: 'camera-02', inventoryCode: 'CAM-002', name: 'Field Camera · Unit 02', category: 'Cameras', description: 'A second independent physical unit of the field camera kit. Its calendar is separate from Unit 01.', location: 'Media room · North desk', state: 'active' },
    { id: 'camera-03', inventoryCode: 'CAM-003', name: 'Pocket Video Camera', category: 'Cameras', description: 'A compact fictional video camera for small productions. Temporarily undergoing a lens and battery inspection.', location: 'Media room · Care shelf', state: 'maintenance' },
    { id: 'audio-01', inventoryCode: 'AUD-001', name: 'Directional Microphone', category: 'Audio', description: 'A fictional directional microphone with a wind shield, cable and carry pouch for clear location sound.', location: 'Sound cabinet · Shelf A', state: 'active' },
    { id: 'audio-02', inventoryCode: 'AUD-002', name: 'Portable Sound Recorder', category: 'Audio', description: 'A handheld fictional recorder for interviews, atmosphere and live club sessions. Includes a protective case.', location: 'Sound cabinet · Shelf B', state: 'active' },
    { id: 'presentation-01', inventoryCode: 'PRE-001', name: 'Compact Projector', category: 'Presentation', description: 'A fictional portable projector for screenings and small-room presentations. Includes power and display cables.', location: 'Club office · Equipment desk', state: 'active' },
    { id: 'presentation-02', inventoryCode: 'PRE-002', name: 'Folding Projection Screen', category: 'Presentation', description: 'A fictional freestanding screen for presentations. Folds into one carry case; please allow space for setup.', location: 'Club office · Tall storage', state: 'active' },
    { id: 'accessory-01', inventoryCode: 'ACC-001', name: 'Travel Tripod', category: 'Accessories', description: 'A fictional lightweight tripod with a quick-release plate for stable interviews and static shots.', location: 'Media room · Stand rack', state: 'active' },
    { id: 'accessory-02', inventoryCode: 'ACC-002', name: 'Soft LED Light', category: 'Accessories', description: 'A fictional dimmable light panel with stand and soft diffuser for small sets and interviews.', location: 'Media room · Light shelf', state: 'active' },
    { id: 'accessory-03', inventoryCode: 'ACC-003', name: 'Capture Adapter Kit', category: 'Accessories', description: 'A fictional video capture adapter with labeled cables for club livestream and presentation setups.', location: 'Club office · Cable drawer', state: 'active' },
  ]
  // Anonymous schedule fixtures contain only physical asset IDs and occupied calendar days.
  const occupied = new Map<string, Set<string>>()
  for (const [assetId, from, through] of [['camera-01', 2, 4], ['camera-02', 1, 3], ['audio-01', 0, 1], ['audio-02', 7, 8], ['presentation-01', 10, 12], ['accessory-02', 5, 5]] as const) {
    occupied.set(assetId, new Set(Array.from({ length: through - from + 1 }, (_, offset) => addDays(today, from + offset))))
  }
  return { assets, occupied }
}
