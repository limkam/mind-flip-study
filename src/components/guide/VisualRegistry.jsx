import React from "react";
import { UploadDemo } from "./UploadDemo";
import { ChapterSelectionDemo } from "./ChapterSelectionDemo";
import { AIGenerationDemo } from "./AIGenerationDemo";
import { CardRatingDemo } from "./CardRatingDemo";
import { LeaderboardOvertakeDemo } from "./LeaderboardOvertakeDemo";
import { ChallengeDemo } from "./ChallengeDemo";

const registry = {
  upload_demo: UploadDemo,
  chapter_selection_demo: ChapterSelectionDemo,
  ai_generation_demo: AIGenerationDemo,
  card_rating_demo: CardRatingDemo,
  leaderboard_overtake_demo: LeaderboardOvertakeDemo,
  challenge_send_demo: (props) => <ChallengeDemo stepId="select_opponent" {...props} />,
  challenge_result_demo: (props) => <ChallengeDemo stepId="compete_result" {...props} />,
};

export function RenderVisualDemo({ visualType, ...props }) {
  const Component = registry[visualType];
  if (!Component) return null;
  return <Component {...props} />;
}
