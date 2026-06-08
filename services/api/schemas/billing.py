from pydantic import BaseModel, Field


class CheckoutUrlResponse(BaseModel):
    checkout_url: str = Field(..., description="Stripe-hosted Checkout URL")
