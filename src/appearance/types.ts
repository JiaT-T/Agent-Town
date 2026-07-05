export interface AppearancePreset {
  id: string;
  label: string;
  frame: number;
  tint?: number;
}

export interface CharacterAppearance {
  presetId: string;
  label: string;
  frame: number;
  tint?: number;
  skinTone?: string;
  hairStyle?: string;
  outfitColor?: string;
}

export type PlayerAppearance = CharacterAppearance;

export const PLAYER_APPEARANCE_PRESETS: AppearancePreset[] = [
  { id: 'traveler-blue', label: 'Blue traveler', frame: 0 },
  { id: 'field-green', label: 'Field green', frame: 54 },
  { id: 'city-red', label: 'City red', frame: 109 },
  { id: 'scholar-purple', label: 'Scholar purple', frame: 108 },
  { id: 'coastal-teal', label: 'Coastal teal', frame: 162 },
];

const PRESET_INDEX: Record<string, number> = {
  'traveler-blue': 0,
  'field-green': 1,
  'city-red': 2,
  'scholar-purple': 3,
  'coastal-teal': 4,
};

const HAIR_STYLE_FRAMES: Record<string, number[]> = {
  short: [0, 1, 54, 55, 108],
  long: [109, 162, 163, 270, 271],
  cap: [324, 325, 378, 379, 432],
  formal: [433, 486, 487, 540, 541],
};

const SKIN_TONE_TINTS: Record<string, number> = {
  light: 0xfff4dc,
  tan: 0xffdfb3,
  deep: 0xe8b487,
};

export function makeAppearance(
  presetId: string,
  overrides: Partial<Omit<CharacterAppearance, 'presetId' | 'label' | 'frame'>> = {},
): CharacterAppearance {
  const preset = PLAYER_APPEARANCE_PRESETS.find((candidate) => candidate.id === presetId) ?? PLAYER_APPEARANCE_PRESETS[0];
  return {
    presetId: preset.id,
    label: preset.label,
    frame: preset.frame,
    tint: preset.tint,
    ...overrides,
  };
}

export function resolveAppearanceFrame(appearance: CharacterAppearance): number {
  const presetIndex = PRESET_INDEX[appearance.presetId] ?? 0;
  const frames = appearance.hairStyle ? HAIR_STYLE_FRAMES[appearance.hairStyle] : undefined;
  return frames?.[presetIndex] ?? appearance.frame;
}

export function resolveAppearanceTint(appearance: CharacterAppearance): number | undefined {
  if (appearance.tint && appearance.tint !== 0xffffff) {
    return appearance.tint;
  }
  return appearance.skinTone ? SKIN_TONE_TINTS[appearance.skinTone] : undefined;
}
