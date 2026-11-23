from datetime import date

from httpx import AsyncClient

from tests.helpers import bearer, register


async def create_budget(
    client: AsyncClient, token: str, category: str, limit: str = "500.00"
) -> dict:
    res = await client.post(
        "/api/v1/budgets",
        json={"category": category, "monthly_limit": limit},
        headers=bearer(token),
    )
    return res


async def create_txn(client: AsyncClient, token: str, **overrides: object) -> dict:
    payload = {
        "description": "Item",
        "amount": "-50.00",
        "category": "Food",
        "occurred_on": date.today().isoformat(),
    }
    payload.update(overrides)
    res = await client.post("/api/v1/transactions", json=payload, headers=bearer(token))
    assert res.status_code == 201, res.text
    return res.json()


async def test_budgets_require_auth(client: AsyncClient) -> None:
    res = await client.get("/api/v1/budgets")
    assert res.status_code == 401
    res2 = await client.post(
        "/api/v1/budgets", json={"category": "Food", "monthly_limit": "100.00"}
    )
    assert res2.status_code == 401


async def test_create_budget_and_duplicate_conflict(client: AsyncClient) -> None:
    alice = await register(client, email="budget_alice@example.com")
    token = alice["access_token"]

    res = await create_budget(client, token, category="Food", limit="400.00")
    assert res.status_code == 201
    data = res.json()
    assert data["category"] == "Food"
    assert data["monthly_limit"] == "400.00"

    # Duplicate category (case-insensitive) returns 409
    dup = await create_budget(client, token, category=" food ", limit="500.00")
    assert dup.status_code == 409
    assert "already exists" in dup.json()["detail"]


async def test_list_budgets_with_spend_calculations(client: AsyncClient) -> None:
    alice = await register(client, email="budget_calc@example.com")
    token = alice["access_token"]

    await create_budget(client, token, category="Food", limit="500.00")
    await create_budget(client, token, category="Transport", limit="200.00")

    today = date.today().isoformat()
    # Food: -150 and -50 = 200 spent (40%)
    await create_txn(client, token, amount="-150.00", category="Food", occurred_on=today)
    await create_txn(client, token, amount="-50.00", category="Food", occurred_on=today)
    # Transport: -250 spent (125% -> over budget)
    await create_txn(client, token, amount="-250.00", category="Transport", occurred_on=today)

    res = await client.get("/api/v1/budgets", headers=bearer(token))
    assert res.status_code == 200
    data = res.json()

    assert data["total_budget"] == "700.00"
    assert data["total_spent"] == "450.00"
    assert len(data["items"]) == 2

    food = next(b for b in data["items"] if b["category"] == "Food")
    assert food["monthly_limit"] == "500.00"
    assert food["spent"] == "200.00"
    assert food["remaining"] == "300.00"
    assert food["percentage"] == 40.0
    assert food["is_over_budget"] is False

    transport = next(b for b in data["items"] if b["category"] == "Transport")
    assert transport["monthly_limit"] == "200.00"
    assert transport["spent"] == "250.00"
    assert transport["remaining"] == "-50.00"
    assert transport["percentage"] == 125.0
    assert transport["is_over_budget"] is True


async def test_update_and_delete_budget(client: AsyncClient) -> None:
    alice = await register(client, email="budget_crud@example.com")
    token = alice["access_token"]

    created = (await create_budget(client, token, category="Dining", limit="300.00")).json()
    b_id = created["id"]

    # Update limit
    patch_res = await client.patch(
        f"/api/v1/budgets/{b_id}",
        json={"monthly_limit": "350.00"},
        headers=bearer(token),
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["monthly_limit"] == "350.00"

    # Delete budget
    del_res = await client.delete(f"/api/v1/budgets/{b_id}", headers=bearer(token))
    assert del_res.status_code == 204

    # Second delete returns 404
    del_res2 = await client.delete(f"/api/v1/budgets/{b_id}", headers=bearer(token))
    assert del_res2.status_code == 404


async def test_budget_user_isolation(client: AsyncClient) -> None:
    alice = await register(client, email="b_alice@example.com")
    bob = await register(client, email="b_bob@example.com")

    created = (await create_budget(client, alice["access_token"], category="AliceCat")).json()
    b_id = created["id"]

    # Bob cannot update or delete Alice's budget
    patch_res = await client.patch(
        f"/api/v1/budgets/{b_id}",
        json={"monthly_limit": "999.00"},
        headers=bearer(bob["access_token"]),
    )
    assert patch_res.status_code == 404

    del_res = await client.delete(f"/api/v1/budgets/{b_id}", headers=bearer(bob["access_token"]))
    assert del_res.status_code == 404

    # Bob's list does not show Alice's budget
    list_res = await client.get("/api/v1/budgets", headers=bearer(bob["access_token"]))
    assert list_res.status_code == 200
    assert list_res.json()["items"] == []
