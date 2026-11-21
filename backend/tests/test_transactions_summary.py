from httpx import AsyncClient

from tests.helpers import bearer, register


async def create(
    client: AsyncClient,
    token: str,
    *,
    description: str,
    amount: str,
    category: str | None = None,
    occurred_on: str | None = None,
) -> dict:
    payload: dict[str, object] = {"description": description, "amount": amount}
    if category is not None:
        payload["category"] = category
    if occurred_on is not None:
        payload["occurred_on"] = occurred_on
    response = await client.post("/api/v1/transactions", json=payload, headers=bearer(token))
    assert response.status_code == 201, response.text
    return response.json()


async def test_summary_aggregates_income_and_expenses(client: AsyncClient) -> None:
    user = await register(client, email="summary@example.com")
    token = user["access_token"]

    await create(client, token, description="Salary", amount="2500.00", category="Work")
    await create(client, token, description="Rent", amount="-1200.00", category="Housing")
    await create(client, token, description="Coffee", amount="-4.50", category="Food")

    response = await client.get("/api/v1/transactions/summary", headers=bearer(token))
    assert response.status_code == 200
    body = response.json()
    assert body["income"] == "2500.00"
    assert body["expenses"] == "1204.50"
    assert body["balance"] == "1295.50"
    assert body["count"] == 3
    assert body["currency"] == "USD"


async def test_summary_respects_filters(client: AsyncClient) -> None:
    user = await register(client, email="summary-filter@example.com")
    token = user["access_token"]

    await create(
        client,
        token,
        description="Salary",
        amount="1000.00",
        category="Work",
        occurred_on="2026-01-05",
    )
    await create(
        client,
        token,
        description="Groceries",
        amount="-80.00",
        category="Food",
        occurred_on="2026-02-05",
    )
    await create(
        client,
        token,
        description="Dinner",
        amount="-40.00",
        category="Food",
        occurred_on="2026-03-05",
    )

    response = await client.get(
        "/api/v1/transactions/summary?category=Food&from_date=2026-02-01&to_date=2026-02-28",
        headers=bearer(token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["income"] == "0.00"
    assert body["expenses"] == "80.00"
    assert body["balance"] == "-80.00"
    assert body["count"] == 1


async def test_list_filters_search_sort_and_pagination(client: AsyncClient) -> None:
    user = await register(client, email="filters@example.com")
    token = user["access_token"]

    await create(client, token, description="Coffee shop", amount="-4.50", category="Food")
    await create(client, token, description="Salary", amount="2500.00", category="Work")
    await create(client, token, description="Bus pass", amount="-30.00", category="Travel")
    await create(client, token, description="Lunch", amount="-12.00", category="Food")

    search = await client.get("/api/v1/transactions?search=coffee", headers=bearer(token))
    assert search.status_code == 200
    assert [item["description"] for item in search.json()["items"]] == ["Coffee shop"]

    food = await client.get("/api/v1/transactions?category=Food", headers=bearer(token))
    assert food.json()["total"] == 2

    income = await client.get("/api/v1/transactions?kind=income", headers=bearer(token))
    assert [item["description"] for item in income.json()["items"]] == ["Salary"]

    ascending = await client.get("/api/v1/transactions?sort=amount_asc", headers=bearer(token))
    assert [item["description"] for item in ascending.json()["items"]] == [
        "Bus pass",
        "Lunch",
        "Coffee shop",
        "Salary",
    ]

    page = await client.get(
        "/api/v1/transactions?limit=2&offset=1&sort=date_desc", headers=bearer(token)
    )
    body = page.json()
    assert body["total"] == 4
    assert body["limit"] == 2
    assert body["offset"] == 1
    assert len(body["items"]) == 2
    assert page.headers["x-total-count"] == "4"


async def test_invalid_date_range_is_rejected(client: AsyncClient) -> None:
    user = await register(client, email="dates@example.com")

    response = await client.get(
        "/api/v1/transactions?from_date=2026-02-01&to_date=2026-01-01",
        headers=bearer(user["access_token"]),
    )
    assert response.status_code == 422


async def test_categories_are_distinct_and_sorted(client: AsyncClient) -> None:
    user = await register(client, email="categories@example.com")
    token = user["access_token"]

    await create(client, token, description="A", amount="-1.00", category="Travel")
    await create(client, token, description="B", amount="-1.00", category="Food")
    await create(client, token, description="C", amount="-1.00", category="Food")
    await create(client, token, description="D", amount="-1.00")

    response = await client.get("/api/v1/transactions/categories", headers=bearer(token))
    assert response.status_code == 200
    assert response.json() == ["Food", "Travel"]


async def test_transaction_payload_validation(client: AsyncClient) -> None:
    user = await register(client, email="validation@example.com")
    token = user["access_token"]

    zero = await client.post(
        "/api/v1/transactions",
        json={"description": "Zero", "amount": "0.00"},
        headers=bearer(token),
    )
    assert zero.status_code == 422

    too_precise = await client.post(
        "/api/v1/transactions",
        json={"description": "Precise", "amount": "1.001"},
        headers=bearer(token),
    )
    assert too_precise.status_code == 422

    too_large = await client.post(
        "/api/v1/transactions",
        json={"description": "Huge", "amount": "10000000000.00"},
        headers=bearer(token),
    )
    assert too_large.status_code == 422

    blank = await client.post(
        "/api/v1/transactions",
        json={"description": "   ", "amount": "1.00"},
        headers=bearer(token),
    )
    assert blank.status_code == 422


async def test_created_transaction_includes_timestamps(client: AsyncClient) -> None:
    user = await register(client, email="timestamps@example.com")
    created = await create(client, user["access_token"], description="Coffee", amount="-3.00")

    assert created["created_at"]
    assert created["updated_at"]
