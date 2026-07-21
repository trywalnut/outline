import type ArrowTag from "../models/ArrowTag";

/**
 * API response shape for an arrow-tag. Matches the fields tags.feature
 * scenarios assert against (id, name, color).
 */
export interface PresentedArrowTag {
  id: string;
  name: string;
  color: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Format an ArrowTag for API responses.
 *
 * @param tag the tag model
 * @returns the wire-format tag.
 */
export function presentArrowTag(tag: ArrowTag): PresentedArrowTag {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdById: tag.createdById,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}
