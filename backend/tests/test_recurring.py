from datetime import date, timedelta
from typing import Any

from httpx import AsyncClient

from tests.helpers import bearer, register


async def create_recurring_rule(
    client: AsyncClient, token: str, **overrides: Any
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "description": "Netflix Subscription",
        "amount": "-15.99",
        "category": "Entertainment",
        "frequency": "monthly",
        "start_date": date.today().isoformat(),
    }
    payload.update(overrides)
    res = await client.post("/api/v1/recurring", json=payload, headers=bearer(token))
    if res.status_code == 201:
        return res.json()
    return {"_status": res.status_code, "_json": res.json()}


async def test_recurring_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/api/v1/recurring")
    assert res.status_code == 401

    res2 = await client.post(
        "/api/v1/recurring",
        json={
            "description": "Gym",
            "amount": "-50.00",
            "frequency": "monthly",
        },
    )
    assert res2.status_code == 401


async def test_create_and_get_recurring(client: AsyncClient) -> None:
    user = await register(client, email="rec_alice@example.com")
    token = user["access_token"]

    payload = {
        "description": "Spotify Premium",
        "amount": "-10.99",
        "category": "Entertainment",
        "frequency": "monthly",
        "start_date": date.today().isoformat(),
    }
    res = await client.post("/api/v1/recurring", json=payload, headers=bearer(token))
    assert res.status_code == 201
    data = res.json()
    assert data["description"] == "Spotify Premium"
    assert data["amount"] == "-10.99"
    assert data["category"] == "Entertainment"
    assert data["frequency"] == "monthly"
    assert data["start_date"] == date.today().isoformat()
    assert data["next_date"] == date.today().isoformat()
    assert data["is_active"] is True
    assert "Location" in res.headers

    # Fetch by ID
    rec_id = data["id"]
    get_res = await client.get(f"/api/v1/recurring/{rec_id}", headers=bearer(token))
    assert get_res.status_code == 200
    assert get_res.json()["id"] == rec_id


async def test_recurring_validation(client: AsyncClient) -> None:
    user = await register(client, email="rec_val@example.com")
    token = user["access_token"]

    # Zero amount
    res = await client.post(
        "/api/v1/recurring",
        json={"description": "Zero", "amount": "0.00"},
        headers=bearer(token),
    )
    assert res.status_code == 422

    # Blank description
    res = await client.post(
        "/api/v1/recurring",
        json={"description": "   ", "amount": "100.00"},
        headers=bearer(token),
    )
    assert res.status_code == 422


