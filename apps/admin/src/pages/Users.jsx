import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import client from "../api/client";
import DataTable from "../components/DataTable";
import { getApiErrorMessage } from "../lib/apiError";
import { Link } from "react-router-dom";
import { PageHeader, StatusBadge } from "../components/AdminUI";

const AGE_GROUP_OPTIONS = [
  "",
  "0-9",
  "10-17",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
];

const GENDER_LABELS = {
  male: "Male",
  female: "Female",
  prefer_not_to_say: "Prefer not to say",
};

const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "age", label: "Age (youngest first)" },
  { value: "-age", label: "Age (oldest first)" },
];

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [plan, setPlan] = useState("");
  const [country, setCountry] = useState("");
  const [continent, setContinent] = useState("");
  const [occupation, setOccupation] = useState("");
  const [gender, setGender] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: filterOptions } = useQuery({
    queryKey: ["admin-users-filter-options"],
    queryFn: async () => {
      const { data: res } = await client.get("/admin/users/filter-options");
      return res;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-users", debouncedQ, ageGroup, plan, country, continent, occupation, gender, statusFilter, sort, page],
    queryFn: async () => {
      const { data: res } = await client.get("/admin/users", {
        params: {
          q: debouncedQ,
          age_group: ageGroup || undefined,
          plan: plan || undefined,
          country: country || undefined,
          continent: continent || undefined,
          occupation: occupation || undefined,
          gender: gender || undefined,
          status: statusFilter || undefined,
          sort,
          page,
          size: 20,
        },
      });
      return res;
    },
    retry: 1,
    refetchOnWindowFocus: true,
  });

  const resetPage = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  const patchUser = useMutation({
    mutationFn: ({ id, body }) => client.patch(`/admin/users/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirm(null);
    },
  });

  const runAction = useCallback(
    (row, action) => {
      const actions = {
        makeAdmin: {
          title: "Make admin",
          message: `Grant admin role to ${row.full_name}?`,
          body: { role: "admin" },
        },
        makeStudent: {
          title: "Make student",
          message: `Set ${row.full_name} to student role?`,
          body: { role: "student" },
        },
        ban: {
          title: "Ban account",
          message: `Ban ${row.full_name}? They will not be able to sign in.`,
          body: { is_banned: true },
        },
        unban: {
          title: "Unban account",
          message: `Restore access for ${row.full_name}?`,
          body: { is_banned: false },
        },
      };
      const cfg = actions[action];
      setConfirm({
        ...cfg,
        onConfirm: () => patchUser.mutate({ id: row.id, body: cfg.body }),
      });
    },
    [patchUser],
  );

  const columns = [
    { key: "full_name", label: "User", render: (row) => <Link to={`/users/${row.id}`}>{row.full_name}</Link> },
    { key: "email", label: "Email" },
    { key: "plan", label: "Plan", render: (row) => <StatusBadge value={row.plan} /> },
    { key: "is_banned", label: "Status", render: (row) => <StatusBadge value={row.is_banned ? "Banned" : "Active"} /> },
    { key: "created_at", label: "Joined", render: (row) => formatDate(row.created_at) },
    { key: "last_active_at", label: "Last active", render: (row) => formatDate(row.last_active_at) },
    { key: "onboarding_completed", label: "Onboarding", render: (row) => row.onboarding_completed ? "Complete" : "Incomplete" },
    { key: "role", label: "Role", render: (row) => <StatusBadge value={row.role} /> },
    {
      key: "date_of_birth",
      label: "Date of Birth",
      render: (row) => formatDate(row.date_of_birth),
    },
    {
      key: "age",
      label: "Current Age",
      render: (row) => (row.age != null ? row.age : "—"),
    },
    {
      key: "age_group",
      label: "Age Group",
      render: (row) => row.age_group || "—",
    },
    {
      key: "gender",
      label: "Gender",
      render: (row) => GENDER_LABELS[row.gender] || "—",
    },
    {
      key: "country",
      label: "Country",
      render: (row) => row.country || "—",
    },
    {
      key: "custom_country",
      label: "Custom Country",
      render: (row) => row.custom_country || "—",
    },
    {
      key: "continent",
      label: "Continent",
      render: (row) => row.continent || "—",
    },
    {
      key: "occupation",
      label: "Occupation",
      render: (row) => row.occupation || "—",
    },
    {
      key: "job_title",
      label: "Job Title",
      render: (row) => row.job_title || "—",
    },
  ];

  return (
    <div>
      <PageHeader title="Users" description="Search and manage MindFlip accounts." />
      <div className="filters-row">
        <input
          className="search-input"
          type="search"
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="filter-select"
          value={ageGroup}
          onChange={resetPage(setAgeGroup)}
        >
          <option value="">All age groups</option>
          {AGE_GROUP_OPTIONS.filter(Boolean).map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select className="filter-select" value={plan} onChange={resetPage(setPlan)}>
          <option value="">All plans</option>
          {(filterOptions?.plans ?? []).map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.label}
            </option>
          ))}
        </select>
        <select className="filter-select" value={statusFilter} onChange={resetPage(setStatusFilter)}>
          <option value="">All statuses</option>
          {(filterOptions?.statuses ?? []).map((s) => (
            <option key={s} value={s}>
              {s === "banned" ? "Banned" : "Active"}
            </option>
          ))}
        </select>
        <select className="filter-select" value={continent} onChange={resetPage(setContinent)}>
          <option value="">All continents</option>
          {(filterOptions?.continents ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="filter-select" value={country} onChange={resetPage(setCountry)}>
          <option value="">All countries</option>
          {(filterOptions?.countries ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="filter-select" value={occupation} onChange={resetPage(setOccupation)}>
          <option value="">All occupations</option>
          {(filterOptions?.occupations ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select className="filter-select" value={gender} onChange={resetPage(setGender)}>
          <option value="">All genders</option>
          {(filterOptions?.genders ?? []).map((g) => (
            <option key={g} value={g}>
              {GENDER_LABELS[g] || g}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="filters-row">
        <button type="button" className="btn-secondary" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh users"}
        </button>
        {(ageGroup || plan || statusFilter || continent || country || occupation || gender || q) && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setQ("");
              setDebouncedQ("");
              setAgeGroup("");
              setPlan("");
              setCountry("");
              setContinent("");
              setOccupation("");
              setGender("");
              setStatusFilter("");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        )}
        {!isLoading && !isError && (
          <span>{data?.total ?? 0} users found</span>
        )}
      </div>
      {isLoading ? (
        <p>Loading…</p>
      ) : isError ? (
        <div className="fetch-error-banner" role="alert">
          <strong>Users could not be loaded.</strong>{" "}
          {getApiErrorMessage(error, "Check that the admin app and API are using the same environment.")}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          page={page}
          total={data?.total ?? 0}
          size={20}
          onPageChange={setPage}
          renderActions={(row) => (
            <select
              className="action-select"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                e.target.value = "";
                if (v) runAction(row, v);
              }}
            >
              <option value="">Actions…</option>
              {row.role !== "admin" && (
                <option value="makeAdmin">Make Admin</option>
              )}
              {row.role !== "student" && (
                <option value="makeStudent">Make Student</option>
              )}
              {!row.is_banned && <option value="ban">Ban Account</option>}
              {row.is_banned && <option value="unban">Unban Account</option>}
            </select>
          )}
        />
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
