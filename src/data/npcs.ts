import type { CharacterAppearance } from '../appearance/types';
import type { Agent, AgentMobility, ScheduleEntry } from '../agents/types';
import type { LocationId } from './locations';
import { LOCATION_BY_ID } from './locations';
import type { TradeProfile, VendorType } from '../trade/types';
import { BUILDING_ACTIVITY_POINTS, cellToWorld, COUNTER_ANCHORS, isWalkableCell, nearestWalkableCell, worldToCell } from './townGrid';

type ScheduleKey =
  | 'student'
  | 'reporter'
  | 'harborWorker'
  | 'cafeOwner'
  | 'chef'
  | 'doctor'
  | 'librarian'
  | 'teacher'
  | 'artist'
  | 'mechanic'
  | 'grocer'
  | 'baker'
  | 'innkeeper'
  | 'farmer'
  | 'postalClerk';

interface AgentSeed {
  id: string;
  name: string;
  role: string;
  personality: string;
  scheduleKey: ScheduleKey;
  color: number;
  appearance: CharacterAppearance;
  mobility: AgentMobility;
  homeLocationId?: LocationId;
  tradeProfile?: TradeProfile;
}

const schedules: Record<ScheduleKey, ScheduleEntry[]> = {
  student: [
    { start: '08:00', locationId: 'school', action: 'attending class', goal: 'Join the morning class at School' },
    { start: '10:00', locationId: 'library', action: 'studying', goal: 'Review morning notes at the Library' },
    { start: '12:00', locationId: 'cafe', action: 'having lunch', goal: 'Eat lunch and recharge' },
    { start: '14:00', locationId: 'park', action: 'reading outside', goal: 'Take a quiet break in the Park' },
    { start: '16:00', locationId: 'grocery', action: 'buying snacks', goal: 'Pick up snacks before meeting classmates' },
    { start: '17:30', locationId: 'townSquare', action: 'meeting classmates', goal: 'Look for news around Town Square' },
  ],
  reporter: [
    { start: '08:00', locationId: 'townSquare', action: 'listening for leads', goal: 'Collect morning rumors' },
    { start: '09:30', locationId: 'postOffice', action: 'checking notices', goal: 'Look for public announcements' },
    { start: '11:00', locationId: 'cafe', action: 'interviewing patrons', goal: 'Find local story angles' },
    { start: '14:00', locationId: 'park', action: 'observing visitors', goal: 'Watch public reactions in the Park' },
    { start: '17:00', locationId: 'townSquare', action: 'filing notes', goal: 'Prepare the evening town brief' },
  ],
  harborWorker: [
    { start: '08:00', locationId: 'dock', action: 'checking the dock', goal: 'Inspect ropes and cargo near the Dock' },
    { start: '10:30', locationId: 'workshop', action: 'requesting repairs', goal: 'Ask the Workshop about tools' },
    { start: '12:00', locationId: 'restaurant', action: 'eating lunch', goal: 'Take a lunch break' },
    { start: '14:00', locationId: 'dock', action: 'watching the tide', goal: 'Prepare for afternoon arrivals' },
    { start: '18:00', locationId: 'townSquare', action: 'visiting the gathering', goal: 'Hear town news after work' },
  ],
  cafeOwner: [
    { start: '08:00', locationId: 'cafe', action: 'opening the cafe', goal: 'Prepare coffee and pastries' },
    { start: '11:00', locationId: 'cafe', action: 'serving customers', goal: 'Keep the Cafe running smoothly' },
    { start: '14:30', locationId: 'cafe', action: 'checking supplies', goal: 'Restock cups and beans' },
    { start: '18:00', locationId: 'cafe', action: 'watching evening demand', goal: 'Prepare for evening visitors' },
  ],
  chef: [
    { start: '08:00', locationId: 'restaurant', action: 'prepping ingredients', goal: 'Prepare the Restaurant kitchen' },
    { start: '11:00', locationId: 'restaurant', action: 'cooking lunch', goal: 'Serve the lunch crowd' },
    { start: '15:00', locationId: 'restaurant', action: 'planning dinner', goal: 'Plan dinner specials' },
    { start: '18:00', locationId: 'restaurant', action: 'serving dinner', goal: 'Feed the evening visitors' },
  ],
  doctor: [
    { start: '08:00', locationId: 'clinic', action: 'reviewing charts', goal: 'Prepare for clinic visits' },
    { start: '10:00', locationId: 'clinic', action: 'seeing patients', goal: 'Treat townspeople at Clinic' },
    { start: '14:00', locationId: 'clinic', action: 'checking supplies', goal: 'Restock medicine and bandages' },
    { start: '17:00', locationId: 'clinic', action: 'writing notes', goal: 'Summarize patient records' },
  ],
  librarian: [
    { start: '08:00', locationId: 'library', action: 'opening reading room', goal: 'Prepare Library desks' },
    { start: '10:00', locationId: 'library', action: 'cataloging books', goal: 'Maintain the Library shelves' },
    { start: '13:00', locationId: 'library', action: 'helping readers', goal: 'Guide visitors to useful books' },
    { start: '17:00', locationId: 'library', action: 'organizing returns', goal: 'Close the Library neatly' },
  ],
  teacher: [
    { start: '08:00', locationId: 'school', action: 'teaching morning class', goal: 'Lead lessons at School' },
    { start: '11:00', locationId: 'school', action: 'grading work', goal: 'Review student exercises' },
    { start: '14:00', locationId: 'school', action: 'preparing lessons', goal: 'Plan tomorrow lessons' },
    { start: '16:30', locationId: 'school', action: 'answering questions', goal: 'Help students after class' },
  ],
  artist: [
    { start: '08:00', locationId: 'studio', action: 'mixing paint', goal: 'Prepare Studio materials' },
    { start: '10:00', locationId: 'studio', action: 'sketching portraits', goal: 'Create town portraits' },
    { start: '14:00', locationId: 'studio', action: 'arranging canvases', goal: 'Organize the Studio' },
    { start: '17:00', locationId: 'studio', action: 'reviewing commissions', goal: 'Plan art requests' },
  ],
  mechanic: [
    { start: '08:00', locationId: 'workshop', action: 'checking tools', goal: 'Open the Workshop' },
    { start: '11:00', locationId: 'workshop', action: 'repairing equipment', goal: 'Handle town repairs' },
    { start: '15:00', locationId: 'workshop', action: 'sorting parts', goal: 'Prepare parts for tomorrow' },
    { start: '18:00', locationId: 'workshop', action: 'closing benches', goal: 'Close the Workshop safely' },
  ],
  grocer: [
    { start: '08:00', locationId: 'grocery', action: 'stocking produce', goal: 'Fill grocery shelves' },
    { start: '11:00', locationId: 'grocery', action: 'serving shoppers', goal: 'Help customers find food' },
    { start: '14:00', locationId: 'grocery', action: 'checking inventory', goal: 'Track fresh supplies' },
    { start: '17:00', locationId: 'grocery', action: 'preparing orders', goal: 'Prepare evening orders' },
  ],
  baker: [
    { start: '08:00', locationId: 'bakery', action: 'baking bread', goal: 'Prepare fresh bread' },
    { start: '11:00', locationId: 'bakery', action: 'selling pastries', goal: 'Serve Bakery customers' },
    { start: '14:00', locationId: 'bakery', action: 'decorating cakes', goal: 'Finish special orders' },
    { start: '17:30', locationId: 'bakery', action: 'packing leftovers', goal: 'Prepare evening snacks' },
  ],
  innkeeper: [
    { start: '08:00', locationId: 'inn', action: 'checking rooms', goal: 'Prepare rooms at the Inn' },
    { start: '11:00', locationId: 'inn', action: 'welcoming guests', goal: 'Help visitors settle in' },
    { start: '15:00', locationId: 'inn', action: 'cleaning common room', goal: 'Keep the Inn comfortable' },
    { start: '18:00', locationId: 'inn', action: 'arranging keys', goal: 'Prepare evening check-ins' },
  ],
  farmer: [
    { start: '08:00', locationId: 'farm', action: 'checking crops', goal: 'Inspect the morning farm rows' },
    { start: '11:00', locationId: 'farm', action: 'watering vegetables', goal: 'Keep crops healthy' },
    { start: '14:00', locationId: 'farm', action: 'sorting produce', goal: 'Prepare produce crates' },
    { start: '17:00', locationId: 'farm', action: 'closing the farm gate', goal: 'Secure the Farm for evening' },
  ],
  postalClerk: [
    { start: '08:00', locationId: 'postOffice', action: 'sorting letters', goal: 'Prepare morning mail' },
    { start: '11:00', locationId: 'postOffice', action: 'serving residents', goal: 'Handle post office requests' },
    { start: '14:00', locationId: 'postOffice', action: 'posting notices', goal: 'Update public announcements' },
    { start: '17:00', locationId: 'postOffice', action: 'closing mailbags', goal: 'Prepare outgoing mail' },
  ],
};

