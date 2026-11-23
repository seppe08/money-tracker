from datetime import date, timedelta

from httpx import AsyncClient

from tests.helpers import bearer, register


async def create_txn(client: AsyncClient, token: str, **overrides: object) -> dict:
    payload = {
        "description": "Item",
        "amount": "-10.00",
        "category": "Food",
        "occurred_on": date.today().isoformat(),
    }
    payload.update(overrides)
    response = await client.post("/api/v1/transactions", json=payload, headers=bearer(token))
    assert response.status_code == 201, response.text
    return response.json()


async def test_analytics_require_auth(client: AsyncClient) -> None:
    res1 = await client.get("/api/v1/analytics/categories")
    assert res1.status_code == 401
    res2 = await client.get("/api/v1/analytics/monthly")
    assert res2.status_code == 401


async def test_category_analytics_empty(client: AsyncClient) -> None:
    alice = await register(client, email="empty_analytics@example.com")
    token = alice["access_token"]

    res = await client.get("/api/v1/analytics/categories", headers=bearer(token))
    assert res.status_code == 200
    data = res.json()
    assert data["items"] == []
    assert data["total_expenses"] == "0.00"
    assert data["currency"] == "USD"


async def test_category_analytics_aggregates_and_percentages(client: AsyncClient) -> None:
    alice = await register(client, email="cat_analytics@example.com")
    token = alice["access_token"]

    today = date.today().isoformat()
    # Food: 20 + 30 = 50 (50%)
    await create_txn(client, token, amount="-20.00", category="Food", occurred_on=today)
    await create_txn(client, token, amount="-30.00", category="Food", occurred_on=today)
    # Transport: 30 (30%)
    await create_txn(client, token, amount="-30.00", category="Transport", occurred_on=today)
    # Uncategorized: 20 (20%)
    await create_txn(client, token, amount="-20.00", category=None, occurred_on=today)
    # Income: 1000 (must be excluded from expense category analytics)
    await create_txn(client, token, amount="1000.00", category="Salary", occurred_on=today)

    res = await client.get("/api/v1/analytics/categories", headers=bearer(token))
    assert res.status_code == 200
    data = res.json()

    assert data["total_expenses"] == "100.00"
    assert len(data["items"]) == 3

    # Sorted by amount descending
    item0 = data["items"][0]
    assert item0["category"] == "Food"
    assert item0["amount"] == "50.00"
    assert item0["count"] == 2
    assert item0["percentage"] == 50.0

    item1 = data["items"][1]
    assert item1["category"] == "Transport"
    assert item1["amount"] == "30.00"
    assert item1["count"] == 1
    assert item1["percentage"] == 30.0

    item2 = data["items"][2]
    assert item2["category"] == "Uncategorized"
    assert item2["amount"] == "20.00"
    assert item2["count"] == 1
    assert item2["percentage"] == 20.0


async def test_category_analytics_date_filtering(client: AsyncClient) -> None:
    alice = await register(client, email="date_analytics@example.com")
    token = alice["access_token"]

    today = date.today()
    last_week = today - timedelta(days=7)
    next_week = today + timedelta(days=7)

    await create_txn(
        client, token, amount="-15.00", category="Snacks", occurred_on=today.isoformat()
    )
    await create_txn(
        client, token, amount="-25.00", category="Groceries", occurred_on=last_week.isoformat()
    )

    # Filter to today only
    res = await client.get(
        f"/api/v1/analytics/categories?from_date={today.isoformat()}&to_date={today.isoformat()}",
        headers=bearer(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["category"] == "Snacks"
    assert data["total_expenses"] == "15.00"

    # Invalid range: from_date > to_date
    invalid_res = await client.get(
        f"/api/v1/analytics/categories?from_date={next_week.isoformat()}&to_date={today.isoformat()}",
        headers=bearer(token),
    )
    assert invalid_res.status_code == 422


async def test_category_analytics_user_isolation(client: AsyncClient) -> None:
    alice = await register(client, email="iso_alice@example.com")
    bob = await register(client, email="iso_bob@example.com")

    await create_txn(client, alice["access_token"], amount="-100.00", category="AliceOnly")
    await create_txn(client, bob["access_token"], amount="-40.00", category="BobOnly")

    alice_res = await client.get(
        "/api/v1/analytics/categories", headers=bearer(alice["access_token"])
    )
    assert alice_res.status_code == 200
    assert alice_res.json()["total_expenses"] == "100.00"
    assert [i["category"] for i in alice_res.json()["items"]] == ["AliceOnly"]

    bob_res = await client.get("/api/v1/analytics/categories", headers=bearer(bob["access_token"]))
    assert bob_res.status_code == 200
    assert bob_res.json()["total_expenses"] == "40.00"
    assert [i["category"] for i in bob_res.json()["items"]] == ["BobOnly"]


async def test_monthly_analytics(client: AsyncClient) -> None:
    alice = await register(client, email="monthly_analytics@example.com")
    token = alice["access_token"]

    today = date.today()
    # Add income and expense in current month
    await create_txn(
        client,
        token,
        amount="3500.00",
        description="Salary",
        category="Income",
        occurred_on=today.isoformat(),
    )
    await create_txn(
        client,
        token,
        amount="-1200.00",
        description="Rent",
        category="Housing",
        occurred_on=today.isoformat(),
    )

    res = await client.get("/api/v1/analytics/monthly?months=3", headers=bearer(token))
    assert res.status_code == 200
    data = res.json()
    assert len(data["items"]) == 3

    current_month_item = data["items"][-1]
    assert current_month_item["month"] == today.strftime("%Y-%m")
    assert current_month_item["income"] == "3500.00"
    assert current_month_item["expenses"] == "1200.00"
    assert current_month_item["net"] == "2300.00"

    # Query validation
    invalid_res = await client.get("/api/v1/analytics/monthly?months=0", headers=bearer(token))
    assert invalid_res.status_code == 422
    invalid_res2 = await client.get("/api/v1/analytics/monthly?months=25", headers=bearer(token))
    assert invalid_res2.status_code == 422
