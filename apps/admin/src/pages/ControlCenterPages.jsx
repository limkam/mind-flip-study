import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import client from '../api/client';
import DataTable from '../components/DataTable';
import MetricCard from '../components/MetricCard';
import { DetailRows, EmptyState, PageHeader, QueryState, SectionCard, StatusBadge } from '../components/AdminUI';
import { CHART } from '../lib/chartColors';

const get = async (url, params) => (await client.get(url, { params })).data;
const when = (v) => v ? new Date(v).toLocaleString() : '—';
const json = (v) => <pre className="safe-json">{JSON.stringify(v, null, 2)}</pre>;
function Loading({ query }) {
  return <QueryState query={query} />;
}

function MiniDonut({ data, nameKey = 'label', valueKey = 'count' }) {
  const chartData = data?.length ? data : [{ [nameKey]: 'No data', [valueKey]: 1 }];
  return (
    <div className="chart-wrap chart-wrap-half">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={chartData} dataKey={valueKey} nameKey={nameKey} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={data?.length ? CHART.donut[i % CHART.donut.length] : '#e2e8f0'} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function MiniBarChart({ data, dataKey, nameKey = 'label', fill, height = 240, layout }) {
  return (
    <div className="chart-wrap chart-wrap-half">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 16, left: layout === 'vertical' ? 24 : 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          {layout === 'vertical' ? (
            <>
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey={nameKey} width={140} />
            </>
          ) : (
            <>
              <XAxis dataKey={nameKey} angle={-20} textAnchor="end" height={60} interval={0} />
              <YAxis allowDecimals={false} />
            </>
          )}
          <Tooltip />
          <Bar dataKey={dataKey} fill={fill || CHART.primary} radius={layout === 'vertical' ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Overview() {
  const activity = useQuery({ queryKey:['control-activity'], queryFn:()=>get('/admin/control/activity-analytics') });
  const onboarding = useQuery({ queryKey:['control-onboarding'], queryFn:()=>get('/admin/control/onboarding-analytics') });
  const subs = useQuery({ queryKey:['control-sub-summary'], queryFn:()=>get('/admin/control/subscriptions',{size:1}) });
  const plans = useQuery({ queryKey:['control-plans'], queryFn:()=>get('/admin/control/plan-rankings') });
  if ([activity,onboarding,subs,plans].some(x=>x.isLoading)) return <p>Loading operational overview…</p>;
  const rank = x => x?.map(v=>v.plan).join(' + ') || 'Not available';
  return <div><PageHeader title="Overview" description="What is happening across MindFlip right now." />
    <div className="metrics-grid"><MetricCard label="Total users" value={subs.data?.summary?.total_users}/><MetricCard label="Active users (30d)" value={activity.data?.mau}/><MetricCard label="Paying users" value={subs.data?.summary?.paying_users}/><MetricCard label="New this week" value={onboarding.data?.last_7_days.registrations}/></div>
    <SectionCard title="Growth and activity" description="Meaningful authenticated activity in UTC rolling windows."><div className="metrics-grid"><MetricCard label="New today" value={onboarding.data?.today.registrations}/><MetricCard label="Onboarded today" value={onboarding.data?.today.completed}/><MetricCard label="DAU" value={activity.data?.dau}/><MetricCard label="WAU" value={activity.data?.wau}/></div></SectionCard>
    <SectionCard title="Subscriptions" description="Canonical synchronized billing state."><div className="metrics-grid">{['free_users','paying_users','trialing','canceling','past_due','conflicts'].map(k=><MetricCard key={k} label={k.replaceAll('_',' ')} value={subs.data?.summary?.[k] ?? 0}/>)}</div></SectionCard>
    <SectionCard title="Plan ranking" description={plans.data?.all_tied ? 'Configured plan buckets are tied.' : 'Customer distribution by resolved entitlement.'}>
      <div className="metrics-grid"><MetricCard label={plans.data?.all_tied?'Tied plans':'Most popular'} value={rank(plans.data?.highest)}/>{!plans.data?.all_tied&&<><MetricCard label="Second" value={rank(plans.data?.second_highest)}/><MetricCard label="Least popular" value={rank(plans.data?.lowest)}/></>}</div>
      <MiniDonut data={(plans.data?.distribution || []).map((p) => ({ label: p.plan, count: p.users }))} />
    </SectionCard>
  </div>;
}

function PlanSummaryPanel() {
  const [windowPreset, setWindowPreset] = useState('week');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const params = { window: windowPreset };
  if (windowPreset === 'custom') {
    params.date_from = dateFrom || undefined;
    params.date_to = dateTo || undefined;
  }
  const query = useQuery({
    queryKey: ['control-plan-summary', windowPreset, dateFrom, dateTo],
    queryFn: () => get('/admin/control/subscriptions/plan-summary', params),
    enabled: windowPreset !== 'custom' || Boolean(dateFrom && dateTo),
  });
  const distribution = query.data?.current_totals?.distribution || [];
  const newInWindow = query.data?.new_in_window?.distribution || [];
  const newByPlan = Object.fromEntries(newInWindow.map((r) => [r.plan, r.new_subscriptions]));
  const windowLabels = { day: 'Last 24 hours', week: 'Last 7 days', month: 'Last 30 days', custom: 'Custom range' };

  return (
    <SectionCard title="Plans" description="Current subscriber count per plan, plus new subscriptions started within a selected window.">
      <div className="filters-row">
        <select value={windowPreset} onChange={(e) => setWindowPreset(e.target.value)}>
          <option value="day">Last 24 hours</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
          <option value="custom">Custom range</option>
        </select>
        {windowPreset === 'custom' && (
          <>
            <label>From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
            <label>To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
          </>
        )}
      </div>
      <Loading query={query} />
      {query.data && (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Current subscribers</th>
                  <th>% of base</th>
                  <th>New in window ({windowLabels[windowPreset]})</th>
                </tr>
              </thead>
              <tbody>
                {distribution.map((row) => (
                  <tr key={row.plan}>
                    <td><StatusBadge value={row.plan} /></td>
                    <td>{row.users}</td>
                    <td>{row.percentage}%</td>
                    <td>{newByPlan[row.plan] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="metrics-grid">
            <MetricCard label="Billing conflicts" value={query.data.current_totals?.billing_conflicts ?? 0} />
            <MetricCard label={`New subscriptions (${windowLabels[windowPreset]})`} value={query.data.new_in_window?.total ?? 0} />
          </div>
          <h3 className="section-title">New Subscriptions by Plan ({windowLabels[windowPreset]})</h3>
          <div className="chart-wrap chart-wrap-half">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={newInWindow} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="plan" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="new_subscriptions" fill={CHART.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </SectionCard>
  );
}

export function Subscriptions() {
  const [page,setPage]=useState(1),[q,setQ]=useState(''),[status,setStatus]=useState(''),[plan,setPlan]=useState(''),[special,setSpecial]=useState(''),[expiring,setExpiring]=useState('');
  const params={page,size:25,q,status:status||undefined,plan:plan||undefined,expiring_days:expiring||undefined};
  if(special==='trial')params.trial=true;if(special==='canceling')params.canceling=true;if(special==='conflict')params.conflict=true;
  const query=useQuery({queryKey:['control-subs',page,q,status,plan,special,expiring],queryFn:()=>get('/admin/control/subscriptions',params)});
  const columns=[{key:'user',label:'User',render:r=><Link to={`/users/${r.user_id}`}>{r.user}</Link>},{key:'email',label:'Email'},{key:'plan',label:'Plan',render:r=><StatusBadge value={r.plan}/>},{key:'status',label:'Status',render:r=><StatusBadge value={r.status}/>},{key:'period_end',label:'Renews / Ends',render:r=>when(r.period_end)},{key:'days',label:'Days remaining',render:r=>r.time.label},{key:'auto_renew',label:'Auto renew',render:r=>r.auto_renew?'Yes':'No'},{key:'conflict',label:'Conflict',render:r=>r.conflict?<StatusBadge value="Conflict"/>:'—'}];
  const change=setter=>e=>{setter(e.target.value);setPage(1)};
  return <div><h1>Subscriptions</h1>
    <PlanSummaryPanel />
    <div className="filters-row"><input value={q} onChange={change(setQ)} placeholder="Search user or email…"/><input value={plan} onChange={change(setPlan)} placeholder="Exact plan name…"/><select value={status} onChange={change(setStatus)}><option value="">All statuses</option>{['active','trialing','past_due','canceled','free','billing_conflict'].map(x=><option key={x}>{x}</option>)}</select><select value={special} onChange={change(setSpecial)}><option value="">All states</option><option value="trial">Trials</option><option value="canceling">Canceling</option><option value="conflict">Billing conflicts</option></select><select value={expiring} onChange={change(setExpiring)}><option value="">Any end date</option><option value="7">Ending in 7 days</option><option value="30">Ending in 30 days</option></select></div><div className="metrics-grid">{Object.entries(query.data?.summary||{}).map(([k,v])=><MetricCard key={k} label={k.replaceAll('_',' ')} value={v}/>)}</div><Loading query={query}/>{query.data&&<DataTable columns={columns} rows={query.data.items.map(x=>({...x,id:x.user_id}))} page={page} total={query.data.total} size={25} onPageChange={setPage}/>}</div>;
}

export function UserDetail() {
 const {id}=useParams(); const q=useQuery({queryKey:['control-user',id],queryFn:()=>get(`/admin/control/users/${id}`)}); if(q.isLoading||q.isError)return <Loading query={q}/>; const d=q.data;
 const accountRows=[['Email',d.account.email],['Status',<StatusBadge value={d.account.status}/>],['Role',d.account.role],['Joined',when(d.account.created_at)],['Last active',when(d.account.last_active_at)],['Onboarding',d.account.onboarding_completed?'Complete':'Incomplete'],['Location',[d.account.country,d.account.continent].filter(Boolean).join(', ')||'—']];
 const subscriptionRows=[['Plan',d.subscription.plan],['Status',<StatusBadge value={d.subscription.status}/>],['Renews / ends',when(d.subscription.current_period_end)],['Time remaining',d.subscription.time?.label],['Auto renew',d.subscription.cancel_at_period_end?'No':'Yes'],['Last synchronized',when(d.subscription.last_sync_at)]];
 const activityRows=Object.entries(d.activity).map(([key,value])=>[key.replaceAll('_',' '),value]);
 return <div><Link to="/users">← Users</Link><PageHeader title={d.account.name} description={d.account.email}/><div className="detail-grid"><SectionCard title="Account"><DetailRows rows={accountRows}/></SectionCard><SectionCard title="Subscription" className={d.subscription.conflict?'danger-zone':''}><DetailRows rows={subscriptionRows}/></SectionCard><SectionCard title="Credit balances"><DetailRows rows={Object.entries(d.credits).filter(([,v])=>typeof v!=='object').map(([k,v])=>[k.replaceAll('_',' '),v])}/></SectionCard><SectionCard title="Activity and learning"><DetailRows rows={activityRows}/></SectionCard></div><SectionCard title="Invoices">{d.invoices.length?json(d.invoices):<EmptyState title="No invoices" description="This account has no synchronized invoices."/>}</SectionCard><SectionCard title="Credit purchases">{d.credit_purchases.length?json(d.credit_purchases):<EmptyState title="No credit purchases" description="This account has not purchased additional credits."/>}</SectionCard><SectionCard title="Recent credit ledger">{d.credit_ledger.length?json(d.credit_ledger):<EmptyState title="No credit activity" description="No ledger entries are available for this account."/>}</SectionCard></div>;
}

export function BillingOperations(){const qc=useQueryClient();const q=useQuery({queryKey:['billing-ops'],queryFn:()=>get('/admin/control/billing-operations')});const reconcile=useMutation({mutationFn:()=>client.post('/admin/billing/reconcile'),onSuccess:()=>qc.invalidateQueries({queryKey:['billing-ops']})});return <div><div className="section-title"><h1>Billing Operations</h1><button disabled={reconcile.isPending} onClick={()=>{if(window.confirm('Run explicit Stripe reconciliation now?'))reconcile.mutate()}}>{reconcile.isPending?'Reconciling…':'Reconcile Stripe'}</button></div><p className="text-muted">Uses synchronized billing facts. Reconciliation is explicit and audited; tables never fetch Stripe once per row.</p><Loading query={q}/>{q.data&&<><div className="metrics-grid">{Object.entries(q.data.summary).map(([k,v])=><MetricCard key={k} label={k.replaceAll('_',' ')} value={v}/>)}</div><h3 className="section-title">Billing Health Signals</h3><MiniBarChart data={Object.entries(q.data.summary).map(([k,v])=>({label:k.replaceAll('_',' '),count:v}))} dataKey="count" fill={CHART.quaternary} layout="vertical" height={Math.max(180,Object.keys(q.data.summary).length*36)} /><h2>Failed / processing webhooks</h2>{json(q.data.events)}<h2>Recent invoices</h2>{json(q.data.invoices)}<h2>Credit purchases</h2>{json(q.data.credit_purchases)}</>}</div>}
export function AuditLog(){
 const [page,setPage]=useState(1),[qv,setQv]=useState(''),[action,setAction]=useState(''),[resource,setResource]=useState(''),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState('');
 const q=useQuery({queryKey:['audit',page,qv,action,resource,dateFrom,dateTo],queryFn:()=>get('/admin/control/audit-log',{page,size:50,q:qv,action:action||undefined,resource:resource||undefined,date_from:dateFrom||undefined,date_to:dateTo||undefined})});
 const cols=[{key:'created_at',label:'Time',render:r=>when(r.created_at)},{key:'admin_email',label:'Admin'},{key:'action',label:'Action'},{key:'resource_type',label:'Resource'},{key:'resource_id',label:'Target'},{key:'reason',label:'Reason'},{key:'metadata',label:'Safe changes',render:r=><details><summary>View</summary>{json({previous:r.previous,new:r.new,metadata:r.metadata,request_id:r.request_id})}</details>}];
 const change=setter=>e=>{setter(e.target.value);setPage(1)};
 return <div><h1>Admin Audit Log</h1><div className="filters-row"><input value={qv} onChange={change(setQv)} placeholder="Search admin or user ID…"/><input value={action} onChange={change(setAction)} placeholder="Action…"/><input value={resource} onChange={change(setResource)} placeholder="Resource type…"/><label>From <input type="date" value={dateFrom} onChange={change(setDateFrom)}/></label><label>To <input type="date" value={dateTo} onChange={change(setDateTo)}/></label></div><Loading query={q}/>{q.data&&<DataTable columns={cols} rows={q.data.items} page={page} total={q.data.total} size={50} onPageChange={setPage}/>}</div>
}
export function ActivityAnalytics(){const a=useQuery({queryKey:['activity'],queryFn:()=>get('/admin/control/activity-analytics')});const o=useQuery({queryKey:['onboarding'],queryFn:()=>get('/admin/control/onboarding-analytics')});return <div><h1>Growth & Activity</h1><Loading query={a}/><Loading query={o}/>{a.data&&<><p>{a.data.definition}</p><div className="metrics-grid">{['dau','wau','mau','returning_users_30d','inactive_users_30d'].map(k=><MetricCard key={k} label={k.replaceAll('_',' ')} value={a.data[k]}/>)}</div></>}{o.data&&<><h2>Onboarding (UTC)</h2><div className="metrics-grid">{['today','yesterday','last_7_days','last_30_days'].map(k=><MetricCard key={k} label={k.replaceAll('_',' ')} value={`${o.data[k].completed}/${o.data[k].registrations} (${o.data[k].completion_pct}%)`}/>)}</div><h3 className="section-title">Registrations vs. Onboarding Completions (Last 30 Days)</h3><div className="chart-wrap"><ResponsiveContainer width="100%" height={300}><LineChart data={o.data.daily} margin={{top:8,right:16,left:0,bottom:8}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date" tickFormatter={(v)=>v.slice(5)}/><YAxis allowDecimals={false}/><Tooltip/><Legend/><Line type="monotone" dataKey="registrations" name="Registrations" stroke={CHART.primary} strokeWidth={2} dot={false}/><Line type="monotone" dataKey="started" name="Started Onboarding" stroke={CHART.tertiary} strokeWidth={2} dot={false}/><Line type="monotone" dataKey="completed" name="Completed Onboarding" stroke={CHART.secondary} strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div></>}</div>}
const LEADERBOARD_METRICS = [
  { value: 'xp', label: 'Total XP' },
  { value: 'avg_score', label: 'Average Score' },
  { value: 'most_quizzes', label: 'Quizzes Completed' },
  { value: 'cards_mastered', label: 'Cards Mastered' },
];

export function LeaderboardMonitoring() {
  const [period, setPeriod] = useState('weekly');
  const [metric, setMetric] = useState('xp');
  const q = useQuery({
    queryKey: ['leaderboard-monitor', period, metric],
    queryFn: () => get('/admin/control/leaderboards', { period, metric }),
  });
  const cols = [
    { key: 'rank', label: 'Rank' },
    { key: 'full_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'country', label: 'Country', render: (r) => r.country || '—' },
    { key: 'value', label: q.data?.metric_label || 'Value', render: (r) => r.value.toLocaleString() },
    { key: 'current_streak', label: 'Streak (current)' },
    { key: 'longest_streak', label: 'Streak (longest)' },
    { key: 'suspicious', label: 'Flag', render: (r) => r.suspicious ? <StatusBadge value="Suspicious" tone="critical" /> : '—' },
  ];
  return (
    <div>
      <PageHeader title="Leaderboard" description="Matches the ranking structure real users see, plus admin-only trend and cohort insight." />
      <div className="filters-row">
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="weekly">This week</option>
          <option value="all_time">All time</option>
        </select>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          {LEADERBOARD_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <Loading query={q} />
      {q.data && (
        <>
          <p className="text-muted">{q.data.anomaly_rule}</p>
          <div className="metrics-grid">
            <MetricCard label="Total ranked users" value={q.data.total_ranked} />
            <MetricCard label="Flagged as suspicious (top 50)" value={q.data.items.filter((x) => x.suspicious).length} />
          </div>
          <h3 className="section-title">Platform XP Trend (Last 30 Days)</h3>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={q.data.xp_trend_daily} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="xp" name="XP Awarded" stroke={CHART.primary} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <h3 className="section-title">Top 50 by Country</h3>
          <div className="chart-wrap chart-wrap-half">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={q.data.by_country} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="country" width={120} />
                <Tooltip />
                <Bar dataKey="users" fill={CHART.tertiary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <h3 className="section-title">Top 50 Ranking</h3>
          <DataTable columns={cols} rows={q.data.items.map((x) => ({ ...x, id: x.user_id }))} page={1} total={q.data.items.length} size={q.data.items.length || 1} onPageChange={() => {}} />
        </>
      )}
    </div>
  );
}
export function Security(){const q=useQuery({queryKey:['security'],queryFn:()=>get('/admin/control/security')});return <div><h1>Security & Risk</h1><Loading query={q}/>{q.data&&<><MetricCard label="Banned users" value={q.data.banned_users}/><h2>Role changes</h2>{json(q.data.recent_role_changes)}<h2>Destructive actions</h2>{json(q.data.recent_destructive_actions)}<h2>Credit anomalies</h2><p>{q.data.credit_rule}</p>{json(q.data.suspicious_credit_usage)}</>}</div>}
export function ContentDetail(){const {id}=useParams();const navigate=useNavigate();const qc=useQueryClient();const q=useQuery({queryKey:['content-detail',id],queryFn:()=>get(`/admin/control/content/${id}`)});const flag=useMutation({mutationFn:reason=>client.post(`/admin/books/${id}/flag`,null,{params:{reason}}),onSuccess:()=>qc.invalidateQueries({queryKey:['content-detail',id]})});const remove=useMutation({mutationFn:reason=>client.delete(`/admin/books/${id}`,{params:{reason}}),onSuccess:()=>navigate('/content')});const ask=(kind)=>{const reason=window.prompt(`${kind === 'delete' ? 'Permanent deletion' : 'Moderation'} reason (required):`);if(!reason||reason.trim().length<3)return;if(kind==='delete'){if(window.confirm('Permanently delete this book and its related study content? This cannot be undone.'))remove.mutate(reason.trim())}else flag.mutate(reason.trim())};return <div><Link to="/content">← Content</Link><h1>Content Details</h1><Loading query={q}/>{q.data&&<><div className="detail-actions">{!q.data.flagged&&<button onClick={()=>ask('flag')}>Flag content</button>}<button className="btn-danger" onClick={()=>ask('delete')}>Permanently delete</button></div>{json(q.data)}</>}</div>}
export function CreditMonitoring(){const [page,setPage]=useState(1);const q=useQuery({queryKey:['credit-monitor',page],queryFn:()=>get('/admin/control/credits',{page,size:50})});const cols=[{key:'created_at',label:'Time',render:r=>when(r.created_at)},{key:'user_id',label:'User',render:r=><Link to={`/users/${r.user_id}`}>{r.user_id}</Link>},{key:'pool',label:'Pool'},{key:'amount',label:'Amount'},{key:'reason',label:'Reason'},{key:'expires_at',label:'Expires',render:r=>when(r.expires_at)}];return <div><h1>Usage & Credits</h1><Loading query={q}/>{q.data&&<><p>{q.data.authority}</p><div className="metrics-grid">{q.data.pools.map(x=><MetricCard key={x.pool} label={`${x.pool}: remaining / granted / used`} value={`${x.current_net} / ${x.granted} / ${x.consumed}`}/>)}</div><h3 className="section-title">Credit Pools: Granted vs. Consumed vs. Remaining</h3><div className="chart-wrap"><ResponsiveContainer width="100%" height={280}><BarChart data={q.data.pools} margin={{top:8,right:16,left:0,bottom:8}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="pool"/><YAxis allowDecimals={false}/><Tooltip/><Legend/><Bar dataKey="granted" name="Granted" fill={CHART.tertiary} radius={[4,4,0,0]}/><Bar dataKey="consumed" name="Consumed" fill={CHART.quaternary} radius={[4,4,0,0]}/><Bar dataKey="current_net" name="Remaining" fill={CHART.primary} radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div><DataTable columns={cols} rows={q.data.items} page={page} total={q.data.total} size={50} onPageChange={setPage}/></>}</div>}
export function LearningActivity(){const q=useQuery({queryKey:['learning-monitor'],queryFn:()=>get('/admin/control/learning')});return <div><h1>Learning Activity</h1><Loading query={q}/>{q.data&&<><div className="metrics-grid">{Object.entries(q.data).filter(([,v])=>typeof v==='number').map(([k,v])=><MetricCard key={k} label={k.replaceAll('_',' ')} value={v}/>)}</div><h3 className="section-title">Learning Activity by Metric</h3><MiniBarChart data={Object.entries(q.data).filter(([,v])=>typeof v==='number').map(([k,v])=>({label:k.replaceAll('_',' '),count:v}))} dataKey="count" fill={CHART.secondary} layout="vertical" height={Math.max(200,Object.entries(q.data).filter(([,v])=>typeof v==='number').length*36)} /><p>{q.data.mastery_definition}</p></>}</div>}
