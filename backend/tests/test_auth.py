"""
Sign up, sign in, sign out, and who am I.

No interface reaches these yet. They are tested now because they are the seam
saved documents will hang off, and because they are what proves the database is
built and usable rather than merely present.
"""

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.security import (
    create_session_token,
    hash_password,
    read_session_token,
    verify_password,
)
from tests.conftest import PASSWORD


def test_signup_registers_and_signs_in(client: TestClient) -> None:
    response = client.post(
        "/api/auth/signup", json={"email": "ada@example.com", "password": PASSWORD}
    )

    assert response.status_code == 201
    assert response.json()["email"] == "ada@example.com"
    assert client.get("/api/auth/me").status_code == 200


def test_signup_never_returns_the_password_hash(client: TestClient) -> None:
    response = client.post(
        "/api/auth/signup", json={"email": "ada@example.com", "password": PASSWORD}
    )

    assert "password_hash" not in response.json()
    assert PASSWORD not in response.text


def test_signup_rejects_an_email_already_registered(signed_in: TestClient) -> None:
    response = signed_in.post(
        "/api/auth/signup", json={"email": "ada@example.com", "password": PASSWORD}
    )

    assert response.status_code == 409


def test_signup_treats_email_case_as_insignificant(signed_in: TestClient) -> None:
    # Otherwise Ada@Example.com and ada@example.com are two accounts, and the
    # one you get depends on how you typed it that day.
    response = signed_in.post(
        "/api/auth/signup", json={"email": "Ada@Example.com", "password": PASSWORD}
    )

    assert response.status_code == 409


def test_signup_rejects_a_password_too_short_to_be_worth_hashing(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/auth/signup", json={"email": "ada@example.com", "password": "short"}
    )

    assert response.status_code == 422


def test_signup_rejects_something_that_is_not_an_email(client: TestClient) -> None:
    response = client.post(
        "/api/auth/signup", json={"email": "not-an-email", "password": PASSWORD}
    )

    assert response.status_code == 422


def test_signin_accepts_the_right_password(signed_in: TestClient) -> None:
    signed_in.post("/api/auth/signout")

    response = signed_in.post(
        "/api/auth/signin", json={"email": "ada@example.com", "password": PASSWORD}
    )

    assert response.status_code == 200
    assert signed_in.get("/api/auth/me").json()["email"] == "ada@example.com"


def test_signin_rejects_the_wrong_password(signed_in: TestClient) -> None:
    response = signed_in.post(
        "/api/auth/signin",
        json={"email": "ada@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401


def test_signin_says_the_same_thing_for_an_unknown_email(client: TestClient) -> None:
    # Differing replies would turn sign-in into a way to enumerate who has an
    # account here.
    unknown = client.post(
        "/api/auth/signin", json={"email": "nobody@example.com", "password": PASSWORD}
    )
    client.post(
        "/api/auth/signup", json={"email": "ada@example.com", "password": PASSWORD}
    )
    wrong = client.post(
        "/api/auth/signin",
        json={"email": "ada@example.com", "password": "wrong-password"},
    )

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_signout_clears_the_session(signed_in: TestClient) -> None:
    assert signed_in.post("/api/auth/signout").status_code == 204

    assert signed_in.get("/api/auth/me").status_code == 401


def test_signout_succeeds_when_nobody_is_signed_in(client: TestClient) -> None:
    assert client.post("/api/auth/signout").status_code == 204


def test_me_refuses_without_a_session(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_me_refuses_a_forged_cookie(client: TestClient) -> None:
    client.cookies.set("prelegal_session", "not.a.token")

    assert client.get("/api/auth/me").status_code == 401


def test_me_refuses_a_token_signed_with_another_key(client: TestClient) -> None:
    forged = create_session_token(1, "not-the-servers-key-but-long-enough", 3600)
    client.cookies.set("prelegal_session", forged)

    assert client.get("/api/auth/me").status_code == 401


def test_me_refuses_a_token_naming_a_user_who_no_longer_exists(
    client: TestClient,
) -> None:
    # The everyday case, not an exotic one: the database is rebuilt on every
    # restart while the cookie in the browser survives it.
    orphaned = create_session_token(999, "test-secret-key-long-enough-for-sha256", 3600)
    client.cookies.set("prelegal_session", orphaned)

    assert client.get("/api/auth/me").status_code == 401


def test_the_session_cookie_is_not_readable_from_javascript(client: TestClient) -> None:
    response = client.post(
        "/api/auth/signup", json={"email": "ada@example.com", "password": PASSWORD}
    )

    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie


def test_the_database_does_not_survive_a_restart(
    client: TestClient, settings: Settings
) -> None:
    client.post(
        "/api/auth/signup", json={"email": "ada@example.com", "password": PASSWORD}
    )

    with TestClient(create_app(settings)) as restarted:
        response = restarted.post(
            "/api/auth/signin", json={"email": "ada@example.com", "password": PASSWORD}
        )

    assert response.status_code == 401


class TestPasswordHashing:
    def test_accepts_the_password_it_hashed(self) -> None:
        assert verify_password(PASSWORD, hash_password(PASSWORD))

    def test_rejects_a_different_password(self) -> None:
        assert not verify_password("something-else", hash_password(PASSWORD))

    def test_never_stores_the_password(self) -> None:
        assert PASSWORD not in hash_password(PASSWORD)

    def test_salts_so_two_users_sharing_a_password_do_not_share_a_hash(self) -> None:
        assert hash_password(PASSWORD) != hash_password(PASSWORD)

    def test_treats_a_corrupt_hash_as_a_failed_attempt(self) -> None:
        # A row that bcrypt cannot parse is a broken record, not a correct
        # password, and must not become a 500 on the sign-in path.
        assert not verify_password(PASSWORD, "not-a-bcrypt-hash")


class TestSessionTokens:
    def test_round_trips_the_user_id(self) -> None:
        token = create_session_token(42, "a-key-long-enough-for-sha256-hmac", 3600)

        assert read_session_token(token, "a-key-long-enough-for-sha256-hmac") == 42

    def test_rejects_another_key(self) -> None:
        token = create_session_token(42, "a-key-long-enough-for-sha256-hmac", 3600)

        assert read_session_token(token, "a-different-key-long-enough-here") is None

    def test_rejects_an_expired_token(self) -> None:
        expired = create_session_token(42, "a-key-long-enough-for-sha256-hmac", -1)

        assert read_session_token(expired, "a-key-long-enough-for-sha256-hmac") is None

    def test_rejects_nonsense(self) -> None:
        assert (
            read_session_token("not-a-token", "a-key-long-enough-for-sha256-hmac")
            is None
        )
