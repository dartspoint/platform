import roster from './darts-npc-roster.json';

export type NpcWritingStyle = {
  capitalization: 'lowercase' | 'sentence' | 'mixed';
  punctuation: 'minimal' | 'balanced' | 'expressive';
  emojiFrequency: 'never' | 'rare' | 'occasional';
  sentenceLength: 'short' | 'varied';
  fragments: boolean;
  casualExpressions: { nl: string[]; en: string[] };
  notes: string;
};

export type NpcProfile = {
  id: string; nickname: string; displayName: string; gender: 'man' | 'vrouw'; age: number;
  country: 'NL' | 'GB' | 'BE'; city: string; languages: string[]; bio: string;
  interests: string[]; personality: string[]; conversationStyle: string; writingStyle?: NpcWritingStyle;
  behaviorNotes: unknown; responseExamples: { nl: string[]; en: string[] };
  skill: 'beginner' | 'club' | 'gevorderd'; average: number; doubleAccuracy: number;
  practicePreference: number; sociability: number; preferredHours: { start: string; end: string };
  typicalSessionMinutes: number[]; signatureColor: string; avatarSeed: string; isAi: boolean;
};
export const npcProfiles = roster as NpcProfile[];
export function npcByName(name: string) { return npcProfiles.find(p => p.nickname === name || p.id === name); }
export const npcCountries: Record<string,string> = { NL: 'Nederland', BE: 'België', GB: 'Verenigd Koninkrijk' };

