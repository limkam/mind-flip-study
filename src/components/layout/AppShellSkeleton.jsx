import { Skeleton } from "@/components/ui/skeleton";

export default function AppShellSkeleton({ routeOnly = false }) {
  if (routeOnly) {
    return (
      <div className="mx-auto max-w-7xl space-y-6" role="status" aria-label="Loading page">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background" role="status" aria-label="Verifying your session">
      <aside className="fixed hidden h-screen w-64 border-r border-border bg-card p-5 lg:block">
        <Skeleton className="mb-8 h-10 w-36" />
        <div className="space-y-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      </aside>
      <main className="px-4 pb-28 pt-20 lg:ml-64 lg:px-8 lg:py-8">
        <AppShellSkeleton routeOnly />
      </main>
    </div>
  );
}
