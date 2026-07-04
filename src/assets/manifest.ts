export const assetManifest = {
  tiles: {
    roguelikeRpgSheet: 'kenney-roguelike-rpg-sheet',
    tinyTownSheet: 'kenney-tiny-town-sheet',
  },
  characters: {
    roguelikeSheet: 'kenney-roguelike-char-sheet',
    frames: {
      player: 0,
      student: 54,
      cafeOwner: 55,
      researcher: 108,
      journalist: 109,
      tourist: 162,
      visitor: 163,
      visibleFrames: [0, 1, 54, 55, 108, 109, 162, 163, 270, 271, 324, 325, 378, 379, 432, 433, 486, 487, 540, 541, 594, 595],
      presets: {
        travelerBlue: { id: 'traveler-blue', label: 'Blue traveler', frame: 0 },
        studentGreen: { id: 'student-green', label: 'Green student', frame: 54 },
        cafeOwner: { id: 'cafe-owner', label: 'Cafe owner', frame: 55 },
        scholarPurple: { id: 'scholar-purple', label: 'Scholar purple', frame: 108 },
        reporterRed: { id: 'reporter-red', label: 'Reporter red', frame: 109 },
        touristTeal: { id: 'tourist-teal', label: 'Tourist teal', frame: 162 },
        dockWorker: { id: 'dock-worker', label: 'Dock worker', frame: 163 },
        chef: { id: 'chef', label: 'Chef', frame: 1, tint: 0xfff7ed },
        doctor: { id: 'doctor', label: 'Doctor', frame: 108, tint: 0xecfeff },
        librarian: { id: 'librarian', label: 'Librarian', frame: 271, tint: 0xeef2ff },
        teacher: { id: 'teacher', label: 'Teacher', frame: 324, tint: 0xfef9c3 },
        grocer: { id: 'grocer', label: 'Grocer', frame: 379, tint: 0xdcfce7 },
        baker: { id: 'baker', label: 'Baker', frame: 432, tint: 0xffedd5 },
        artist: { id: 'artist', label: 'Artist', frame: 325, tint: 0xf5d0fe },
        mechanic: { id: 'mechanic', label: 'Mechanic', frame: 378, tint: 0xe5e7eb },
        farmer: { id: 'farmer', label: 'Farmer', frame: 486, tint: 0xdcfce7 },
        postalClerk: { id: 'postal-clerk', label: 'Postal clerk', frame: 487, tint: 0xfef3c7 },
        innkeeper: { id: 'innkeeper', label: 'Innkeeper', frame: 433, tint: 0xe0e7ff },
      },
    },
    student: 'characters/student',
    cafeOwner: 'characters/cafe-owner',
    researcher: 'characters/researcher',
    journalist: 'characters/journalist',
    tourist: 'characters/tourist',
    player: 'kenney-player',
    manBlue: 'kenney-man-blue',
    manBrown: 'kenney-man-brown',
    manOld: 'kenney-man-old',
    survivor: 'kenney-survivor',
    hitman: 'kenney-hitman',
  },
  furniture: {
    rpgSheet: 'kenney-roguelike-rpg-sheet',
    topDownTiles: 'kenney-top-down-tiles',
  },
  buildings: {
    home: 'buildings/home',
    cafe: 'buildings/cafe',
    restaurant: 'buildings/restaurant',
    library: 'buildings/library',
    park: 'buildings/park',
    townSquare: 'buildings/town-square',
    school: 'buildings/school',
    clinic: 'buildings/clinic',
    studio: 'buildings/studio',
    dock: 'buildings/dock',
    workshop: 'buildings/workshop',
    grocery: 'buildings/grocery',
    bakery: 'buildings/bakery',
    inn: 'buildings/inn',
    farm: 'buildings/farm',
    postOffice: 'buildings/post-office',
  },
  map: {
    town: 'maps/town',
    roads: 'maps/roads',
    tree: 'kenney-tree',
    crate: 'kenney-crate',
    boat: 'kenney-boat',
    shell: 'kenney-shell',
    flowers: 'kenney-flowers',
  },
  ui: {
    event: 'ui/event',
    memory: 'ui/memory',
    agent: 'ui/agent',
  },
  effects: {
    dust: 'effects/dust',
    wave: 'effects/wave',
  },
} as const;

export type AssetManifest = typeof assetManifest;

const visibleCharacterFrameSet = new Set<number>(assetManifest.characters.frames.visibleFrames);

export function resolveCharacterFrame(frame: number): number {
  return visibleCharacterFrameSet.has(frame) ? frame : assetManifest.characters.frames.player;
}
