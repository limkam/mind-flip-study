import type {
  StudyGroupDetailOut,
  StudyGroupMaterialOut,
  StudyGroupMemberOut,
} from "../types/api";

export const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isStudyGroupMaterial(value: unknown): value is StudyGroupMaterialOut {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && UUID_PATTERN.test(value.id)
    && typeof value.book_id === "string"
    && UUID_PATTERN.test(value.book_id)
    && typeof value.title === "string"
    && value.title.trim().length > 0
    && typeof value.author === "string"
    && typeof value.added_by_name === "string"
    && value.added_by_name.trim().length > 0
    && (value.added_at === null || typeof value.added_at === "string");
}

function isStudyGroupMember(value: unknown): value is StudyGroupMemberOut {
  if (!isRecord(value)) return false;
  return typeof value.user_id === "string"
    && UUID_PATTERN.test(value.user_id)
    && typeof value.full_name === "string"
    && value.full_name.trim().length > 0
    && typeof value.role === "string"
    && value.role.trim().length > 0
    && typeof value.cards_this_week === "number"
    && Number.isFinite(value.cards_this_week);
}

function validMaterials(value: unknown): { materials: StudyGroupMaterialOut[]; incomplete: boolean } {
  if (!Array.isArray(value)) {
    console.warn("[studyGroupMaterials] Group detail contained no valid material list.");
    return { materials: [], incomplete: true };
  }
  const seen = new Set<string>();
  const seenBookIds = new Set<string>();
  let incomplete = false;
  const materials = value.filter((row) => {
    if (!isStudyGroupMaterial(row) || seen.has(row.id) || seenBookIds.has(row.book_id)) {
      console.warn("[studyGroupMaterials] Ignored an invalid or duplicate material row.");
      incomplete = true;
      return false;
    }
    seen.add(row.id);
    seenBookIds.add(row.book_id);
    return true;
  });
  return { materials, incomplete };
}

export type ParsedStudyGroupDetail = StudyGroupDetailOut & {
  has_incomplete_materials: boolean;
};

export function parseStudyGroupDetail(value: unknown): ParsedStudyGroupDetail {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !UUID_PATTERN.test(value.id)
    || typeof value.name !== "string"
    || value.name.trim().length === 0
    || !(value.description === null || typeof value.description === "string")
    || !(value.code === null || typeof value.code === "string")
    || !(value.privacy === "public" || value.privacy === "private")
    || !Number.isInteger(value.weekly_card_goal)
    || !Number.isInteger(value.member_count)
    || typeof value.cards_this_week !== "number"
    || !Number.isFinite(value.cards_this_week)
    || typeof value.progress_pct !== "number"
    || !Number.isFinite(value.progress_pct)
    || typeof value.activity_status !== "string"
    || !(value.created_at === null || typeof value.created_at === "string")
    || value.is_member !== true
    || !Array.isArray(value.members)) {
    throw new Error("The group detail response was invalid.");
  }

  const members = value.members.filter((member) => {
    if (isStudyGroupMember(member)) return true;
    console.warn("[studyGroupMaterials] Ignored an invalid group member row.");
    return false;
  });
  const parsedMaterials = validMaterials(value.materials);
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    code: value.code,
    privacy: value.privacy,
    weekly_card_goal: value.weekly_card_goal as number,
    member_count: value.member_count as number,
    cards_this_week: value.cards_this_week,
    progress_pct: value.progress_pct,
    activity_status: value.activity_status,
    created_at: value.created_at,
    is_member: true,
    members,
    materials: parsedMaterials.materials,
    has_incomplete_materials: parsedMaterials.incomplete,
  };
}

export type AttachmentResponse =
  | { status: "attached"; material: StudyGroupMaterialOut }
  | { status: "accepted_without_detail" };

export function parseAttachmentResponse(value: unknown, expectedBookId: string): AttachmentResponse {
  if (isStudyGroupMaterial(value) && value.book_id === expectedBookId) {
    return { status: "attached", material: value };
  }
  console.warn("[studyGroupMaterials] Attachment succeeded without a valid material response.");
  return { status: "accepted_without_detail" };
}
