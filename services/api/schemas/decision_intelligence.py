from typing import Literal

from pydantic import BaseModel, Field


class Goal(BaseModel):
    metric: str = Field(max_length=64)
    label: str = Field(max_length=100)
    target: float


class WatchItem(BaseModel):
    type: Literal[
        "customer", "plan", "country", "model", "segment", "feature_flag", "metric"
    ]
    id: str = Field(max_length=255)
    label: str = Field(max_length=255)


class DecisionPreferences(BaseModel):
    watchlist: list[WatchItem] = Field(default_factory=list, max_length=100)
    goals: list[Goal] = Field(default_factory=list, max_length=30)


class ScenarioInput(BaseModel):
    price_change: float = Field(0, ge=-1000, le=1000)
    ai_cost_reduction_pct: float = Field(0, ge=0, le=100)
    conversion_change_pct: float = Field(0, ge=-100, le=500)
    churn_reduction_pct: float = Field(0, ge=0, le=100)


class IntelligencePayload(BaseModel):
    model_config = {"extra": "allow"}
