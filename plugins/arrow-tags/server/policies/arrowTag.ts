import { allow } from "@server/policies/cancan";
import User from "@server/models/User";
import ArrowTag from "../models/ArrowTag";

/**
 * Policies for arrow-tags. Mirrors Outline's cancan-style policy approach
 * (see server/policies/*.ts for examples).
 *
 *   - createArrowTag: any active team member
 *   - listArrowTag:   any active team member
 *   - deleteArrowTag: only the creator OR a team admin
 */

allow(User, "createArrowTag", User, (actor, target) => !!target && actor.teamId === target.teamId);

allow(User, "listArrowTag", User, (actor, target) => !!target && actor.teamId === target.teamId);

allow(
  User,
  "deleteArrowTag",
  ArrowTag,
  (actor, tag) =>
    !!tag &&
    actor.teamId === tag.teamId &&
    (actor.isAdmin || actor.id === tag.createdById)
);

allow(
  User,
  "updateArrowTag",
  ArrowTag,
  (actor, tag) =>
    !!tag &&
    actor.teamId === tag.teamId &&
    (actor.isAdmin || actor.id === tag.createdById)
);