async def test_list_and_filter_recurring(client: AsyncClient) -> None:
    user = await register(client, email="rec_filter@example.com")
    token = user["access_token"]

    rec1 = await create_recurring_rule(client, token, description="Active 1")
    rec2 = await create_recurring_rule(client, token, description="Active 2")
    assert "id" in rec1
    assert "id" in rec2

    # Deactivate rec2
    patch_res = await client.patch(
        f"/api/v1/recurring/{rec2['id']}",
        json={"is_active": False},
        headers=bearer(token),
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["is_active"] is False

    # List all
    all_res = await client.get("/api/v1/recurring", headers=bearer(token))
    assert all_res.status_code == 200
    assert len(all_res.json()) == 2

    # Filter active only
    act_res = await client.get("/api/v1/recurring?is_active=true", headers=bearer(token))
    assert act_res.status_code == 200
    assert len(act_res.json()) == 1
    assert act_res.json()[0]["id"] == rec1["id"]

    # Filter inactive only
    inact_res = await client.get("/api/v1/recurring?is_active=false", headers=bearer(token))
    assert inact_res.status_code == 200
    assert len(inact_res.json()) == 1
    assert inact_res.json()[0]["id"] == rec2["id"]


async def test_update_and_delete_recurring(client: AsyncClient) -> None:
    user = await register(client, email="rec_crud@example.com")
    token = user["access_token"]

    rec = await create_recurring_rule(client, token, description="Old Name", amount="-20.00")
    rec_id = rec["id"]

    # Update
    update_res = await client.patch(
        f"/api/v1/recurring/{rec_id}",
        json={
            "description": "New Name",
            "amount": "-25.00",
            "frequency": "weekly",
            "category": "Utilities",
        },
        headers=bearer(token),
    )
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["description"] == "New Name"
    assert data["amount"] == "-25.00"
    assert data["frequency"] == "weekly"
    assert data["category"] == "Utilities"

    # Delete
    del_res = await client.delete(f"/api/v1/recurring/{rec_id}", headers=bearer(token))
    assert del_res.status_code == 204

    # 404 after deletion
    get_res = await client.get(f"/api/v1/recurring/{rec_id}", headers=bearer(token))
    assert get_res.status_code == 404


async def test_recurring_user_isolation(client: AsyncClient) -> None:
    alice = await register(client, email="rec_alice_iso@example.com")
    bob = await register(client, email="rec_bob_iso@example.com")

    rec = await create_recurring_rule(client, alice["access_token"], description="Alice Sub")
    rec_id = rec["id"]

    # Bob cannot access Alice's recurring rule
    get_res = await client.get(f"/api/v1/recurring/{rec_id}", headers=bearer(bob["access_token"]))
    assert get_res.status_code == 404

    patch_res = await client.patch(
        f"/api/v1/recurring/{rec_id}",
        json={"description": "Hacked"},
        headers=bearer(bob["access_token"]),
    )
    assert patch_res.status_code == 404

    del_res = await client.delete(
        f"/api/v1/recurring/{rec_id}",
        headers=bearer(bob["access_token"]),
    )
    assert del_res.status_code == 404


async def test_process_recurring_transactions(client: AsyncClient) -> None:
    user = await register(client, email="rec_process@example.com")
    token = user["access_token"]
    today = date.today()

    # Create monthly recurring rule starting today
    rec = await create_recurring_rule(
        client,
        token,
        description="Internet Bill",
        amount="-60.00",
        category="Utilities",
        frequency="monthly",
        start_date=today.isoformat(),
    )
    rec_id = rec["id"]

    # Process due transactions
    proc_res = await client.post("/api/v1/recurring/process", headers=bearer(token))
    assert proc_res.status_code == 200
    result = proc_res.json()
    assert result["processed"] == 1
    assert len(result["created_transactions"]) == 1

    # Check transactions list to ensure transaction was created
    txs_res = await client.get("/api/v1/transactions", headers=bearer(token))
    assert txs_res.status_code == 200
    tx_items = txs_res.json()["items"]
    assert len(tx_items) == 1
    assert tx_items[0]["description"] == "Internet Bill"
    assert tx_items[0]["amount"] == "-60.00"
    assert tx_items[0]["occurred_on"] == today.isoformat()

    # Rule next_date should now be in the future (next month)
    get_rule = await client.get(f"/api/v1/recurring/{rec_id}", headers=bearer(token))
    rule_data = get_rule.json()
    expected_month = 1 if today.month == 12 else today.month + 1
    assert date.fromisoformat(rule_data["next_date"]).month == expected_month

    # Processing again now should produce 0 transactions
    proc2_res = await client.post("/api/v1/recurring/process", headers=bearer(token))
    assert proc2_res.status_code == 200
    assert proc2_res.json()["processed"] == 0

    # Catch-up testing: rule in the past
    past_date = today - timedelta(days=21)
    await create_recurring_rule(
        client,
        token,
        description="Weekly Yoga",
        amount="-15.00",
        category="Health",
        frequency="weekly",
        start_date=past_date.isoformat(),
    )
    # Target date = today will catch up past weekly occurrences (0, 7, 14, 21 days ago -> 4)
    proc3_res = await client.post(
        f"/api/v1/recurring/process?target_date={today.isoformat()}",
        headers=bearer(token),
    )
    assert proc3_res.status_code == 200
    assert proc3_res.json()["processed"] == 4
