import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import client from '../api/client';
import MetricCard from '../components/MetricCard';

export default function Metrics() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: async () => {
      const { data: res } = await client.get('/admin/metrics');
      return res;
    },
    refetchInterval: 60000,
  });

  if (isLoading || !data) {
    return <p>Loading metrics…</p>;
  }

  const chartData = (data.top_books || []).map((b) => ({
    name: b.title.length > 24 ? `${b.title.slice(0, 24)}…` : b.title,
    sets: b.set_count,
  }));

  return (
    <div>
      <h2 className="page-title">Metrics</h2>
      <div className="metrics-grid">
        <MetricCard label="DAU" value={data.dau} />
        <MetricCard label="Signups (30d)" value={data.signups_30d} />
        <MetricCard label="Total Books" value={data.total_books} />
        <MetricCard label="AI Generations (30d)" value={data.ai_generations_30d} />
        <MetricCard label="Paying Users" value={data.paying_users} />
        <MetricCard label="MRR (USD)" value={`$${data.mrr_usd}`} />
      </div>
      <h3 className="section-title">Top 10 books by flashcard sets</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-35} textAnchor="end" height={80} interval={0} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="sets" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
