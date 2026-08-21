import React, { useEffect, useState } from "react";
import { Sparkles, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import BuyCreditsModal from "@/components/billing/BuyCreditsModal";

export const PLAN_LIMIT_EVENT = "bilkeys:plan-limit";

function friendlyLimitMessage(reason) {
  const text = String(reason || "").toLowerCase();
  if (text.includes("flashcard-set") || text.includes("flashcard set")) {
    return "You've used all the flashcard sets included in your current plan. You can buy extra credits or upgrade your plan to continue.";
  }
  if (text.includes("book")) {
    return "You've used all the book imports included in your current plan. You can buy extra credits or upgrade your plan to add more books.";
  }
  if (text.includes("card") && text.includes("set")) {
    return "This flashcard set is larger than your current plan allows. Upgrade to create larger sets and unlock additional study features.";
  }
  if (text.includes("regenerat") || text.includes("credit")) {
    return "Your current plan doesn't have enough credits for this action. Buy extra credits or upgrade your plan to continue.";
  }
  if (text.includes("challenge") || text.includes("study group")) {
    return "This feature isn't included in your current plan. Upgrade to unlock it along with additional study and collaboration features.";
  }
  return "You've reached a limit included in your current plan. Buy extra credits or upgrade your plan to continue.";
}

export default function UpgradeLimitDialog() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [buyingCredits, setBuyingCredits] = useState(false);

  useEffect(() => {
    const showDialog = (event) => setMessage(friendlyLimitMessage(event.detail?.reason));
    window.addEventListener(PLAN_LIMIT_EVENT, showDialog);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, showDialog);
  }, []);

  const open = Boolean(message);
  const close = () => setMessage("");

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="overflow-hidden rounded-3xl border-primary/15 p-0 shadow-2xl sm:max-w-lg">
          <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-background px-6 pb-5 pt-7">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl">You've reached your plan limit</DialogTitle>
              <DialogDescription className="pt-2 text-sm leading-6">{message}</DialogDescription>
            </DialogHeader>
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 px-6 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={close} className="sm:w-auto">Maybe Later</Button>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                onClick={() => {
                  close();
                  setBuyingCredits(true);
                }}
              >
                <Coins className="mr-1.5 h-4 w-4 text-primary" />
                Buy Extra Credits
              </Button>
              <Button
                onClick={() => {
                  close();
                  navigate("/pricing");
                }}
              >
                Upgrade Plan
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BuyCreditsModal open={buyingCredits} onClose={() => setBuyingCredits(false)} />
    </>
  );
}
