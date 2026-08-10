import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import client from "@/api/client";
import { ScorecardView } from "@/pages/Scorecards";

export default function PublicScorecard() {
  const { token } = useParams();
  const { data, isLoading, isError } = useQuery({ queryKey: ["public-scorecard", token], queryFn: async () => (await client.get(`/scorecards/public/${token}`)).data, retry: false });
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950"><div className="w-full max-w-3xl">{isLoading && <p className="text-center">Loading scorecard…</p>}{isError && <p className="text-center text-muted-foreground">This scorecard is private, unavailable, or has been revoked.</p>}<ScorecardView card={data} /></div></main>;
}