function appearance(presetId: string, label: string, frame: number, tint?: number): CharacterAppearance {
  return { presetId, label, frame, tint };
}

function trade(locationId: LocationId, vendorType: VendorType, displayName: string, category: TradeProfile['offers'][number]['category']): TradeProfile {
  return {
    enabled: true,
    vendorType,
    displayName,
    locationId,
    offers: [
      {
        id: `${vendorType}-placeholder`,
        name: `${displayName} placeholder`,
        description: 'Trade interface reserved for a later economy pass.',
        price: 0,
        category,
      },
    ],
  };
}

const agentSeeds: AgentSeed[] = [
  {
    id: 'maya',
    name: 'Maya',
    role: 'Student',
    personality: 'curious, diligent, easily excited by community events',
    scheduleKey: 'student',
    color: 0x3c75d4,
    appearance: appearance('student-green', 'Green student', 54),
    mobility: 'roaming',
  },
  {
    id: 'nora',
    name: 'Nora',
    role: 'Reporter',
    personality: 'social, alert, drawn to rumors and public events',
    scheduleKey: 'reporter',
    color: 0xc7354f,
    appearance: appearance('reporter-red', 'Reporter red', 109),
    mobility: 'roaming',
  },
  {
    id: 'sami',
    name: 'Sami',
    role: 'Harbor Worker',
    personality: 'cheerful, practical, interested in visitors and coastal news',
    scheduleKey: 'harborWorker',
    color: 0x1f9b8f,
    appearance: appearance('dock-worker', 'Dock worker', 163),
    mobility: 'roaming',
    tradeProfile: trade('dock', 'dock', 'Dock help', 'service'),
  },
  {
    id: 'otto',
    name: 'Otto',
    role: 'Cafe Owner',
    personality: 'warm, practical, attentive to crowds and food',
    scheduleKey: 'cafeOwner',
    color: 0xc46f1f,
    appearance: appearance('cafe-owner', 'Cafe owner', 55),
    mobility: 'buildingBound',
    homeLocationId: 'cafe',
    tradeProfile: trade('cafe', 'cafe', 'Cafe counter', 'food'),
  },
  {
    id: 'gita',
    name: 'Gita',
    role: 'Chef',
    personality: 'focused, proud of good meals, direct but kind',
    scheduleKey: 'chef',
    color: 0xb45309,
    appearance: appearance('chef', 'Chef', 1, 0xfff7ed),
    mobility: 'buildingBound',
    homeLocationId: 'restaurant',
    tradeProfile: trade('restaurant', 'restaurant', 'Restaurant kitchen', 'food'),
  },
  {
    id: 'lin',
    name: 'Dr. Lin',
    role: 'Doctor',
    personality: 'analytical, calm, attentive to health and town routines',
    scheduleKey: 'doctor',
    color: 0x7752b8,
    appearance: appearance('doctor', 'Doctor', 108, 0xecfeff),
    mobility: 'buildingBound',
    homeLocationId: 'clinic',
    tradeProfile: trade('clinic', 'clinic', 'Clinic service', 'service'),
  },
  {
    id: 'elena',
    name: 'Elena',
    role: 'Librarian',
    personality: 'quiet, observant, protective of community knowledge',
    scheduleKey: 'librarian',
    color: 0x5573bd,
    appearance: appearance('librarian', 'Librarian', 271, 0xeef2ff),
    mobility: 'buildingBound',
    homeLocationId: 'library',
    tradeProfile: trade('library', 'library', 'Library desk', 'information'),
  },
  {
    id: 'mrpark',
    name: 'Mr. Park',
    role: 'Teacher',
    personality: 'patient, structured, likes helping students reason clearly',
    scheduleKey: 'teacher',
    color: 0x73823c,
    appearance: appearance('teacher', 'Teacher', 324, 0xfef9c3),
    mobility: 'buildingBound',
    homeLocationId: 'school',
    tradeProfile: trade('school', 'school', 'School guidance', 'information'),
  },
  {
    id: 'iris',
    name: 'Iris',
    role: 'Artist',
    personality: 'expressive, sensitive to mood, notices small visual details',
    scheduleKey: 'artist',
    color: 0x855bb4,
    appearance: appearance('artist', 'Artist', 325, 0xf5d0fe),
    mobility: 'buildingBound',
    homeLocationId: 'studio',
    tradeProfile: trade('studio', 'studio', 'Studio commission desk', 'service'),
  },
  {
    id: 'hank',
    name: 'Hank',
    role: 'Mechanic',
    personality: 'blunt, dependable, thinks in tools and repairs',
    scheduleKey: 'mechanic',
    color: 0x8c5a35,
    appearance: appearance('mechanic', 'Mechanic', 378, 0xe5e7eb),
    mobility: 'counterBound',
    homeLocationId: 'workshop',
    tradeProfile: trade('workshop', 'workshop', 'Workshop counter', 'item'),
  },
  {
    id: 'bea',
    name: 'Bea',
    role: 'Grocer',
    personality: 'organized, neighborly, remembers what people need',
    scheduleKey: 'grocer',
    color: 0x6a8f31,
    appearance: appearance('grocer', 'Grocer', 379, 0xdcfce7),
    mobility: 'counterBound',
    homeLocationId: 'grocery',
    tradeProfile: trade('grocery', 'grocery', 'Grocery counter', 'food'),
  },
  {
    id: 'poppy',
    name: 'Poppy',
    role: 'Baker',
    personality: 'cheerful, energetic, proud of fresh pastries',
    scheduleKey: 'baker',
    color: 0xb46a2c,
    appearance: appearance('baker', 'Baker', 432, 0xffedd5),
    mobility: 'counterBound',
    homeLocationId: 'bakery',
    tradeProfile: trade('bakery', 'bakery', 'Bakery counter', 'food'),
  },
  {
    id: 'lena',
    name: 'Lena',
    role: 'Innkeeper',
    personality: 'welcoming, discreet, good at reading tired travelers',
    scheduleKey: 'innkeeper',
    color: 0x6d55a7,
    appearance: appearance('innkeeper', 'Innkeeper', 433, 0xe0e7ff),
    mobility: 'buildingBound',
    homeLocationId: 'inn',
    tradeProfile: trade('inn', 'inn', 'Inn front desk', 'service'),
  },
  {
    id: 'marin',
    name: 'Marin',
    role: 'Farmer',
    personality: 'patient, practical, protective of crops and honest neighbors',
    scheduleKey: 'farmer',
    color: 0x83735f,
    appearance: appearance('farmer', 'Farmer', 486, 0xdcfce7),
    mobility: 'buildingBound',
    homeLocationId: 'farm',
    tradeProfile: trade('farm', 'farm', 'Farm stand placeholder', 'food'),
  },
  {
    id: 'jun',
    name: 'Jun',
    role: 'Postal Clerk',
    personality: 'efficient, curious about announcements, avoids gossiping too much',
    scheduleKey: 'postalClerk',
    color: 0xbc7a28,
    appearance: appearance('postal-clerk', 'Postal clerk', 487, 0xfef3c7),
    mobility: 'counterBound',
    homeLocationId: 'postOffice',
    tradeProfile: trade('postOffice', 'postOffice', 'Post Office counter', 'service'),
  },
];

