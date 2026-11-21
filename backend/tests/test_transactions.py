from httpx import AsyncClient

from tests.helpers import bearer, register


async def create_transaction(client: AsyncClient, token: str, **overrides: object) -> dict:
    payload = {
        "description": "Coffee",
        "amount": "4.50",
        "category": "Food",
    }
    payload.update(overrides)
    response = await client.post("/api/v1/transactions", json=payload, headers=bearer(token))
    assert response.status_code == 201, response.text
    return response.json()


async def test_transactions_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/transactions")).status_code == 401
    assert (
        await client.post("/api/v1/transactions", json={"description": "x", "amount": "1.00"})
    ).status_code == 401


async def test_create_and_list_only_own_transactions(client: AsyncClient) -> None:
    alice = await register(client, email="alice@example.com")
    bob = await register(client, email="bob@example.com")

    await create_transaction(client, alice["access_token"], description="Rent")
    await create_transaction(client, bob["access_token"], description="Lunch")

    alice_list = await client.get("/api/v1/transactions", headers=bearer(alice["access_token"]))
    assert alice_list.status_code == 200
    items = alice_list.json()["items"]
    assert [item["description"] for item in items] == ["Rent"]
    assert all(item["user_id"] == alice["user"]["id"] for item in items)
    assert alice_list.json()["total"] == 1
    assert alice_list.headers["x-total-count"] == "1"


async def test_user_id_in_body_cannot_override_owner(client: AsyncClient) -> None:
    alice = await register(client, email="alice2@example.com")
    bob = await register(client, email="bob2@example.com")

    created = await create_transaction(
        client,
        alice["access_token"],
        description="Spoofed",
        user_id=bob["user"]["id"],
    )
    assert created["user_id"] == alice["user"]["id"]


async def test_cross_user_read_update_delete_return_403(client: AsyncClient) -> None:
    alice = await register(client, email="owner@example.com")
    bob = await register(client, email="intruder@example.com")
    transaction = await create_transaction(client, alice["access_token"])
    path = f"/api/v1/transactions/{transaction['id']}"

    read = await client.get(path, headers=bearer(bob["access_token"]))
    assert read.status_code == 403

    update = await client.patch(
        path, json={"description": "Hijacked"}, headers=bearer(bob["access_token"])
    )
    assert update.status_code == 403

    delete = await client.delete(path, headers=bearer(bob["access_token"]))
    assert delete.status_code == 403

    # The record is untouched and still owned by Alice.
    still_there = await client.get(path, headers=bearer(alice["access_token"]))
    assert still_there.status_code == 200
    assert still_there.json()["description"] == "Coffee"


async def test_owner_can_update_and_delete(client: AsyncClient) -> None:
    alice = await register(client, email="crud@example.com")
    transaction = await create_transaction(client, alice["access_token"])
    path = f"/api/v1/transactions/{transaction['id']}"

    updated = await client.patch(
        path,
        json={"description": "Updated", "amount": "5.25", "category": None},
        headers=bearer(alice["access_token"]),
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "Updated"
    assert updated.json()["category"] is None

    deleted = await client.delete(path, headers=bearer(alice["access_token"]))
    assert deleted.status_code == 204

    missing = await client.get(path, headers=bearer(alice["access_token"]))
    assert missing.status_code == 404


async def test_missing_transaction_returns_404(client: AsyncClient) -> None:
    alice = await register(client, email="missing@example.com")

    response = await client.get(
        "/api/v1/transactions/00000000-0000-0000-0000-000000000000",
        headers=bearer(alice["access_token"]),
    )
    assert response.status_code == 404
