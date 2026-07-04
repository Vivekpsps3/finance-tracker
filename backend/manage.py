from __future__ import annotations

import argparse
import getpass

from auth import create_user
from database import SessionLocal, init_database
from models import UserRole


def create_admin(args: argparse.Namespace) -> None:
    init_database()
    password = args.password or getpass.getpass("Admin password: ")
    db = SessionLocal()
    try:
        user = create_user(
            db,
            email=args.email,
            display_name=args.display_name or args.email,
            password=password,
            role=UserRole.admin,
            must_change_password=args.must_change_password,
        )
        db.commit()
        print(f"created admin id={user.id} email={user.email}")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Finance Tracker management commands")
    sub = parser.add_subparsers(required=True)
    create = sub.add_parser("create-admin")
    create.add_argument("--email", required=True)
    create.add_argument("--display-name", default="")
    create.add_argument("--password", default="")
    create.add_argument("--must-change-password", action="store_true")
    create.set_defaults(func=create_admin)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
