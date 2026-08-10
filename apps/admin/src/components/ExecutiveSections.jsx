import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import client from '../api/client';

const get = async (url, params) => (await client.get(url, { params })).data;
const usd = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
const colors = ['#6d5bd0', '#10b981', '#f59e0b', '#ef4444', '#38bdf8', '#ec4899'];

function PanelState({ query, children }) {
  if (query.isLoading) return <div className="exec-loading">Loading live intelligence…</div>;
  if (query.isError) return <div className="owner-error">This intelligence panel could not be loaded.</div>;
  return children;
}

export function DailyBrief() {
  const query = useQuery({ queryKey: ['owner-executive-summary'], queryFn: () => get('/admin/owner-dashboard/executive-summary') });
  return <PanelState query={query}>{query.data && <section className="daily-brief"><div><span className="owner-eyebrow">Live executive brief</span><h2>{query.data.title}</h2>{query.data.sentences.map(line => <p key={line}>• {line}</p>)}</div><aside><b>Recommended decisions</b>{query.data.recommendations.map(line => <p key={line}>→ {line}</p>)}</aside></section>}</PanelState>;
}

export function Forecasts() {
  const query = useQuery({ queryKey: ['owner-forecasts'], queryFn: () => get('/admin/owner-dashboard/forecasts') });
  return <section><div className="section-title"><div><span className="owner-eyebrow">Forward view</span><h2>Financial Forecasting</h2></div></div><PanelState query={query}>{query.data && <><div className="forecast-grid">{query.data.cards.map(card => <article key={card.key} title={card.warning||card.method}><span>{card.label}</span><strong>{card.format === 'currency' ? usd(card.value) : `${card.value} months`}</strong><small className="metric-state projected">projected</small><small className={`confidence ${card.confidence}`}>{card.confidence} confidence</small>{card.key==='revenue'&&<small>{usd(card.recognized_revenue_mtd)} MTD · {card.elapsed_days}/{card.days_in_month} days</small>}</article>)}</div><div className="renewals"><b>Upcoming subscription renewals</b>{query.data.renewals.length ? query.data.renewals.slice(0, 5).map(x => <span key={`${x.customer}${x.date}`}>{new Date(x.date).toLocaleDateString()} · {x.customer} · {usd(x.amount)}</span>) : <span>No renewals in the next 30 days.</span>}</div></>}</PanelState></section>;
}

export function IntelligenceAndRevenue() {
  const range = '30d';
  const ai = useQuery({ queryKey: ['owner-ai-intelligence', range], queryFn: () => get('/admin/owner-dashboard/ai-intelligence', { range }) });
  const revenue = useQuery({ queryKey: ['owner-revenue-analytics', range], queryFn: () => get('/admin/owner-dashboard/revenue-analytics', { range }) });
  return <div className="intelligence-grid">
    <section className="owner-card exec-panel"><div className="section-title"><div><span className="owner-eyebrow">AI intelligence · 30 days</span><h2>AI Cost Control</h2></div></div><PanelState query={ai}>{ai.data && <><div className="mini-kpis"><span>Cost/request <b>{usd(ai.data.cost_per_request)}</b></span><span>Avg tokens <b>{ai.data.average_tokens.toLocaleString()}</b></span><span>Avg latency <b>{ai.data.average_latency_ms} ms</b></span><span>Failure rate <b>{ai.data.failure_rate}%</b></span><span>Cache hit <b>{ai.data.cache_hit_rate}%</b></span></div><div className="exec-chart"><ResponsiveContainer><AreaChart data={ai.data.daily_spend}><CartesianGrid strokeDasharray="3 3" opacity={0.25}/><XAxis dataKey="date" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={usd}/><Area dataKey="cost" stroke="#6d5bd0" fill="#6d5bd044"/></AreaChart></ResponsiveContainer></div><div className="insight-list">{ai.data.optimization_opportunities.map(x => <p key={x}>✦ {x}</p>)}</div></>}</PanelState></section>
    <section className="owner-card exec-panel"><div className="section-title"><div><span className="owner-eyebrow">Revenue intelligence · 30 days</span><h2>Revenue Analytics</h2></div></div><PanelState query={revenue}>{revenue.data && <><div className="exec-chart"><ResponsiveContainer><AreaChart data={revenue.data.daily}><CartesianGrid strokeDasharray="3 3" opacity={0.25}/><XAxis dataKey="date" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={usd}/><Legend/><Area dataKey="revenue" stroke="#10b981" fill="#10b98133"/><Area dataKey="recognized_revenue" stroke="#6d5bd0" fill="transparent"/></AreaChart></ResponsiveContainer></div><div className="split-charts"><ResponsiveContainer><PieChart><Pie data={revenue.data.by_plan} dataKey="value" nameKey="label" outerRadius={65}>{revenue.data.by_plan.map((x,i)=><Cell key={x.label} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={usd}/></PieChart></ResponsiveContainer><ResponsiveContainer><BarChart data={revenue.data.by_country.slice(0,6)} layout="vertical"><XAxis type="number" hide/><YAxis type="category" dataKey="label" width={72} tick={{fontSize:10}}/><Tooltip formatter={usd}/><Bar dataKey="value" fill="#6d5bd0" radius={4}/></BarChart></ResponsiveContainer></div></>}</PanelState></section>
  </div>;
}

export function SystemHealth() {
  const query = useQuery({ queryKey: ['owner-system-health'], queryFn: () => get('/admin/owner-dashboard/system-health'), refetchInterval: 60000 });
  return <section className="owner-card health-panel"><div className="section-title"><div><span className="owner-eyebrow">Operations</span><h2>System Health</h2></div></div><PanelState query={query}>{query.data && <div className="health-grid">{query.data.indicators.map(x => <article key={x.name}><i className={x.status}/><div><b>{x.name}</b><small>{x.detail}</small></div><span>{x.status}</span></article>)}</div>}</PanelState></section>;
}
