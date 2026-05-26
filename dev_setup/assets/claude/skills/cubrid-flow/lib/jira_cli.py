"""
CLI wrapper around jira_client.JiraSession for use in skill bash snippets.

Subcommands:
  get <KEY>                       Print flattened issue JSON.
  create <SUMMARY>                Create issue. Description from stdin if --desc-stdin.
                                  Optional: --type Task|Bug|...
  update-desc <KEY>               Replace description. Body always from stdin.
  comment <KEY>                   Add comment. Body always from stdin.

Reads JIRA_BASE_URL / JIRA_USERNAME / JIRA_PASSWORD / JIRA_PROJECT from env.
Output on success: single line "OK <KEY> <URL>" (and JSON for `get`).
Exit codes: 0 ok, 1 auth/api error, 2 usage error.
"""
from __future__ import annotations

import argparse
import json
import sys
import os
from typing import Optional

from jira_client import JiraSession, JiraAuthError, JiraNotFoundError


def _base_url() -> str:
    return os.environ["JIRA_BASE_URL"].rstrip("/")


def _project() -> str:
    return os.environ.get("JIRA_PROJECT", "CBRD")


def _read_stdin() -> str:
    data = sys.stdin.read()
    if not data.strip():
        print("ERR empty stdin", file=sys.stderr)
        sys.exit(2)
    return data


def cmd_get(args) -> int:
    sess = JiraSession()
    try:
        issue = sess.get_issue(args.key)
        print(json.dumps(issue, ensure_ascii=False, indent=2))
        return 0
    except JiraNotFoundError:
        print(f"ERR not_found {args.key}", file=sys.stderr)
        return 1
    finally:
        sess.logout()


def cmd_create(args) -> int:
    desc = _read_stdin() if args.desc_stdin else ""
    extra: dict = {}
    for kv in (args.field or []):
        if "=" not in kv:
            print(f"ERR usage --field expects key=value (got {kv!r})", file=sys.stderr)
            return 2
        k, _, v = kv.partition("=")
        v = v.strip()
        # Accept JSON object/array literals so callers can target option/cascade/multi-select fields:
        #   --field customfield_X='{"value":"Foo"}'  --field customfield_Y='["a","b"]'
        # Bare strings remain strings.
        parsed: object
        if v and v[0] in "{[":
            try:
                parsed = json.loads(v)
            except json.JSONDecodeError as e:
                print(f"ERR --field {k}: looks like JSON but failed to parse ({e})", file=sys.stderr)
                return 2
        else:
            parsed = v
        extra[k.strip()] = parsed
    sess = JiraSession()
    try:
        res = sess.create_issue(
            project=args.project or _project(),
            summary=args.summary,
            description=desc,
            issuetype=args.type,
            extra_fields=extra or None,
        )
        key = res.get("key")
        print(f"OK {key} {_base_url()}/browse/{key}")
        return 0
    finally:
        sess.logout()


def cmd_update_desc(args) -> int:
    desc = _read_stdin()
    sess = JiraSession()
    try:
        sess.update_description(args.key, desc)
        print(f"OK {args.key} {_base_url()}/browse/{args.key}")
        return 0
    finally:
        sess.logout()


def cmd_comment(args) -> int:
    body = _read_stdin()
    sess = JiraSession()
    try:
        res = sess.add_comment(args.key, body)
        cid = res.get("id")
        print(f"OK {args.key} comment={cid} {_base_url()}/browse/{args.key}")
        return 0
    finally:
        sess.logout()


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(prog="jira_cli")
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("get")
    g.add_argument("key")
    g.set_defaults(fn=cmd_get)

    c = sub.add_parser("create")
    c.add_argument("summary")
    c.add_argument("--type", default="Task")
    c.add_argument("--project", default=None)
    c.add_argument("--desc-stdin", action="store_true",
                   help="read description from stdin")
    c.add_argument("--field", action="append", default=[],
                   help="extra field as id=value (repeatable). e.g. --field customfield_210565='Not Required'")
    c.set_defaults(fn=cmd_create)

    u = sub.add_parser("update-desc")
    u.add_argument("key")
    u.set_defaults(fn=cmd_update_desc)

    m = sub.add_parser("comment")
    m.add_argument("key")
    m.set_defaults(fn=cmd_comment)

    args = p.parse_args(argv)
    try:
        return args.fn(args)
    except JiraAuthError as e:
        print(f"ERR auth {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ERR {type(e).__name__} {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
