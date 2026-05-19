import { observer } from "mobx-react";
import {
  CheckmarkIcon,
  ClockIcon,
  DraftsIcon,
  EyeIcon,
  NewDocumentIcon,
  WarningIcon,
} from "outline-icons";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { s } from "@shared/styles";
import type Collection from "~/models/Collection";
import { client } from "~/utils/ApiClient";

type ReviewState = "pending" | "approved" | "changes_requested" | "cancelled";

type DashboardDocument = {
  id: string;
  title: string;
  url: string;
  updatedAt: string;
  publishedAt: string | null;
  popularityScore: number;
};

type DashboardItem = {
  document: DashboardDocument;
  review: {
    state: ReviewState;
    approvalsCount: number;
    threshold: number;
    completedAt: string | null;
  } | null;
  lastReviewedAt: string | null;
  daysSinceReview: number | null;
  staleThresholdDays: number;
  staleReason:
    | "edited_after_approval"
    | "review_expired"
    | "never_reviewed"
    | null;
};

type DashboardData = {
  needingReview: DashboardItem[];
  recentlyApproved: DashboardItem[];
  stale: DashboardItem[];
  mostViewed: DashboardItem[];
  newDrafts: DashboardItem[];
};

type Props = {
  collection: Collection;
};

function CollectionDashboard({ collection }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let mounted = true;

    void client
      .post("/arrow.reviews.collectionDashboard", {
        collectionId: collection.id,
      })
      .then((res) => {
        if (!mounted) {
          return;
        }
        const payload = (res as { data?: DashboardData } | null)?.data;
        setData(payload ?? null);
      })
      .catch(() => {
        if (mounted) {
          setData(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, [collection.id]);

  if (!data) {
    return null;
  }

  return (
    <Dashboard>
      <Section
        title="Needs review"
        icon={<ClockIcon size={15} />}
        items={data.needingReview}
        empty="No docs waiting on review."
        meta={reviewMeta}
      />
      <Section
        title="Stale docs"
        icon={<WarningIcon size={15} />}
        items={data.stale}
        empty="No stale docs."
        tone="warning"
        meta={staleMeta}
      />
      <Section
        title="Recently approved"
        icon={<CheckmarkIcon size={15} />}
        items={data.recentlyApproved}
        empty="No approved docs yet."
        tone="success"
        meta={(item) =>
          item.lastReviewedAt ? `Reviewed ${timeAgo(item.lastReviewedAt)}` : ""
        }
      />
      <Section
        title="Most viewed"
        icon={<EyeIcon size={15} />}
        items={data.mostViewed}
        empty="No viewed docs yet."
        meta={(item) =>
          item.document.popularityScore > 0
            ? `Score ${Math.round(item.document.popularityScore)}`
            : "No view score yet"
        }
      />
      <Section
        title="New drafts"
        icon={<DraftsIcon size={15} />}
        items={data.newDrafts}
        empty="No drafts in this collection."
        meta={(item) => `Updated ${timeAgo(item.document.updatedAt)}`}
      />
    </Dashboard>
  );
}

function Section({
  title,
  icon,
  items,
  empty,
  meta,
  tone = "neutral",
}: {
  title: string;
  icon: ReactNode;
  items: DashboardItem[];
  empty: string;
  meta: (item: DashboardItem) => string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <DashboardSection>
      <SectionHeader>
        <SectionTitle $tone={tone}>
          {icon}
          {title}
        </SectionTitle>
        <Count>{items.length}</Count>
      </SectionHeader>
      {items.length === 0 ? (
        <EmptyRow>{empty}</EmptyRow>
      ) : (
        <ItemList>
          {items.map((item) => (
            <ItemLink key={item.document.id} to={item.document.url}>
              <NewDocumentIcon size={14} />
              <ItemText>
                <ItemTitle>{item.document.title}</ItemTitle>
                <ItemMeta>{meta(item)}</ItemMeta>
              </ItemText>
            </ItemLink>
          ))}
        </ItemList>
      )}
    </DashboardSection>
  );
}

function reviewMeta(item: DashboardItem) {
  if (!item.review) {
    return "No review";
  }
  if (item.review.state === "changes_requested") {
    return "Changes requested";
  }
  return `${item.review.approvalsCount} of ${item.review.threshold} approved`;
}

function staleMeta(item: DashboardItem) {
  if (item.staleReason === "edited_after_approval") {
    return "Changed since approval";
  }
  if (item.staleReason === "never_reviewed") {
    return "Never reviewed";
  }
  if (typeof item.daysSinceReview === "number") {
    return `Last reviewed ${item.daysSinceReview} days ago`;
  }
  return `Review target ${item.staleThresholdDays} days`;
}

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  return `${Math.floor(days / 30)} months ago`;
}

const Dashboard = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 24px;

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
  }
`;

const DashboardSection = styled.section`
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  background: ${s("background")};
  min-width: 0;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid ${s("divider")};
`;

const SectionTitle = styled.div<{ $tone: "neutral" | "success" | "warning" }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: ${(props) => {
    if (props.$tone === "success") {
      return props.theme.success;
    }
    if (props.$tone === "warning") {
      return props.theme.warning;
    }
    return props.theme.text;
  }};
  font-size: 13px;
  font-weight: 600;
`;

const Count = styled.span`
  color: ${s("textTertiary")};
  font-size: 12px;
`;

const EmptyRow = styled.div`
  padding: 14px 12px;
  color: ${s("textTertiary")};
  font-size: 13px;
`;

const ItemList = styled.div`
  display: flex;
  flex-direction: column;
`;

const ItemLink = styled(Link)`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 9px 12px;
  color: ${s("text")};
  text-decoration: none;
  border-bottom: 1px solid ${s("divider")};

  &:last-child {
    border-bottom: 0;
  }

  &:hover {
    background: ${s("backgroundSecondary")};
    text-decoration: none;
  }

  svg {
    flex-shrink: 0;
    color: ${s("textTertiary")};
    margin-top: 2px;
  }
`;

const ItemText = styled.div`
  min-width: 0;
`;

const ItemTitle = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
`;

const ItemMeta = styled.div`
  color: ${s("textTertiary")};
  font-size: 12px;
  margin-top: 2px;
`;

export default observer(CollectionDashboard);
