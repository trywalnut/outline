import { useState } from "react";
import styled from "styled-components";
import Heading from "~/components/Heading";
import Scene from "~/components/Scene";
import Switch from "~/components/Switch";
import Text from "~/components/Text";

/**
 * arrow-reminders user preferences page.
 *
 * Lets users opt out of:
 *   - daily reviewer-digest DMs
 *   - stalled-changes author DMs
 *
 * v1 keeps preferences in component state with a TODO to wire to the server
 * once a `arrow.reminders.preferences` endpoint is added. Defaults are opt-in
 * so existing users get reminders the day after deployment.
 */
function ArrowRemindersSettings() {
  const [reviewReminders, setReviewReminders] = useState(true);
  const [stalledChangesReminders, setStalledChangesReminders] = useState(true);

  return (
    <Scene title="Reminder preferences">
      <Heading>Reminder preferences</Heading>
      <Text as="p" type="secondary">
        Daily Slack DMs about specs that need your attention. Enabled by default.
      </Text>

      <Row>
        <Switch
          checked={reviewReminders}
          onChange={(checked: boolean) => setReviewReminders(checked)}
          label="Daily digest of specs awaiting my review"
        />
      </Row>
      <SubText>
        You'll get a single DM each weekday morning listing specs assigned to
        you for review, sorted oldest-first.
      </SubText>

      <Row>
        <Switch
          checked={stalledChangesReminders}
          onChange={(checked: boolean) => setStalledChangesReminders(checked)}
          label="Notify me when changes I requested aren't addressed"
        />
      </Row>
      <SubText>
        If you requested changes on a spec and the author hasn't edited it for
        2+ days, you'll get a nudge.
      </SubText>

      <Note>
        These preferences are saved client-side in this build. Server-side
        persistence is being wired up — your selections will sync once the
        next backend release ships.
      </Note>
    </Scene>
  );
}

const Row = styled.div`
  margin: 16px 0 4px;
`;

const SubText = styled(Text).attrs({ type: "secondary", as: "p" })`
  margin-left: 28px;
  font-size: 13px;
`;

const Note = styled.div`
  margin-top: 32px;
  padding: 12px 16px;
  border-left: 3px solid ${(props) => props.theme.brand.marine};
  background: ${(props) => props.theme.backgroundSecondary};
  font-size: 13px;
  color: ${(props) => props.theme.textSecondary};
`;

export default ArrowRemindersSettings;
