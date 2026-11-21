from httpx import AsyncClient

from tests.helpers import PASSWORD, bearer, login, register


async def test_update_profile_and_currency(client: AsyncClient) -> None:
    user = await register(client, email="profile@example.com")
    token = user["access_token"]

    response = await client.patch(
        "/api/v1/users/me",
        json={"display_name": "  Ada Lovelace  ", "currency": "eur"},
        headers=bearer(token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "Ada Lovelace"
    assert body["currency"] == "EUR"

    me = await client.get("/api/v1/users/me", headers=bearer(token))
    assert me.json()["currency"] == "EUR"


async def test_currency_validation(client: AsyncClient) -> None:
    user = await register(client, email="currency@example.com")

    response = await client.patch(
        "/api/v1/users/me",
        json={"currency": "EURO"},
        headers=bearer(user["access_token"]),
    )
    assert response.status_code == 422


async def test_change_password_revokes_existing_sessions(client: AsyncClient) -> None:
    user = await register(client, email="password@example.com")

    wrong = await client.post(
        "/api/v1/users/me/password",
        json={"current_password": "wrong-password", "new_password": "a-new-long-password"},
        headers=bearer(user["access_token"]),
    )
    assert wrong.status_code == 400

    changed = await client.post(
        "/api/v1/users/me/password",
        json={"current_password": PASSWORD, "new_password": "a-new-long-password"},
        headers=bearer(user["access_token"]),
    )
    assert changed.status_code == 204

    # The old access token and refresh token are both invalidated.
    assert (
        await client.get("/api/v1/users/me", headers=bearer(user["access_token"]))
    ).status_code == 401
    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": user["refresh_token"]}
    )
    assert refreshed.status_code == 401

    # The old password no longer works; the new one does.
    old_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "password@example.com", "password": PASSWORD},
    )
    assert old_login.status_code == 401

    new_login = await login(client, email="password@example.com", password="a-new-long-password")
    assert new_login["access_token"]


async def test_change_password_rejects_reuse(client: AsyncClient) -> None:
    user = await register(client, email="reuse@example.com")

    response = await client.post(
        "/api/v1/users/me/password",
        json={"current_password": PASSWORD, "new_password": PASSWORD},
        headers=bearer(user["access_token"]),
    )
    assert response.status_code == 400
    assert "different" in response.json()["detail"]


async def test_delete_account_removes_access(client: AsyncClient) -> None:
    user = await register(client, email="delete@example.com")

    wrong = await client.request(
        "DELETE",
        "/api/v1/users/me",
        json={"password": "wrong-password"},
        headers=bearer(user["access_token"]),
    )
    assert wrong.status_code == 400

    deleted = await client.request(
        "DELETE",
        "/api/v1/users/me",
        json={"password": PASSWORD},
        headers=bearer(user["access_token"]),
    )
    assert deleted.status_code == 204

    assert (
        await client.get("/api/v1/users/me", headers=bearer(user["access_token"]))
    ).status_code == 401
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={"email": "delete@example.com", "password": PASSWORD},
        )
    ).status_code == 401


async def test_common_password_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "weak@example.com",
            "password": "passwordpassword",
            "display_name": "Weak",
        },
    )
    assert response.status_code == 422
