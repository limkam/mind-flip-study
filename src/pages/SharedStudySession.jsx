import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { ArrowLeft, BookOpen, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_LIMIT_EVENT } from "@/components/billing/UpgradeLimitDialog";
import { getApiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/ui/use-toast";

export default function SharedStudySession() {
  const { groupId, materialId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: preview, isLoading, isError, error } = useQuery({
    queryKey: ["study-group-material-activation", groupId, materialId],
    queryFn: async () => {
      const { data } = await client.get(
        `/study-groups/${groupId}/materials/${materialId}/activation`,
      );
      return data;
    },
    enabled: !!groupId && !!materialId,
    retry: false,
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await client.post(
        `/study-groups/${groupId}/materials/${materialId}/activate`,
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["billing-overview"] });
      navigate(`/study/${data.set_id}`, { replace: true });
    },
    onError: (err) => {
      const code = err?.response?.data?.detail?.code;
      if (code === "UPGRADE_REQUIRED") {
        const detail = err.response.data.detail;
        window.dispatchEvent(
          new CustomEvent(PLAN_LIMIT_EVENT, {
            detail: {
              reason: detail.reason === "set_limit"
                ? "You're out of flashcard set slots to add this shared material to your library."
                : "You're out of book slots to add this shared material to your library.",
            },
          }),
        );
        return;
      }
      toast({
        title: "Could not add this to your library",
        description: getApiErrorMessage(err, "Something went wrong."),
        variant: "destructive",
      });
    },
  });

  React.useEffect(() => {
    if (preview?.already_activated && preview.set_id) {
      navigate(`/study/${preview.set_id}`, { replace: true });
    }
  }, [preview, navigate]);

  if (isLoading) {
    return <p className="text-center text-muted-foreground py-16">Loading…</p>;
  }

  if (isError) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <Lock className="w-10 h-10 mx-auto text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">
          {getApiErrorMessage(error, "Could not load this shared material.")}
        </p>
        <Button variant="outline" onClick={() => navigate(`/study-groups/${groupId}`)}>
          Back to group
        </Button>
      </div>
    );
  }

  // already_activated + set_id triggers a redirect above; this only renders while that's in flight.
  if (preview?.already_activated) {
    return <p className="text-center text-muted-foreground py-16">Opening your study set…</p>;
  }

  const bookSlots = preview?.book_slots_remaining;
  const setSlots = preview?.set_slots_remaining;
  const previouslyCharged = preview?.previously_charged;
  const outOfSlots = !previouslyCharged && (bookSlots === 0 || setSlots === 0);

  return (
    <div className="max-w-md mx-auto space-y-6 py-10">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 -ml-2"
        onClick={() => navigate(`/study-groups/${groupId}`)}
      >
        <ArrowLeft className="w-4 h-4" /> Back to group
      </Button>

      <div className="text-center space-y-3">
        <BookOpen className="w-10 h-10 mx-auto text-primary" />
        <h1 className="font-heading text-2xl font-bold">{preview?.book_title}</h1>
        <p className="text-sm text-muted-foreground">
          {previouslyCharged ? (
            "You already paid for this material before — reactivating it is free and restores your prior study progress. It won't use another book or set slot."
          ) : (
            <>
              Add this to your library? This will permanently use 1 of your{" "}
              {bookSlots ?? "unlimited"} book slots and 1 of your{" "}
              {setSlots ?? "unlimited"} flashcard set slots for this billing period —
              removing it later won't refund the slot, same as deleting content you
              uploaded yourself. Once added, you'll get full study access — spaced
              repetition and progress tracking, same as content you upload yourself.
            </>
          )}
        </p>
      </div>

      {outOfSlots ? (
        <p className="text-center text-sm text-amber-600">
          You're out of {bookSlots === 0 ? "book" : "flashcard set"} slots on your current plan.
          Upgrade to add this to your library.
        </p>
      ) : null}

      <Button
        className="w-full"
        disabled={activateMutation.isPending || outOfSlots}
        onClick={() => activateMutation.mutate()}
      >
        {activateMutation.isPending ? "Adding…" : "Add to my library"}
      </Button>
    </div>
  );
}
