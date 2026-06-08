import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import client from '@/api/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { getApiErrorMessage } from '@/lib/apiError';

const CATEGORIES = ['General', 'Bug Report', 'Feature Request', 'Account', 'Billing', 'Other'];

export default function Feedback() {
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) {
      toast({ title: 'Enter your feedback', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/feedback', {
        content: content.trim(),
        category: category || null,
      });
      setContent('');
      setCategory('');
      toast({
        title: 'Feedback submitted',
        description: 'Thank you — our team will review your message.',
      });
    } catch (err) {
      toast({
        title: 'Could not submit feedback',
        description: getApiErrorMessage(err, 'Please try again later.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading text-3xl font-bold">Feedback</h1>
        <p className="text-muted-foreground mt-1">
          Share suggestions, report issues, or tell us how we can improve MindFlip.
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl border border-border p-6 space-y-5"
      >
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">Send feedback</h2>
        </div>

        <div className="space-y-2">
          <Label>Category (optional)</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="feedback-content">Your message *</Label>
          <Textarea
            id="feedback-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Describe your feedback in detail…"
            rows={6}
            maxLength={5000}
            required
          />
          <p className="text-xs text-muted-foreground text-right">{content.length}/5000</p>
        </div>

        <Button type="submit" className="w-full gap-2" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submit feedback
            </>
          )}
        </Button>
      </motion.form>
    </div>
  );
}
