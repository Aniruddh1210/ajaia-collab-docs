"""Access-control matrix: the core of the app's authorization logic."""


async def _login(client, user):
    # First authenticated call upserts the user's profile, mirroring real login.
    r = await client.get("/api/documents", headers=user.headers)
    assert r.status_code == 200


async def _create_doc(client, user, title="Doc"):
    r = await client.post(
        "/api/documents", headers=user.headers, json={"title": title}
    )
    assert r.status_code == 201
    return r.json()["id"]


async def test_owner_full_access(client, alice):
    doc_id = await _create_doc(client, alice)

    r = await client.get(f"/api/documents/{doc_id}", headers=alice.headers)
    assert r.status_code == 200
    assert r.json()["access"] == "owner"

    r = await client.patch(
        f"/api/documents/{doc_id}", headers=alice.headers, json={"title": "Renamed"}
    )
    assert r.status_code == 200 and r.json()["title"] == "Renamed"

    r = await client.delete(f"/api/documents/{doc_id}", headers=alice.headers)
    assert r.status_code == 204


async def test_stranger_gets_404_not_403(client, alice, bob):
    """A non-shared user must not even learn the document exists."""
    await _login(client, bob)
    doc_id = await _create_doc(client, alice)

    r = await client.get(f"/api/documents/{doc_id}", headers=bob.headers)
    assert r.status_code == 404
    r = await client.patch(
        f"/api/documents/{doc_id}", headers=bob.headers, json={"title": "hack"}
    )
    assert r.status_code == 404


async def test_viewer_can_read_but_not_edit(client, alice, bob):
    await _login(client, bob)
    doc_id = await _create_doc(client, alice)

    r = await client.post(
        f"/api/documents/{doc_id}/shares",
        headers=alice.headers,
        json={"email": bob.email, "role": "viewer"},
    )
    assert r.status_code == 201

    r = await client.get(f"/api/documents/{doc_id}", headers=bob.headers)
    assert r.status_code == 200 and r.json()["access"] == "viewer"

    r = await client.patch(
        f"/api/documents/{doc_id}", headers=bob.headers, json={"title": "nope"}
    )
    assert r.status_code == 403


async def test_editor_can_edit_but_not_delete(client, alice, bob):
    await _login(client, bob)
    doc_id = await _create_doc(client, alice)

    await client.post(
        f"/api/documents/{doc_id}/shares",
        headers=alice.headers,
        json={"email": bob.email, "role": "editor"},
    )

    r = await client.patch(
        f"/api/documents/{doc_id}", headers=bob.headers, json={"title": "edited"}
    )
    assert r.status_code == 200

    r = await client.delete(f"/api/documents/{doc_id}", headers=bob.headers)
    assert r.status_code == 403


async def test_share_with_unknown_email_404(client, alice):
    doc_id = await _create_doc(client, alice)
    r = await client.post(
        f"/api/documents/{doc_id}/shares",
        headers=alice.headers,
        json={"email": "ghost@example.com", "role": "editor"},
    )
    assert r.status_code == 404


async def test_only_owner_can_share(client, alice, bob, carol):
    await _login(client, bob)
    await _login(client, carol)
    doc_id = await _create_doc(client, alice)

    # bob (not owner, not shared) cannot list or add shares
    r = await client.get(f"/api/documents/{doc_id}/shares", headers=bob.headers)
    assert r.status_code == 403
    r = await client.post(
        f"/api/documents/{doc_id}/shares",
        headers=bob.headers,
        json={"email": carol.email, "role": "editor"},
    )
    assert r.status_code == 403


async def test_shared_doc_appears_in_recipient_list(client, alice, bob):
    await _login(client, bob)
    doc_id = await _create_doc(client, alice, title="Shared one")
    await client.post(
        f"/api/documents/{doc_id}/shares",
        headers=alice.headers,
        json={"email": bob.email, "role": "editor"},
    )

    r = await client.get("/api/documents", headers=bob.headers)
    assert r.status_code == 200
    docs = r.json()
    match = [d for d in docs if d["id"] == doc_id]
    assert len(match) == 1
    assert match[0]["access"] == "editor"
    assert match[0]["owner_email"] == alice.email


async def test_reshare_updates_role(client, alice, bob):
    await _login(client, bob)
    doc_id = await _create_doc(client, alice)
    for role in ("viewer", "editor"):
        r = await client.post(
            f"/api/documents/{doc_id}/shares",
            headers=alice.headers,
            json={"email": bob.email, "role": role},
        )
        assert r.status_code == 201

    r = await client.get(f"/api/documents/{doc_id}/shares", headers=alice.headers)
    shares = r.json()
    assert len(shares) == 1 and shares[0]["role"] == "editor"


async def test_unauthenticated_rejected(client, alice):
    doc_id = await _create_doc(client, alice)
    r = await client.get(f"/api/documents/{doc_id}")
    assert r.status_code == 401
