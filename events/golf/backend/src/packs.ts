/**
 * The chart-submission packs (courses) open for submissions, and where their submissions go.
 *
 * Single source of truth for the backend half: submit-api.ts validates incoming packIds against it,
 * and submission-notifier.ts resolves the display name and Discord channel from it. Those two used
 * to keep their own copies - a VALID_PACK_IDS set in one file and separate PACK_CHANNEL_MAP /
 * PACK_NAMES objects in the other - which made adding a pack a three-place edit where missing one
 * place failed quietly: an id absent from the validator rejects every upload with a 400, and an id
 * absent from the channel map silently routes real submissions to the fallback channel under the
 * name "Unknown Pack".
 *
 * events/golf/frontend/src/pages/SubmitChartPage.tsx keeps its own list, because what it needs is
 * presentational (rules, curators, difficulty badges) and has no business being shipped to a Lambda.
 * The ids must match; they are the contract between the two.
 */
export interface SubmissionPack {
  /** Sent by the frontend as `packId`, and stored on the submission record. */
  id: string;
  /** Shown in the Discord notification. */
  name: string;
  /** Discord channel that receives this pack's submissions. */
  channelId: string;
}

export const SUBMISSION_PACKS: SubmissionPack[] = [
  { id: 'quint-bait', name: 'Quint Bait', channelId: '1500528587261083658' },
  { id: 'stamina-stamtech', name: 'Stamina / StamTech', channelId: '1500503650714521670' },
  { id: 'pride-demon', name: 'Pride Demon', channelId: '1500503116267655218' },
  { id: 'movement-slop', name: 'Movement Slop', channelId: '1506461643469754408' },
  { id: 'hip-hop', name: 'Hip Hop', channelId: '1549586599787106345' },
  { id: 'iidx', name: 'IIDX', channelId: '1549586682687393832' },
];

const BY_ID = new Map(SUBMISSION_PACKS.map((pack) => [pack.id, pack]));

export function isValidPackId(packId: string): boolean {
  return BY_ID.has(packId);
}

export function getPack(packId: string): SubmissionPack | undefined {
  return BY_ID.get(packId);
}
