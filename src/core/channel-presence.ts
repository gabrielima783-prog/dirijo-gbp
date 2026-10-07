import type { AnalysisInput, ChannelName, ChannelPresence } from '../shared/types.js';

export function confirmedAbsence(presence?: ChannelPresence): boolean {
  const confirmation = presence?.confirmation;
  return presence?.state === 'absent_confirmed' && Boolean(confirmation && typeof confirmation.method === 'string' && confirmation.method.trim() && typeof confirmation.reference === 'string' && confirmation.reference.trim() && typeof confirmation.observedAt === 'string' && !Number.isNaN(Date.parse(confirmation.observedAt)));
}

/** Presence is independent from collector execution. A blank URL never confirms absence. */
export function inputChannelPresence(input: AnalysisInput, channel: ChannelName): ChannelPresence {
  const url = channel === 'google' ? input.mapsUrl : channel === 'website' ? input.websiteUrl : input.instagramUrl;
  if (url?.trim()) return { state: 'present_unassessed' };
  const declared = input.channelPresence?.[channel];
  if (confirmedAbsence(declared)) return declared!;
  if (declared?.state === 'not_found' || declared?.state === 'restricted') return declared;
  return { state: 'not_provided' };
}
