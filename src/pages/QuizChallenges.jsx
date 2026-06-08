import React, { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { motion } from 'framer-motion';
import { Swords, Send, Clock, Trophy, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import QuizGame from "@/components/study/QuizGame";

export default function QuizChallenges() {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [sendOpen, setSendOpen] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [opponentEmail, setOpponentEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState(null); // challenge being answered
  const [activeChallengeCards, setActiveChallengeCards] = useState([]);

  const { data: challenges = [] } = useQuery({
    queryKey: ["quiz-challenges"],
    queryFn: async () => {
      const { data } = await client.get("/quiz-challenges/");
      return data;
    },
  });

  const { data: sets = [] } = useQuery({
    queryKey: ["flashcard-sets"],
    queryFn: async () => {
      const { data } = await client.get("/flashcard-sets/", { params: { include_cards: false } });
      return data;
    },
  });

  const myChallenges = challenges.filter(c => c.challenger_email === user?.email || c.opponent_email === user?.email);
  const pending = myChallenges.filter(c => c.status === "pending" && c.opponent_email === user?.email);
  const sent = myChallenges.filter(c => c.status === "pending" && c.challenger_email === user?.email);
  const completed = myChallenges.filter(c => c.status === "completed");

  const handleSendChallenge = async () => {
    if (!selectedSetId || !opponentEmail) return;
    setSending(true);
    try {
      const set = sets.find((s) => s.id === selectedSetId);
      await client.post('/quiz-challenges/', {
        flashcard_set_id: selectedSetId,
        opponent_email: opponentEmail,
        set_title: set?.title,
        book_title: set?.book_title,
      });
      queryClient.invalidateQueries({ queryKey: ['quiz-challenges'] });
      toast({ title: 'Challenge sent' });
      setOpponentEmail('');
      setSelectedSetId('');
      setSendOpen(false);
    } catch (err) {
      toast({
        title: 'Could not send challenge',
        description: err.response?.data?.detail || err.message,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleAcceptChallenge = async (challenge) => {
    const { data: setData } = await client.get(`/flashcard-sets/${challenge.flashcard_set_id}`);
    if (setData?.cards) {
      setActiveChallengeCards(setData.cards);
      setActiveChallenge(challenge);
    }
  };

  const handleChallengeComplete = async (result) => {
    const isWinner = result.percentage > (activeChallenge.challenger_percentage || 0) ||
      (result.percentage === activeChallenge.challenger_percentage &&
        result.time_taken_seconds < (activeChallenge.challenger_time_seconds || 9999));

    await client.patch(`/quiz-challenges/${activeChallenge.id}`, {
      opponent_score: result.score,
      opponent_percentage: result.percentage,
      opponent_time_seconds: result.time_taken_seconds,
      status: "completed",
      winner_email: isWinner ? user?.email : activeChallenge.challenger_email,
    });
    queryClient.invalidateQueries({ queryKey: ["quiz-challenges"] });
    setActiveChallenge(null);
    setActiveChallengeCards([]);
    toast({ title: isWinner ? "🏆 You won the challenge!" : "Challenge completed — better luck next time!" });
  };

  const getResultForChallenge = (c) => {
    if (c.status !== "completed") return null;
    const iWon = c.winner_email === user?.email;
    return iWon ? "win" : "loss";
  };

  if (activeChallenge) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-heading text-xl font-bold">⚔️ Challenge: {activeChallenge.set_title}</h2>
            <p className="text-sm text-muted-foreground">
              Challenger scored {activeChallenge.challenger_percentage}% in {activeChallenge.challenger_time_seconds}s — beat them!
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setActiveChallenge(null)} className="text-muted-foreground">✕ Cancel</Button>
        </div>
        <QuizGame
          cards={activeChallengeCards}
          setTitle={activeChallenge.set_title}
          onComplete={handleChallengeComplete}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-3xl font-bold flex items-center gap-3">
            <Swords className="w-7 h-7 text-primary" /> Quiz Challenges
          </h1>
          <p className="text-muted-foreground mt-1">Challenge other users to quiz battles on your flashcard sets</p>
        </div>
        <Button onClick={() => setSendOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Send Challenge
        </Button>
      </div>

      {/* Pending — need your response */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="font-heading font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> Awaiting Your Response ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-card rounded-xl border-2 border-amber-400/30 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1">
                  <p className="font-medium">{c.set_title}</p>
                  <p className="text-sm text-muted-foreground">From: <span className="font-medium text-foreground">{c.challenger_name || c.challenger_email}</span></p>
                  {c.book_title && <p className="text-xs text-muted-foreground mt-0.5">{c.book_title}</p>}
                  {c.challenger_percentage != null && (
                    <p className="text-xs text-amber-600 font-medium mt-1">They scored {c.challenger_percentage}% — can you beat it?</p>
                  )}
                </div>
                <Button onClick={() => handleAcceptChallenge(c)} className="gap-2 bg-amber-500 hover:bg-amber-600 text-white">
                  <Swords className="w-4 h-4" /> Accept Challenge
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Sent — waiting for opponent */}
      {sent.length > 0 && (
        <div className="mb-6">
          <h2 className="font-heading font-semibold mb-3 flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" /> Sent & Waiting ({sent.length})
          </h2>
          <div className="space-y-2">
            {sent.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                className="bg-card rounded-xl border border-border p-4 flex items-center gap-4"
              >
                <div className="flex-1">
                  <p className="font-medium">{c.set_title}</p>
                  <p className="text-sm text-muted-foreground">To: <span className="font-medium text-foreground">{c.opponent_email}</span></p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="mb-6">
          <h2 className="font-heading font-semibold mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" /> Completed ({completed.length})
          </h2>
          <div className="space-y-2">
            {completed.map((c, i) => {
              const result = getResultForChallenge(c);
              const myPct = c.challenger_email === user?.email ? c.challenger_percentage : c.opponent_percentage;
              const theirPct = c.challenger_email === user?.email ? c.opponent_percentage : c.challenger_percentage;
              const theirName = c.challenger_email === user?.email ? c.opponent_email : (c.challenger_name || c.challenger_email);
              return (
                <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className={`bg-card rounded-xl border p-4 flex items-center gap-4
                    ${result === "win" ? "border-emerald-400/30" : "border-rose-400/30"}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                    ${result === "win" ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
                    {result === "win" ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-rose-500" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{c.set_title}</p>
                    <p className="text-sm text-muted-foreground">vs {theirName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{myPct}% vs {theirPct}%</p>
                    <p className={`text-xs font-semibold ${result === "win" ? "text-emerald-500" : "text-rose-500"}`}>
                      {result === "win" ? "You won!" : "You lost"}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {myChallenges.length === 0 && (
        <div className="text-center py-20">
          <Swords className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
          <h3 className="font-heading text-xl font-semibold text-muted-foreground mb-2">No challenges yet</h3>
          <p className="text-muted-foreground mb-6">Challenge a friend to a quiz battle on your flashcard sets!</p>
          <Button onClick={() => setSendOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Send First Challenge</Button>
        </div>
      )}

      {/* Send Challenge Dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Swords className="w-5 h-5 text-primary" /> Send a Challenge
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Flashcard Set</Label>
              <Select value={selectedSetId} onValueChange={setSelectedSetId}>
                <SelectTrigger><SelectValue placeholder="Choose a set..." /></SelectTrigger>
                <SelectContent>
                  {sets.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Opponent Email</Label>
              <Input
                placeholder="friend@email.com"
                value={opponentEmail}
                onChange={e => setOpponentEmail(e.target.value)}
              />
            </div>
            {selectedSetId && (
              <div className="bg-muted/40 rounded-lg p-3 text-sm text-muted-foreground">
                💡 You'll take the quiz first, then your opponent will see your score and try to beat it.
              </div>
            )}
            <Button onClick={handleSendChallenge} disabled={sending || !selectedSetId || !opponentEmail} className="w-full gap-2">
              {sending ? "Sending..." : <><Swords className="w-4 h-4" /> Challenge!</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}