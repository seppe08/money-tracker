import io
from datetime import date

from httpx import AsyncClient

from tests.helpers import bearer, register


async def create_txn(client: AsyncClient, token: str, **overrides: object) -> dict:
    payload = {
        "description": "Item",
        "amount": "10.00",
        "category": "General",
        "occurred_on": date.today().isoformat(),
    }
    payload.update(overrides)
    res = await client.post("/api/v1/transactions", json=payload, headers=bearer(token))
    assert res.status_code == 201, res.text
    return res.json()


async def test_export_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/api/v1/transactions/export")
    assert res.status_code == 401


async def test_export_empty_transactions(client: AsyncClient) -> None:
    alice = await register(client, email="csv_empty@example.com")
    res = await client.get("/api/v1/transactions/export", headers=bearer(alice["access_token"]))
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "attachment" in res.headers["content-disposition"]
    lines = res.text.strip().splitlines()
    assert len(lines) == 1
    assert lines[0] == "Date,Description,Amount,Category"


async def test_export_with_data_and_filters(client: AsyncClient) -> None:
    alice = await register(client, email="csv_export@example.com")
    token = alice["access_token"]

    await create_txn(
        client,
        token,
        description="Groceries",
        amount="-45.50",
        category="Food",
        occurred_on="2026-11-01",
    )
    await create_txn(
        client,
        token,
        description="Salary",
        amount="2000.00",
        category="Income",
        occurred_on="2026-11-05",
    )

    # Export all
    res_all = await client.get("/api/v1/transactions/export", headers=bearer(token))
    assert res_all.status_code == 200
    lines_all = res_all.text.strip().splitlines()
    assert len(lines_all) == 3

    # Export with filter: category=Food
    res_cat = await client.get("/api/v1/transactions/export?category=Food", headers=bearer(token))
    lines_cat = res_cat.text.strip().splitlines()
    assert len(lines_cat) == 2
    assert "Groceries" in lines_cat[1]


async def test_export_user_isolation(client: AsyncClient) -> None:
    alice = await register(client, email="export_alice@example.com")
    bob = await register(client, email="export_bob@example.com")

    await create_txn(client, alice["access_token"], description="AliceTxn")
    await create_txn(client, bob["access_token"], description="BobTxn")

    res = await client.get("/api/v1/transactions/export", headers=bearer(alice["access_token"]))
    assert res.status_code == 200
    assert "AliceTxn" in res.text
    assert "BobTxn" not in res.text


async def test_import_requires_auth(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/transactions/import",
        files={"file": ("test.csv", b"Date,Description,Amount\n2026-11-01,Test,10.00", "text/csv")},
    )
    assert res.status_code == 401


async def test_import_valid_csv(client: AsyncClient) -> None:
    alice = await register(client, email="import_valid@example.com")
    token = alice["access_token"]

    csv_content = (
        "Date,Description,Amount,Category\n"
        "2026-11-01,Coffee,-4.50,Food\n"
        "2026-11-02,Salary,3500.00,Work\n"
        "\n"  # Empty line to test skipping
        "2026-11-03,Gas,-50.00,Transport\n"
    )

    files = {"file": ("statements.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res = await client.post("/api/v1/transactions/import", files=files, headers=bearer(token))
    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 3
    assert data["skipped"] == 1
    assert data["errors"] == []

    # Verify transactions were persisted
    list_res = await client.get("/api/v1/transactions", headers=bearer(token))
    assert list_res.status_code == 200
    assert list_res.json()["total"] == 3


async def test_import_with_alternate_headers_and_currency_symbols(client: AsyncClient) -> None:
    alice = await register(client, email="import_alt@example.com")
    token = alice["access_token"]

    csv_content = (
        "Tx_Date,Payee,Total,Tag\n"
        "11/15/2026,Bakery,-$15.50,Snacks\n"
        "11/16/2026,Freelance,$1,200.00,Income\n"
    )

    files = {"file": ("alt.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res = await client.post("/api/v1/transactions/import", files=files, headers=bearer(token))
    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 2
    assert data["errors"] == []


async def test_import_missing_required_headers(client: AsyncClient) -> None:
    alice = await register(client, email="import_missing@example.com")
    token = alice["access_token"]

    csv_content = "Date,Category\n2026-11-01,Food\n"
    files = {"file": ("missing.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res = await client.post("/api/v1/transactions/import", files=files, headers=bearer(token))
    assert res.status_code == 422
    assert "missing required columns" in res.json()["detail"].lower()


async def test_import_malformed_rows_handles_gracefully(client: AsyncClient) -> None:
    alice = await register(client, email="import_malformed@example.com")
    token = alice["access_token"]

    csv_content = (
        "Date,Description,Amount,Category\n"
        "2026-11-01,Valid,-10.00,Food\n"
        "invalid-date,Bad Date,-10.00,Food\n"
        "2026-11-02,Bad Amount,not-a-number,Food\n"
        "2026-11-03,   ,-10.00,Food\n"  # Blank description
    )

    files = {"file": ("mixed.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res = await client.post("/api/v1/transactions/import", files=files, headers=bearer(token))
    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 1
    assert len(data["errors"]) == 3
