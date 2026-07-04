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
