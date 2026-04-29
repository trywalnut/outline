/**
 * /reviews scene — same inbox UI as the Account → Reviews settings page,
 * but mounted at a top-level route so the main app sidebar stays visible
 * when users click the sidebar's "Reviews" link.
 *
 * Just re-exports the Settings component as the route's component. When
 * we later differentiate the two surfaces (e.g. richer filters at /reviews,
 * stripped-down at /settings/), they'll diverge — for now the contract is:
 * the inbox is the inbox, and routing is the only thing that varies.
 */
import ArrowApprovalsSettings from "../Settings";

export default ArrowApprovalsSettings;
