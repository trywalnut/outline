import { observer } from "mobx-react";
import { CheckmarkIcon } from "outline-icons";
import { useEffect, useState } from "react";
import styled from "styled-components";
import Flex from "~/components/Flex";
import SidebarLink from "~/components/Sidebar/components/SidebarLink";
import Text from "~/components/Text";
import { client } from "~/utils/ApiClient";

/**
 * Sidebar entry that surfaces "specs awaiting your review" as a top-level
 * navigation item with a count badge — same placement contract as Drafts,
 * which is the closest existing analogue (work-the-user-still-owes vs.
 * docs-they-published).
 *
 * Clicking goes to /settings/arrow-approvals (the inbox). When that gets
 * promoted to a proper /reviews scene this becomes a one-line target swap.
 *
 * Count refreshes every 60s while the sidebar is mounted; we don't need
 * realtime here — this is a lower-priority cue than the in-doc banner.
 */

interface ReviewSummary {
  id: string;
}

function SidebarReviewsLinkInner() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await client.post("/arrow.reviews.list", {
          filter: "awaiting_me",
        });
        const data = (res as { data?: { reviews?: ReviewSummary[] } } | null)?.data;
        if (!cancelled) {
          setCount(data?.reviews?.length ?? 0);
        }
      } catch {
        // ignore — silent fail
      }
    }
    void refresh();
    const intv = setInterval(() => void refresh(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(intv);
    };
  }, []);

  return (
    <SidebarLink
      to="/settings/arrow-approvals"
      icon={<CheckmarkIcon />}
      label={
        <Flex align="center" justify="space-between">
          Reviews
          {count > 0 ? (
            <Pill size="xsmall" type="tertiary">
              {count > 25 ? "25+" : count}
            </Pill>
          ) : null}
        </Flex>
      }
    />
  );
}

const Pill = styled(Text)`
  margin: 0 4px;
  background: ${(props) => props.theme.brand?.marine ?? "#0c1622"};
  color: white;
  border-radius: 10px;
  padding: 1px 8px;
  font-weight: 600;
`;

export default observer(SidebarReviewsLinkInner);
