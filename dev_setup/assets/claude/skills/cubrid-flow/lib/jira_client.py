"""
CUBRID Jira (v7.7.1, Server) client.
Reads ID/PW from environment variables, manages session automatically,
and returns LLM-friendly flattened JSON for a given issue key.

Usage:
    export JIRA_BASE_URL="http://jira.cubrid.org"
    export JIRA_USERNAME="ilhansong"
    export JIRA_PASSWORD="..."
    python jira_client.py CBRD-26722
"""
from __future__ import annotations

import os
import sys
import json
import time
import logging
from typing import Any, Iterable

import httpx

logger = logging.getLogger("jira_client")

# Noisy custom fields to exclude from output (Jira-internal ranks, dev-panel dumps, etc.)
_NOISE_CUSTOM_FIELD_NAMES = {
    "Rank",
    "Ranking",
    "Global Rank",
    "Rank (단종)",
    "Development",  # Java toString dump
}

# Default system fields (used in REST API `fields=` parameter)
_DEFAULT_SYSTEM_FIELDS = [
    "summary", "status", "issuetype", "priority", "resolution",
    "reporter", "assignee", "creator",
    "created", "updated", "resolutiondate", "duedate",
    "labels", "components", "versions", "fixVersions",
    "description", "comment", "attachment",
    "parent", "subtasks", "issuelinks",
]


class JiraAuthError(RuntimeError):
    pass


class JiraNotFoundError(RuntimeError):
    pass


