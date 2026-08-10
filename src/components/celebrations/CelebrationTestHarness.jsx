import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCelebration } from "@/lib/celebrations/CelebrationContext";

const event = (type, id, metadata = {}) => ({ eventId: id, type, occurredAt: "2026-01-01T12:00:00.000Z", metadata,
  title: type === "course_complete" ? "Course complete" : type.replaceAll("_", " "), message: `Test ${type}` });

export default function CelebrationTestHarness() {
  const { request, requestMany, active, queueLength, audioManager, unlocked } = useCelebration(); const navigate = useNavigate();
  const [, refresh] = useState(0);
  return <main className="p-8"><h1>Celebration verification</h1><input aria-label="Focus sentinel" />
    <div className="mt-4 flex flex-wrap gap-2">
      <button onClick={() => request(event("lesson_complete", "lesson-1"))}>Lesson</button>
      <button onClick={() => request(event("lesson_complete", "lesson-2"))}>Different lesson</button>
      <button onClick={() => request(event("achievement_unlock", "achievement-1"))}>Achievement</button>
      <button onClick={() => request(event("streak_extended", "streak-4", { streakDays: 4 }))}>Streak</button>
      <button onClick={() => request(event("streak_milestone", "streak-30", { streakDays: 30 }))}>Milestone</button>
      <button onClick={() => request(event("course_complete", "course-1"))}>Course</button>
      <button onClick={() => requestMany([event("lesson_complete", "combined-lesson"), event("achievement_unlock", "combined-achievement"), event("streak_extended", "combined-streak", { streakDays: 8 }), event("course_complete", "combined-course")])}>Combined</button>
      <button onClick={() => { audioManager.setGlobalMute(true); refresh((value) => value + 1); }}>Mute</button>
      <button onClick={() => navigate("/__phase4-test?route=changed")}>Navigate</button>
    </div>
    <output data-testid="active-type">{active?.type || "none"}</output><output data-testid="queue-length">{queueLength}</output>
    <output data-testid="audio-unlocked">{String(unlocked)}</output><output data-testid="audio-muted">{String(audioManager.isMuted())}</output>
  </main>;
}
