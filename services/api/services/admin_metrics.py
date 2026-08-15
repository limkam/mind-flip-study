"""Pure, testable definitions used by control-center metrics."""


def rank_plan_counts(counts: dict[str, int], *, conflicts: int = 0) -> dict:
    total = sum(counts.values())
    levels = sorted(set(counts.values()), reverse=True)
    all_tied = len(counts) > 1 and len(levels) == 1

    def rank_at(index: int) -> list[dict]:
        if index >= len(levels):
            return []
        value = levels[index]
        return [
            {"plan": name, "users": count, "percentage": round(count / total * 100, 1) if total else 0}
            for name, count in sorted(counts.items()) if count == value
        ]

    return {
        "included_users": total,
        "billing_conflicts": conflicts,
        "all_tied": all_tied,
        "distribution": [
            {"plan": name, "users": count, "percentage": round(count / total * 100, 1) if total else 0}
            for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        ],
        "highest": rank_at(0),
        # A single shared level is one tie, not three contradictory ranks.
        "second_highest": [] if all_tied else rank_at(1),
        "lowest": [] if all_tied else (rank_at(len(levels) - 1) if levels else []),
    }
