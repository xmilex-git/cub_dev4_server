"""
CUBRID Jira MCP Server.
Requires JIRA_BASE_URL, JIRA_USERNAME, JIRA_PASSWORD environment variables.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

from jira_client import JiraSession, JiraNotFoundError, JiraAuthError

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("jira-mcp")

app = Server("jira-cubrid")
_session: JiraSession | None = None


def _sess() -> JiraSession:
    global _session
    if _session is None:
        _session = JiraSession()
    return _session


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="jira_get_issue",
            description=(
                "Fetch issue details from CUBRID Jira by issue key (e.g., 'CBRD-26722'). "
                "Returns flattened JSON including summary, status, assignee, description, "
                "comments, custom_fields, etc."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "issue_key": {
                        "type": "string",
                        "description": "Issue key, e.g., CBRD-26722. Case-insensitive.",
                    }
                },
                "required": ["issue_key"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    if name == "jira_get_issue":
        key = str(arguments["issue_key"]).strip().upper()
        try:
            issue = await asyncio.to_thread(_sess().get_issue, key)
            return [TextContent(
                type="text",
                text=json.dumps(issue, ensure_ascii=False, indent=2),
            )]
        except JiraNotFoundError:
            return [TextContent(type="text", text=f"Issue {key} not found.")]
        except JiraAuthError as e:
            return [TextContent(type="text", text=f"Auth error: {e}")]
    raise ValueError(f"Unknown tool: {name}")


async def main():
    async with stdio_server() as (read, write):
        await app.run(read, write, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())