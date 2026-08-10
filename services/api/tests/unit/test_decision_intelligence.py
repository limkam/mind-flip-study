from schemas.decision_intelligence import DecisionPreferences, ScenarioInput
from services.decision_intelligence_service import minimal_pdf, simulate_baseline


def test_scenario_is_deterministic_and_does_not_mutate_input():
    scenario = ScenarioInput(
        price_change=1,
        ai_cost_reduction_pct=20,
        conversion_change_pct=5,
        churn_reduction_pct=2,
    )
    before = scenario.model_dump()
    result = simulate_baseline(1000, 400, 5000, 100, 100, scenario)
    assert result["mrr"] == 1170
    assert result["profit"] == 590
    assert scenario.model_dump() == before


def test_scenario_margin_and_runway_are_bounded_by_real_costs():
    result = simulate_baseline(0, -10, 0, 0, 0, ScenarioInput())
    assert result["mrr"] == 0
    assert result["runway_months"] == 0


def test_preferences_validate_supported_watchlist_types():
    prefs = DecisionPreferences.model_validate(
        {
            "watchlist": [{"type": "model", "id": "sonnet", "label": "Claude Sonnet"}],
            "goals": [{"metric": "mrr", "label": "MRR target", "target": 5000}],
        }
    )
    assert prefs.watchlist[0].type == "model"
    assert prefs.goals[0].target == 5000


def test_weekly_pdf_has_valid_header_and_xref():
    pdf = minimal_pdf("# Executive Report\nRevenue is healthy")
    assert pdf.startswith(b"%PDF-1.4")
    assert b"xref" in pdf
