import React, { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import client from '@/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { getApiErrorMessage } from '@/lib/apiError';

const time = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const CATEGORIES = [
  ['bug_report', 'Bug Report'], ['feature_request', 'Feature Request'], ['account', 'Account'],
  ['billing', 'Billing'], ['general', 'General'], ['other', 'Other'],
];
const retryTransientError = (failureCount, error) => {
  const status = error?.response?.status;
  return failureCount < 2 && (!status || status >= 500);
};
const pollWhileHealthy = (query) => query.state.status === 'error' ? false : 15000;

export default function Feedback() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('');
  const [failed, setFailed] = useState(null);
  const bottomRef = useRef(null);
  const conversation = useInfiniteQuery({
    queryKey: ['support-conversation'],
    queryFn: async ({ pageParam }) => (await client.get('/feedback/conversation', { params: { before: pageParam || undefined } })).data,
    initialPageParam: null,
    getNextPageParam: (page) => page.next_cursor || undefined,
    retry: retryTransientError,
    refetchInterval: pollWhileHealthy,
    refetchOnWindowFocus: true,
  });
  const pages = conversation.data?.pages ?? [];
  const messages = pages.slice().reverse().flatMap((page) => page.messages);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = useMutation({
    mutationFn: (draft) => client.post('/feedback/messages', draft),
    onSuccess: () => { setMessage(''); setCategory(''); setFailed(null); queryClient.invalidateQueries({ queryKey: ['support-conversation'] }); },
    onError: (error, draft) => { setFailed(draft); toast({ title: 'Message not sent', description: getApiErrorMessage(error, 'Try again.'), variant: 'destructive' }); },
  });
  const submit = (event, retry = failed) => {
    event?.preventDefault(); const body = retry?.message ?? message.trim();
    if (!body) return;
    send.mutate(retry || { message: body, category: category || null, client_message_id: crypto.randomUUID() });
  };
  const current = pages[0];
  const categoryVisible = !current?.id || current?.status === 'resolved';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div><h1 className="font-heading text-3xl font-bold">Help &amp; Feedback</h1><p className="mt-1 text-muted-foreground">Questions, bugs or suggestions? Send us a message.</p></div>
      <section className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex items-center gap-3 border-b p-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10"><MessageCircle className="h-5 w-5 text-primary" /></span><div><h2 className="font-semibold">MindFlip Support</h2><p className="text-xs text-muted-foreground">Usually responds as soon as possible</p></div></header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
          {conversation.isLoading && <div className="grid h-full place-items-center"><Loader2 className="animate-spin text-primary" /></div>}
          {conversation.isError && <div className="grid h-full place-items-center text-center"><div><p className="font-medium">We couldn’t load your messages.</p><Button variant="outline" className="mt-3" onClick={() => conversation.refetch()}>Try again</Button></div></div>}
          {!conversation.isLoading && !conversation.isError && !messages.length && <div className="grid h-full place-items-center text-center"><div><h3 className="font-heading text-xl font-semibold">How can we help?</h3><p className="mt-2 max-w-sm text-sm text-muted-foreground">Send MindFlip feedback, report a problem, or ask us a question. No previous messages.</p></div></div>}
          {conversation.hasNextPage && <Button variant="ghost" className="mx-auto block" disabled={conversation.isFetchingNextPage} onClick={() => conversation.fetchNextPage()}>{conversation.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}</Button>}
          {messages.map((item) => { const own = item.sender_type === 'user'; return <div key={item.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] ${own ? 'text-right' : ''}`}><div className="mb-1 text-xs font-medium text-muted-foreground">{own ? 'You' : 'MindFlip Support'}</div><div className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm ${own ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted'}`}>{item.body}</div><time className="mt-1 block text-xs text-muted-foreground">{time(item.created_at)}</time></div></div>; })}
          <div ref={bottomRef} />
        </div>
        {failed && <div className="flex items-center justify-between border-t bg-destructive/5 px-4 py-2 text-sm text-destructive"><span>Failed to send.</span><Button size="sm" variant="ghost" onClick={(e) => submit(e, failed)} disabled={send.isPending}>Retry</Button></div>}
        <form onSubmit={submit} className="border-t p-3 sm:p-4">{categoryVisible && <div className="mb-3 max-w-xs"><label className="mb-1.5 block text-sm font-medium">What is this about?{!current?.id ? ' *' : ''}</label><Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Support category"><SelectValue placeholder="Choose a category" /></SelectTrigger><SelectContent>{CATEGORIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>}<div className="flex items-end gap-2"><Textarea aria-label="Message MindFlip Support" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a message…" maxLength={5000} rows={2} className="min-h-[44px] resize-none" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && (!categoryVisible || category || current?.id)) { e.preventDefault(); submit(e, null); } }} /><Button type="submit" aria-label="Send message" disabled={!message.trim() || send.isPending || (!current?.id && !category)} className="h-11 gap-2">{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}<span className="hidden sm:inline">Send</span></Button></div></form>
      </section>
    </div>
  );
}
