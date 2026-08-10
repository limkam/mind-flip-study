import React from "react";
import { MobileUploadDemo } from "./MobileUploadDemo";
import { MobileChapterSelectionDemo } from "./MobileChapterSelectionDemo";
import { MobileAIGenerationDemo } from "./MobileAIGenerationDemo";
import { MobileCardRatingDemo } from "./MobileCardRatingDemo";
import { MobileLeaderboardOvertakeDemo } from "./MobileLeaderboardOvertakeDemo";
import { MobileChallengeDemo } from "./MobileChallengeDemo";

const registry: Record<string, React.ComponentType<any>> = {
  upload_demo: MobileUploadDemo,
  chapter_selection_demo: MobileChapterSelectionDemo,
  ai_generation_demo: MobileAIGenerationDemo,
  card_rating_demo: MobileCardRatingDemo,
  leaderboard_overtake_demo: MobileLeaderboardOvertakeDemo,
  challenge_send_demo: (props: any) => <MobileChallengeDemo stepId="select_opponent" {...props} />,
  challenge_result_demo: (props: any) => <MobileChallengeDemo stepId="compete_result" {...props} />,
};

export function RenderMobileVisualDemo({ visualType, ...props }: { visualType?: string; [key: string]: any }) {
  if (!visualType) return null;
  const Component = registry[visualType];
  if (!Component) return null;
  return <Component {...props} />;
}
