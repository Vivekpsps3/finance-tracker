import hashlib
import hmac
import os

COOKIE = "me_auth"


def password() -> str:
    return os.environ.get("AUTH_PASSWORD", "")


def token(pw: str) -> str:
    return hmac.new(pw.encode(), b"me-app", hashlib.sha256).hexdigest()


def ok(cookie: str | None, pw: str | None = None) -> bool:
    pw = password() if pw is None else pw
    if not pw:
        return True
    if not cookie:
        return False
    return hmac.compare_digest(cookie, token(pw))


def matches(guess: str, pw: str | None = None) -> bool:
    pw = password() if pw is None else pw
    if not pw:
        return False
    return hmac.compare_digest(guess, pw)