class JiraSession:
    """Jira REST client that auto-issues/refreshes a session via ID/PW."""

    def __init__(
        self,
        base_url: str | None = None,
        username: str | None = None,
        password: str | None = None,
        timeout: float = 30.0,
    ):
        self.base_url = (base_url or os.environ["JIRA_BASE_URL"]).rstrip("/")
        self.username = username or os.environ["JIRA_USERNAME"]
        self._password = password or os.environ["JIRA_PASSWORD"]
        self._client = httpx.Client(
            timeout=timeout,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "jira-cubrid-mcp/0.1",
            },
            follow_redirects=False,
        )
        self._logged_in = False
        self._last_login_ts = 0.0

    # ---------- Authentication ----------
    def login(self) -> None:
        """POST /rest/auth/1/session to receive JSESSIONID into the cookie jar."""
        url = f"{self.base_url}/rest/auth/1/session"
        r = self._client.post(
            url,
            json={"username": self.username, "password": self._password},
        )
        if r.status_code in (401, 403):
            raise JiraAuthError(
                f"Login failed ({r.status_code}). Check username/password or captcha requirement."
            )
        r.raise_for_status()
        # httpx.Client auto-stores Set-Cookie into self._client.cookies, so no extra handling.
        # We only flip the flag so a subsequent 401 can trigger re-login.
        self._logged_in = True
        self._last_login_ts = time.time()
        logger.info("Jira login OK as %s", self.username)

    def logout(self) -> None:
        try:
            self._client.delete(f"{self.base_url}/rest/auth/1/session")
        finally:
            self._client.cookies.clear()
            self._logged_in = False

    # ---------- Low-level request ----------
    def _request(self, method: str, path: str, **kw) -> httpx.Response:
        if not self._logged_in:
            self.login()
        url = f"{self.base_url}{path}"
        r = self._client.request(method, url, **kw)
        if r.status_code == 401:  # session expired -> re-login once and retry
            logger.info("401 received, re-login and retry")
            self.login()
            r = self._client.request(method, url, **kw)
        if r.status_code == 404:
            raise JiraNotFoundError(f"{method} {path} -> 404 Not Found")
        if r.status_code == 401:
            raise JiraAuthError("Still 401 after re-login. Verify credentials.")
        if r.status_code >= 400:
            body_preview = (r.text or "")[:1500]
            logger.error("HTTP %d %s %s -- body: %s", r.status_code, method, path, body_preview)
        r.raise_for_status()
        return r

    # ---------- High-level API ----------
    def get_issue_raw(
        self,
        issue_key: str,
        fields: Iterable[str] | None = None,
        expand: Iterable[str] = ("names", "renderedFields"),
    ) -> dict[str, Any]:
        params: dict[str, str] = {}
        if fields:
            params["fields"] = ",".join(fields)
        else:
            # `*all` returns every field; noise is filtered out in _flatten_issue
            params["fields"] = "*all"
        if expand:
            params["expand"] = ",".join(expand)
        r = self._request("GET", f"/rest/api/2/issue/{issue_key}", params=params)
        return r.json()

    def get_issue(self, issue_key: str) -> dict[str, Any]:
        """Return an LLM-friendly flattened issue dict."""
        raw = self.get_issue_raw(issue_key)
        return _flatten_issue(raw, base_url=self.base_url)

    def update_description(self, issue_key: str, description: str) -> None:
        """PUT /rest/api/2/issue/{key} replacing only the description (wiki markup)."""
        self._request(
            "PUT",
            f"/rest/api/2/issue/{issue_key}",
            json={"fields": {"description": description}},
        )

    def add_comment(self, issue_key: str, body: str) -> dict[str, Any]:
        """POST /rest/api/2/issue/{key}/comment."""
        r = self._request(
            "POST",
            f"/rest/api/2/issue/{issue_key}/comment",
            json={"body": body},
        )
        return r.json()

    def create_issue(
        self,
        project: str,
        summary: str,
        description: str = "",
        issuetype: str = "Task",
        extra_fields: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """POST /rest/api/2/issue. Returns {key, id, self}.

        extra_fields: id -> value (e.g. {"customfield_210565": "Not Required"}).
        Workflow-required custom fields that the JIRA project mandates must be passed here.
        """
        fields: dict[str, Any] = {
            "project": {"key": project},
            "summary": summary,
            "issuetype": {"name": issuetype},
            "description": description,
        }
        if extra_fields:
            fields.update(extra_fields)
        r = self._request("POST", "/rest/api/2/issue", json={"fields": fields})
        return r.json()


# ---------- Flattening ----------
def _user(u: dict | None) -> str | None:
    if not u:
        return None
    return u.get("displayName") or u.get("name") or u.get("key")


def _named(o: dict | None) -> str | None:
    if not o:
        return None
    return o.get("name") or o.get("value")


def _normalize_custom_value(v: Any) -> Any:
    """Normalize a custom-field value into something LLM-readable."""
    if v is None:
        return None
    if isinstance(v, str):
        # Drop Java toString dumps and other malformed payloads
        if v.startswith("{") and "@" in v[:50]:
            return None
        return v
    if isinstance(v, (int, float, bool)):
        return v
    if isinstance(v, list):
        return [_normalize_custom_value(x) for x in v if x is not None] or None
    if isinstance(v, dict):
        # User object
        if "name" in v and ("emailAddress" in v or "avatarUrls" in v):
            return _user(v)
        # Option/version/component-style objects with name/value
        if "value" in v:
            return v["value"]
        if "name" in v:
            return v["name"]
        return v  # unknown shape, return as-is
    return v


def _flatten_issue(raw: dict, base_url: str) -> dict[str, Any]:
    f = raw.get("fields") or {}
    names = raw.get("names") or {}
    rendered = raw.get("renderedFields") or {}

    # Flatten comments (cap at 50)
    comments_raw = (f.get("comment") or {}).get("comments") or []
    comments = [
        {
            "author": _user(c.get("author")),
            "created": c.get("created"),
            "updated": c.get("updated"),
            "body": c.get("body") or "",
        }
        for c in comments_raw[:50]
    ]

    # Flatten attachments
    attachments = [
        {
            "filename": a.get("filename"),
            "size": a.get("size"),
            "mimeType": a.get("mimeType"),
            "author": _user(a.get("author")),
            "created": a.get("created"),
            "url": a.get("content"),
        }
        for a in (f.get("attachment") or [])
    ]

    # Issue links
    links = []
    for l in f.get("issuelinks") or []:
        type_name = (l.get("type") or {}).get("name")
        if "outwardIssue" in l:
            other = l["outwardIssue"]
            direction = (l.get("type") or {}).get("outward")
        elif "inwardIssue" in l:
            other = l["inwardIssue"]
            direction = (l.get("type") or {}).get("inward")
        else:
            continue
        links.append({
            "type": type_name,
            "direction": direction,
            "key": other.get("key"),
            "summary": (other.get("fields") or {}).get("summary"),
            "status": ((other.get("fields") or {}).get("status") or {}).get("name"),
        })

    # Subtasks
    subtasks = [
        {
            "key": s.get("key"),
            "summary": (s.get("fields") or {}).get("summary"),
            "status": ((s.get("fields") or {}).get("status") or {}).get("name"),
        }
        for s in (f.get("subtasks") or [])
    ]

    # Custom fields keyed by displayName
    custom: dict[str, Any] = {}
    for k, v in f.items():
        if not k.startswith("customfield_"):
            continue
        if v is None or v == [] or v == "":
            continue
        display = names.get(k) or k
        if display in _NOISE_CUSTOM_FIELD_NAMES:
            continue
        normalized = _normalize_custom_value(v)
        if normalized is None or normalized == [] or normalized == "":
            continue
        custom[display] = normalized

    return {
        "key": raw.get("key"),
        "id": raw.get("id"),
        "url": f"{base_url}/browse/{raw.get('key')}",
        "summary": f.get("summary"),
        "issue_type": _named(f.get("issuetype")),
        "status": _named(f.get("status")),
        "status_category": ((f.get("status") or {}).get("statusCategory") or {}).get("key"),
        "priority": _named(f.get("priority")),
        "resolution": _named(f.get("resolution")),
        "reporter": _user(f.get("reporter")),
        "assignee": _user(f.get("assignee")),
        "creator": _user(f.get("creator")),
        "created": f.get("created"),
        "updated": f.get("updated"),
        "resolved": f.get("resolutiondate"),
        "due": f.get("duedate"),
        "labels": f.get("labels") or [],
        "components": [c.get("name") for c in (f.get("components") or [])],
        "versions": [v.get("name") for v in (f.get("versions") or [])],
        "fix_versions": [v.get("name") for v in (f.get("fixVersions") or [])],
        "parent": (f.get("parent") or {}).get("key"),
        "subtasks": subtasks,
        "links": links,
        "description": f.get("description") or "",
        "description_rendered": rendered.get("description"),
        "comments": comments,
        "attachments": attachments,
        "custom_fields": custom,
    }


# ---------- CLI ----------
def _main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if len(argv) < 2:
        print("usage: python jira_client.py <ISSUE-KEY> [<ISSUE-KEY> ...]", file=sys.stderr)
        return 2
    sess = JiraSession()
    try:
        for key in argv[1:]:
            issue = sess.get_issue(key)
            print(json.dumps(issue, ensure_ascii=False, indent=2))
    except JiraNotFoundError as e:
        print(f"NOT FOUND: {e}", file=sys.stderr)
        return 1
    except JiraAuthError as e:
        print(f"AUTH ERROR: {e}", file=sys.stderr)
        return 1
    finally:
        sess.logout()
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv))