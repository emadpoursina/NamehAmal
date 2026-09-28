/** Shared sync protocol types and request validation (T025). Plain-HTTP trusted-LAN contract v1. */

export const SYNC_PROTOCOL_VERSION = 1;

/** Maximum revisions accepted in one exchange request batch. */
export const MAX_BATCH_REVISIONS = 200;

/** Maximum resolutions accepted in one exchange request batch. */
export const MAX_BATCH_RESOLUTIONS = 200;

/** Maximum number of host changes returned in one paged exchange response. */
export const EXCHANGE_PAGE_SIZE = 50;

/** Maximum accepted JSON body size in bytes. */
export const MAX_BODY_BYTES = 1_000_000;

export type EntryType = "WORK" | "BREAK";
export type ExchangeMode = "UPLOAD_ONLY";
export type ConfirmationState = "CONFIRMED" | "UNCONFIRMED";
export type ConflictType = "CONCURRENT_EDIT" | "OVERLAP";
export type ConflictState = "UNRESOLVED" | "RESOLVED" | "UNDONE";
export type ResolutionAction =
  | "KEEP_ENTRY"
  | "SPLIT"
  | "EDIT"
  | "UNASSIGNED"
  | "UNDO";

export interface EntrySnapshot {
  entryType: EntryType;
  /** Optional for legacy 004 requests; required and nonblank in UPLOAD_ONLY mode. */
  title?: string;
  activityId: string | null;
  categoryId: string | null;
  startedAt: string;
  endedAt: string;
  timeZoneId: string;
  timeZoneOffsetMinutes: number | null;
  confirmationState: ConfirmationState;
  deletedAt: string | null;
}

export interface IncomingRevision {
  revisionId: string;
  entryId: string;
  baseRevisionId: string | null;
  sourceDeviceId: string;
  changedByDeviceId: string;
  updatedAt: string;
  entry: EntrySnapshot;
}

export interface IncomingResolution {
  resolutionId: string;
  conflictId: string;
  action: ResolutionAction;
  selectedRevisionId: string | null;
  resultEntryIds: string[];
  resolvedByDeviceId: string;
  resolvedAt: string;
  undoesResolutionId: string | null;
}

export interface ExchangeRequest {
  protocolVersion: number;
  /** Omitted by legacy clients to retain their bidirectional protocol behavior. */
  mode?: ExchangeMode;
  deviceId: string;
  cursor: string | null;
  entryRevisions: IncomingRevision[];
  resolutions: IncomingResolution[];
}

export interface ActivitySnapshotDto {
  activityId: string;
  title: string;
  categoryId: string;
  color: string | null;
  sortOrder: number;
  isArchived: boolean;
}

export interface ConflictDto {
  conflictId: string;
  conflictType: ConflictType;
  entryIds: string[];
  revisionIds: string[];
  overlapStartAt: string | null;
  overlapEndAt: string | null;
  state: ConflictState;
  resolutionId: string | null;
}

export interface ResolutionDto {
  resolutionId: string;
  conflictId: string;
  action: ResolutionAction;
  selectedRevisionId: string | null;
  resultEntryIds: string[];
  resolvedByDeviceId: string;
  resolvedAt: string;
  undoesResolutionId: string | null;
}

export interface ExchangeResponse {
  protocolVersion: number;
  mode?: ExchangeMode;
  desktopDeviceId: string;
  acceptedRevisionIds: string[];
  acceptedResolutionIds: string[];
  cursor: string | null;
  hasMore: boolean;
  entryRevisions: IncomingRevision[];
  activities: ActivitySnapshotDto[];
  conflicts: ConflictDto[];
  resolutions: ResolutionDto[];
}

export type ValidationErrorKind =
  | "invalid_body"
  | "unsupported_protocol"
  | "invalid_field";

export interface ValidationError {
  kind: ValidationErrorKind;
  message: string;
  /** HTTP status the route should return (400 or 409). */
  status: number;
}

function error(kind: ValidationErrorKind, message: string): ValidationError {
  return { kind, message, status: kind === "unsupported_protocol" ? 409 : 400 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isValidInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return !Number.isNaN(time);
}

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const RESOLUTION_ACTIONS: ResolutionAction[] = [
  "KEEP_ENTRY",
  "SPLIT",
  "EDIT",
  "UNASSIGNED",
  "UNDO",
];

function isResolutionAction(value: unknown): value is ResolutionAction {
  return (
    typeof value === "string" &&
    RESOLUTION_ACTIONS.includes(value as ResolutionAction)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateEntrySnapshot(
  value: unknown,
  path: string,
): { entry?: EntrySnapshot; error?: ValidationError } {
  if (!isRecord(value)) {
    return { error: error("invalid_field", `${path} must be an object.`) };
  }
  if (value.entryType !== "WORK" && value.entryType !== "BREAK") {
    return {
      error: error("invalid_field", `${path}.entryType must be WORK or BREAK.`),
    };
  }
  if (value.title !== undefined && typeof value.title !== "string") {
    return { error: error("invalid_field", `${path}.title must be a string when provided.`) };
  }
  if (
    value.activityId !== null &&
    typeof value.activityId !== "string"
  ) {
    return {
      error: error("invalid_field", `${path}.activityId must be a string or null.`),
    };
  }
  if (value.entryType === "BREAK" && value.activityId !== null) {
    return {
      error: error("invalid_field", `${path}: breaks must not carry an activity.`),
    };
  }
  if (!isOptionalString(value.categoryId)) {
    return {
      error: error("invalid_field", `${path}.categoryId must be a string or null.`),
    };
  }
  if (!isValidInstant(value.startedAt) || !isValidInstant(value.endedAt)) {
    return {
      error: error(
        "invalid_field",
        `${path}: startedAt and endedAt must be valid ISO-8601 instants.`,
      ),
    };
  }
  if (Date.parse(value.endedAt) <= Date.parse(value.startedAt)) {
    return {
      error: error("invalid_field", `${path}: endedAt must be after startedAt.`),
    };
  }
  if (!isValidTimeZone(value.timeZoneId)) {
    return {
      error: error("invalid_field", `${path}.timeZoneId must be a valid IANA zone.`),
    };
  }
  if (
    value.timeZoneOffsetMinutes !== null &&
    (typeof value.timeZoneOffsetMinutes !== "number" ||
      !Number.isInteger(value.timeZoneOffsetMinutes))
  ) {
    return {
      error: error(
        "invalid_field",
        `${path}.timeZoneOffsetMinutes must be an integer or null.`,
      ),
    };
  }
  if (
    value.confirmationState !== "CONFIRMED" &&
    value.confirmationState !== "UNCONFIRMED"
  ) {
    return {
      error: error(
        "invalid_field",
        `${path}.confirmationState must be CONFIRMED or UNCONFIRMED.`,
      ),
    };
  }
  if (value.deletedAt !== null && !isValidInstant(value.deletedAt)) {
    return {
      error: error(
        "invalid_field",
        `${path}.deletedAt must be a valid ISO-8601 instant or null.`,
      ),
    };
  }
  return {
    entry: {
      entryType: value.entryType,
      ...(value.title === undefined ? {} : { title: value.title }),
      activityId: value.activityId,
      categoryId: value.categoryId,
      startedAt: value.startedAt,
      endedAt: value.endedAt,
      timeZoneId: value.timeZoneId,
      timeZoneOffsetMinutes: value.timeZoneOffsetMinutes,
      confirmationState: value.confirmationState,
      deletedAt: value.deletedAt,
    },
  };
}

function validateRevision(
  value: unknown,
  index: number,
): { revision?: IncomingRevision; error?: ValidationError } {
  const path = `entryRevisions[${index}]`;
  if (!isRecord(value)) {
    return { error: error("invalid_field", `${path} must be an object.`) };
  }
  const revisionId = value.revisionId;
  const entryId = value.entryId;
  const sourceDeviceId = value.sourceDeviceId;
  const changedByDeviceId = value.changedByDeviceId;
  if (
    !isNonEmptyString(revisionId) ||
    !isNonEmptyString(entryId) ||
    !isNonEmptyString(sourceDeviceId) ||
    !isNonEmptyString(changedByDeviceId)
  ) {
    return {
      error: error("invalid_field", `${path} identifiers must be non-empty strings.`),
    };
  }
  const baseRevisionId = value.baseRevisionId;
  if (baseRevisionId !== null && typeof baseRevisionId !== "string") {
    return {
      error: error("invalid_field", `${path}.baseRevisionId must be a string or null.`),
    };
  }
  const updatedAt = value.updatedAt;
  if (!isValidInstant(updatedAt)) {
    return {
      error: error("invalid_field", `${path}.updatedAt must be a valid ISO-8601 instant.`),
    };
  }
  const parsed = validateEntrySnapshot(value.entry, `${path}.entry`);
  if (parsed.error || !parsed.entry) {
    return { error: parsed.error };
  }
  return {
    revision: {
      revisionId,
      entryId,
      baseRevisionId,
      sourceDeviceId,
      changedByDeviceId,
      updatedAt,
      entry: parsed.entry,
    },
  };
}

function validateResolution(
  value: unknown,
  index: number,
): { resolution?: IncomingResolution; error?: ValidationError } {
  const path = `resolutions[${index}]`;
  if (!isRecord(value)) {
    return { error: error("invalid_field", `${path} must be an object.`) };
  }
  const resolutionId = value.resolutionId;
  const conflictId = value.conflictId;
  const resolvedByDeviceId = value.resolvedByDeviceId;
  if (
    !isNonEmptyString(resolutionId) ||
    !isNonEmptyString(conflictId) ||
    !isNonEmptyString(resolvedByDeviceId)
  ) {
    return {
      error: error("invalid_field", `${path} identifiers must be non-empty strings.`),
    };
  }
  const action = value.action;
  if (!isResolutionAction(action)) {
    return {
      error: error(
        "invalid_field",
        `${path}.action must be one of ${RESOLUTION_ACTIONS.join(", ")}.`,
      ),
    };
  }
  const selectedRevisionId = value.selectedRevisionId;
  if (selectedRevisionId !== null && typeof selectedRevisionId !== "string") {
    return {
      error: error(
        "invalid_field",
        `${path}.selectedRevisionId must be a string or null.`,
      ),
    };
  }
  const resultEntryIds = value.resultEntryIds;
  if (!isStringArray(resultEntryIds)) {
    return {
      error: error("invalid_field", `${path}.resultEntryIds must be an array of strings.`),
    };
  }
  const resolvedAt = value.resolvedAt;
  if (!isValidInstant(resolvedAt)) {
    return {
      error: error("invalid_field", `${path}.resolvedAt must be a valid ISO-8601 instant.`),
    };
  }
  const undoesResolutionId = value.undoesResolutionId;
  if (undoesResolutionId !== null && typeof undoesResolutionId !== "string") {
    return {
      error: error(
        "invalid_field",
        `${path}.undoesResolutionId must be a string or null.`,
      ),
    };
  }
  if (action === "KEEP_ENTRY" && !selectedRevisionId) {
    return {
      error: error(
        "invalid_field",
        `${path}: KEEP_ENTRY requires a selectedRevisionId.`,
      ),
    };
  }
  if (action === "UNDO" && !undoesResolutionId) {
    return {
      error: error("invalid_field", `${path}: UNDO requires undoesResolutionId.`),
    };
  }
  return {
    resolution: {
      resolutionId,
      conflictId,
      action,
      selectedRevisionId,
      resultEntryIds,
      resolvedByDeviceId,
      resolvedAt,
      undoesResolutionId,
    },
  };
}

/** Validate a raw exchange request body. Never throws; returns a typed error instead. */
export function validateExchangeRequest(body: unknown): {
  request?: ExchangeRequest;
  error?: ValidationError;
} {
  if (!isRecord(body)) {
    return { error: error("invalid_body", "Request body must be a JSON object.") };
  }
  if (body.protocolVersion !== SYNC_PROTOCOL_VERSION) {
    return {
      error: error(
        "unsupported_protocol",
        `Unsupported protocol version ${String(body.protocolVersion)}. This host speaks version ${SYNC_PROTOCOL_VERSION}; update the companion app and retry. No data was changed.`,
      ),
    };
  }
  const mode = body.mode;
  if (mode !== undefined && mode !== "UPLOAD_ONLY") {
    return { error: error("invalid_field", "mode must be UPLOAD_ONLY when provided.") };
  }
  if (!isNonEmptyString(body.deviceId)) {
    return { error: error("invalid_field", "deviceId must be a non-empty string.") };
  }
  if (body.cursor !== null && typeof body.cursor !== "string") {
    return { error: error("invalid_field", "cursor must be an opaque string or null.") };
  }
  if (mode === "UPLOAD_ONLY" && body.cursor !== null) {
    return { error: error("invalid_field", "UPLOAD_ONLY exchanges must not include a download cursor.") };
  }
  if (!Array.isArray(body.entryRevisions)) {
    return { error: error("invalid_field", "entryRevisions must be an array.") };
  }
  if (body.entryRevisions.length > MAX_BATCH_REVISIONS) {
    return {
      error: error(
        "invalid_field",
        `entryRevisions exceeds the batch limit of ${MAX_BATCH_REVISIONS}; retry with smaller batches.`,
      ),
    };
  }
  if (!Array.isArray(body.resolutions)) {
    return { error: error("invalid_field", "resolutions must be an array.") };
  }
  if (body.resolutions.length > MAX_BATCH_RESOLUTIONS) {
    return {
      error: error(
        "invalid_field",
        `resolutions exceeds the batch limit of ${MAX_BATCH_RESOLUTIONS}; retry with smaller batches.`,
      ),
    };
  }
  const entryRevisions: IncomingRevision[] = [];
  for (let index = 0; index < body.entryRevisions.length; index += 1) {
    const parsed = validateRevision(body.entryRevisions[index], index);
    if (parsed.error || !parsed.revision) return { error: parsed.error };
    if (mode === "UPLOAD_ONLY") {
      const entry = parsed.revision.entry;
      if (typeof entry.title !== "string" || entry.title.trim().length === 0) {
        return { error: error("invalid_field", `entryRevisions[${index}].entry.title must be nonblank in UPLOAD_ONLY mode.`) };
      }
      if (entry.deletedAt !== null) {
        return { error: error("invalid_field", `entryRevisions[${index}].entry.deletedAt must be null in UPLOAD_ONLY mode.`) };
      }
    }
    entryRevisions.push(parsed.revision);
  }
  const resolutions: IncomingResolution[] = [];
  for (let index = 0; index < body.resolutions.length; index += 1) {
    const parsed = validateResolution(body.resolutions[index], index);
    if (parsed.error || !parsed.resolution) return { error: parsed.error };
    resolutions.push(parsed.resolution);
  }
  if (mode === "UPLOAD_ONLY" && resolutions.length > 0) {
    return { error: error("invalid_field", "UPLOAD_ONLY exchanges do not accept resolutions.") };
  }
  return {
    request: {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      ...(mode === undefined ? {} : { mode }),
      deviceId: body.deviceId,
      cursor: body.cursor,
      entryRevisions,
      resolutions,
    },
  };
}

/** Encode a host sequence position as an opaque cursor. */
export function encodeCursor(seq: number): string {
  return Buffer.from(`v1:${seq}`, "utf8").toString("base64url");
}

/**
 * Decode an opaque cursor to a host sequence position.
 * Returns 0 for a null cursor (initial full-history download).
 * Throws a ValidationError-shaped object for malformed cursors.
 */
export function decodeCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const match = /^v1:(\d+)$/.exec(decoded);
    if (!match) throw new Error("bad cursor");
    return Number.parseInt(match[1], 10);
  } catch {
    throw { status: 400, message: "cursor is not a valid sync cursor; retry from null." };
  }
}
