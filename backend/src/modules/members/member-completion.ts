/**
 * How much of a member's information is filled in. The fields are the registration
 * form's (the bot asks the same ones); name and gender are always there so they don't
 * count, and alternate phone and email are optional for most people.
 */
export const COMPLETION_FIELDS = [
  'grandfatherName',
  'christianName',
  'dateOfBirth',
  'placeOfBirth',
  'maritalStatus',
  'spiritualFatherName',
  'phone',
  'city',
  'subCity',
  'woreda',
  'houseNumber',
  'educationLevel',
  'occupation',
  'emergencyContactName',
  'emergencyContactRelation',
  'emergencyContactPhone',
  'photoPath',
] as const;

export type CompletionField = (typeof COMPLETION_FIELDS)[number];
export type CompletionSource = Record<CompletionField, unknown>;

/** The API names the photo `photo`; the column is internal. */
const apiName = (field: CompletionField) => (field === 'photoPath' ? 'photo' : field);

const filled = (value: unknown) =>
  value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');

export interface MemberCompletion {
  /** 0–100, rounded down so 100 means everything is there. */
  percent: number;
  /** Fields still empty, by their API name (`photo` for the photo). */
  missing: string[];
}

export function memberCompletion(member: CompletionSource): MemberCompletion {
  const missing = COMPLETION_FIELDS.filter((f) => !filled(member[f])).map(apiName);
  const percent = Math.floor(
    ((COMPLETION_FIELDS.length - missing.length) / COMPLETION_FIELDS.length) * 100,
  );
  return { percent, missing };
}

/** Select for just the completion fields (the dashboard averages them over every member). */
export const COMPLETION_SELECT = Object.fromEntries(COMPLETION_FIELDS.map((f) => [f, true])) as {
  [K in CompletionField]: true;
};
