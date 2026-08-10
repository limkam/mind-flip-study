import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Flame, Trophy, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import client from "@/api/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { useCelebration } from "@/lib/celebrations/CelebrationContext";

const iconFor = (category) => category === "achievements" ? Trophy : category === "streaks" ? Flame : Bell;

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { request } = useCelebration();
  const { data: unread } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: async () => (await client.get("/engagement/notifications/unread-count")).data,
    retry: (failureCount, error) => error?.response?.status !== 401 && failureCount < 2,
    refetchInterval: (query) => query.state.error?.response?.status === 401
      ? false
      : (open ? 30_000 : 60_000),
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: async () => (await client.get("/engagement/notifications", { params: { page: 1, size: 12 } })).data,
    enabled: open,
    retry: (failureCount, error) => error?.response?.status !== 401 && failureCount < 2,
  });

  useEffect(() => {
    const newest = data?.items?.find((item) => !item.read_at && item.type === "achievement.unlocked");
    if (!newest) return;
    request({ eventId: String(newest.id), type: "achievement_unlock", occurredAt: newest.created_at, title: newest.title, message: newest.body, announcement: `Achievement unlocked: ${newest.title}.`, entityId: String(newest.id) });
  }, [data, request]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    queryClient.invalidateQueries({ queryKey: ["notifications-unread"] }),
  ]);
  const read = useMutation({ mutationFn: (id) => client.patch(`/engagement/notifications/${id}/read`), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => client.post("/engagement/notifications/read-all"), onSuccess: refresh });
  const dismiss = useMutation({ mutationFn: (id) => client.delete(`/engagement/notifications/${id}`), onSuccess: refresh });

  const openItem = async (item) => {
    if (!item.read_at) await read.mutateAsync(item.id);
    setOpen(false);
    if (item.action_url?.startsWith("/")) navigate(item.action_url);
  };

  const count = Math.min(unread?.count || 0, 99);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label={`${unread?.count || 0} unread notifications`}>
          <Bell className="h-4 w-4" />
          {count > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-destructive px-1 text-[10px] font-bold leading-5 text-destructive-foreground">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,390px)] p-0" aria-label="Notifications">
        <div className="flex items-center justify-between border-b p-4">
          <div><h2 className="font-heading font-semibold">Notifications</h2><p className="text-xs text-muted-foreground">Useful updates about your learning</p></div>
          {count > 0 && <Button variant="ghost" size="sm" onClick={() => readAll.mutate()} disabled={readAll.isPending}><CheckCheck className="mr-1 h-4 w-4" />Read all</Button>}
        </div>
        <div className="max-h-[430px] overflow-y-auto" role="list">
          {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Loading notifications…</p>}
          {isError && <p className="p-6 text-center text-sm text-destructive">Notifications could not be loaded.</p>}
          {!isLoading && !isError && data?.items?.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No notifications yet. Updates about your learning will appear here.</p>}
          {data?.items?.map((item) => {
            const Icon = iconFor(item.category);
            return <div key={item.id} role="listitem" className={`group flex gap-3 border-b p-3 ${item.read_at ? "bg-background" : "bg-primary/5"}`}>
              <button type="button" onClick={() => openItem(item)} className="flex min-w-0 flex-1 gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.body}</span><span className="mt-1 block text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span></span>
              </button>
              <button type="button" onClick={() => dismiss.mutate(item.id)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Dismiss ${item.title}`}><X className="mx-auto h-4 w-4" /></button>
            </div>;
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