function startPositionFor(seed: AgentSeed): { x: number; y: number } {
  const start = schedules[seed.scheduleKey][0];
  const counterAnchor = seed.homeLocationId ? COUNTER_ANCHORS[seed.homeLocationId] : undefined;
  const activityPoints = seed.homeLocationId ? BUILDING_ACTIVITY_POINTS[seed.homeLocationId] : undefined;
  const startCell =
    seed.mobility === 'counterBound' && counterAnchor
      ? counterAnchor
      : seed.mobility === 'buildingBound' && activityPoints?.length
        ? activityPoints[0]
        : BUILDING_ACTIVITY_POINTS[start.locationId]?.[0];
  return cellToWorld(nearestWalkableCell(startCell ?? BUILDING_ACTIVITY_POINTS.townSquare[0]));
}

function makeAgent(seed: AgentSeed): Agent {
  const start = schedules[seed.scheduleKey][0];
  const position = startPositionFor(seed);
  const startLocationName = LOCATION_BY_ID[start.locationId].name;
  const counterCell = seed.homeLocationId ? COUNTER_ANCHORS[seed.homeLocationId] : undefined;
  const counterAnchor = counterCell ? cellToWorld(nearestWalkableCell(counterCell)) : undefined;

  return {
    id: seed.id,
    name: seed.name,
    role: seed.role,
    personality: seed.personality,
    mobility: seed.mobility,
    homeLocationId: seed.homeLocationId,
    counterAnchor,
    appearance: seed.appearance,
    tradeProfile: seed.tradeProfile,
    position,
    destination: start.locationId,
    currentAction: start.action,
    currentGoal: start.goal,
    plannedAction: start.action,
    reason: `It is 08:00, so I am going to ${startLocationName} for ${start.action}.`,
    lastObservation: `It is 08:00 and I am near ${startLocationName}.`,
    lastPlan: `I should be ${start.action} because my schedule says ${startLocationName} at 08:00.`,
    lastAction: `${start.action}.`,
    lastMemory: 'No memory recorded yet.',
    nextPlan: 'Next decision in a few seconds.',
    mood: 'focused',
    needs: {
      energy: 82,
      social: 62,
      hunger: 76,
    },
    schedule: schedules[seed.scheduleKey],
    dailyPlan: [],
    currentTaskDecomposition: [],
    memories: [],
    retrievedMemories: [],
    reflection: 'No reflection yet.',
    relationships: {},
    currentPath: [],
    pathIndex: 0,
    pathStatus: seed.mobility === 'counterBound' ? 'Fixed at counter.' : 'No path calculated yet.',
    lastLLMDecision: 'No LLM decision yet.',
    facing: 'down',
    isMoving: false,
    animationState: 'idle-down',
    conversationCooldown: 3 + Math.random() * 4,
    color: seed.color,
    speed: seed.mobility === 'roaming' ? 72 + Math.random() * 18 : 58 + Math.random() * 10,
    nextDecisionIn: 1 + Math.random() * 2,
    interestedEventIds: [],
  };
}

function spreadOverlappingAgents(agents: Agent[]): Agent[] {
  const usedCells = new Set<string>();
  const candidateOffsets = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
    { x: 2, y: 0 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
    { x: 0, y: -2 },
  ];

  for (const agent of agents) {
    let cell = nearestWalkableCell(worldToCell(agent.position));

    if (agent.mobility !== 'counterBound') {
      const openCell = candidateOffsets
        .map((offset) => ({ x: cell.x + offset.x, y: cell.y + offset.y }))
        .find((candidate) => isWalkableCell(candidate.x, candidate.y) && !usedCells.has(`${candidate.x},${candidate.y}`));

      if (openCell) {
        cell = openCell;
      }
    }

    usedCells.add(`${cell.x},${cell.y}`);
    agent.position = cellToWorld(cell);
  }

  return agents;
}

export function createInitialAgents(): Agent[] {
  return spreadOverlappingAgents(agentSeeds.map(makeAgent));
}
