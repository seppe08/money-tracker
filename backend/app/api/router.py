from fastapi import APIRouter

from app.api.routes import analytics, auth, budgets, health, recurring, transactions, users

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(transactions.router)
api_router.include_router(analytics.router)
api_router.include_router(budgets.router)
api_router.include_router(recurring.router)
