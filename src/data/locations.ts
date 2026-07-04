export type LocationId =
  | 'home'
  | 'cafe'
  | 'restaurant'
  | 'library'
  | 'park'
  | 'townSquare'
  | 'school'
  | 'clinic'
  | 'studio'
  | 'dock'
  | 'workshop'
  | 'grocery'
  | 'bakery'
  | 'inn'
  | 'farm'
  | 'postOffice';

export interface Vector2 {
  x: number;
  y: number;
}

export interface TownLocation {
  id: LocationId;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  borderColor: number;
  textColor: string;
}

export const WORLD_SIZE = {
  width: 3120,
  height: 2040,
};

export const LOCATIONS: TownLocation[] = [
  {
    id: 'home',
    name: 'Home',
    x: 220,
    y: 130,
    width: 360,
    height: 250,
    color: 0xddeee2,
    borderColor: 0x5e8c6a,
    textColor: '#214832',
  },
  {
    id: 'cafe',
    name: 'Cafe',
    x: 760,
    y: 130,
    width: 360,
    height: 250,
    color: 0xffe2bd,
    borderColor: 0xb96e22,
    textColor: '#63350a',
  },
  {
    id: 'clinic',
    name: 'Clinic',
    x: 1300,
    y: 130,
    width: 360,
    height: 250,
    color: 0xe8f7f4,
    borderColor: 0x4d9a8f,
    textColor: '#1c5a55',
  },
  {
    id: 'library',
    name: 'Library',
    x: 1840,
    y: 130,
    width: 390,
    height: 270,
    color: 0xdfe8ff,
    borderColor: 0x5573bd,
    textColor: '#243d7a',
  },
  {
    id: 'school',
    name: 'School',
    x: 2430,
    y: 150,
    width: 410,
    height: 280,
    color: 0xe9edd2,
    borderColor: 0x73823c,
    textColor: '#3f4a1d',
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    x: 180,
    y: 620,
    width: 390,
    height: 270,
    color: 0xffe0c4,
    borderColor: 0x9a5c2e,
    textColor: '#5b3215',
  },
  {
    id: 'studio',
    name: 'Studio',
    x: 200,
    y: 1010,
    width: 360,
    height: 250,
    color: 0xf1e6ff,
    borderColor: 0x855bb4,
    textColor: '#4e2c70',
  },
  {
    id: 'workshop',
    name: 'Workshop',
    x: 220,
    y: 1380,
    width: 360,
    height: 250,
    color: 0xe8dccf,
    borderColor: 0x8c5a35,
    textColor: '#54321c',
  },
  {
    id: 'grocery',
    name: 'Grocery',
    x: 2470,
    y: 620,
    width: 370,
    height: 260,
    color: 0xe6f4d6,
    borderColor: 0x6a8f31,
    textColor: '#365415',
  },
  {
    id: 'bakery',
    name: 'Bakery',
    x: 2470,
    y: 980,
    width: 370,
    height: 250,
    color: 0xffead2,
    borderColor: 0xb46a2c,
    textColor: '#6b3514',
  },
  {
    id: 'farm',
    name: 'Farm',
    x: 2360,
    y: 1320,
    width: 610,
    height: 340,
    color: 0xe9d099,
    borderColor: 0x8f6a35,
    textColor: '#4d3516',
  },
  {
    id: 'inn',
    name: 'Inn',
    x: 750,
    y: 1460,
    width: 380,
    height: 260,
    color: 0xe7dcff,
    borderColor: 0x6d55a7,
    textColor: '#413066',
  },
  {
    id: 'postOffice',
    name: 'Post Office',
    x: 1960,
    y: 1460,
    width: 370,
    height: 250,
    color: 0xffefc8,
    borderColor: 0xbc7a28,
    textColor: '#68410e',
  },
  {
    id: 'park',
    name: 'Forest Park',
    x: 880,
    y: 560,
    width: 1360,
    height: 720,
    color: 0xd5f0cb,
    borderColor: 0x4d9340,
    textColor: '#275326',
  },
  {
    id: 'townSquare',
    name: 'Town Square',
    x: 1250,
    y: 1420,
    width: 620,
    height: 260,
    color: 0xe8e5dc,
    borderColor: 0x83796a,
    textColor: '#3f3a32',
  },
  {
    id: 'dock',
    name: 'Dock',
    x: 1390,
    y: 1760,
    width: 340,
    height: 280,
    color: 0xe4c08a,
    borderColor: 0x8c5d34,
    textColor: '#57391f',
  },
];

export const LOCATION_BY_ID = Object.fromEntries(
  LOCATIONS.map((location) => [location.id, location]),
) as Record<LocationId, TownLocation>;

export function getLocationCenter(locationId: LocationId): Vector2 {
  const location = LOCATION_BY_ID[locationId];
  return {
    x: location.x + location.width / 2,
    y: location.y + location.height / 2,
  };
}

export function findLocationAt(position: Vector2): TownLocation | undefined {
  return LOCATIONS.find(
    (location) =>
      position.x >= location.x &&
      position.x <= location.x + location.width &&
      position.y >= location.y &&
      position.y <= location.y + location.height,
  );
}

export function findLocationByText(text: string): TownLocation | undefined {
  const normalizedText = text.toLowerCase();
  return LOCATIONS.find((location) => {
    const normalizedName = location.name.toLowerCase();
    return normalizedText.includes(normalizedName) || normalizedText.includes(location.id.toLowerCase());
  });
}
