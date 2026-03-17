"""
Compatibility module providing Daytona SDK-like classes for local Docker sandbox.
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SessionExecuteRequest:
    """Mimics daytona_sdk.SessionExecuteRequest."""
    command: str = ""
    var_async: bool = False


class PtySize:
    """Mimics daytona_sdk.common.pty.PtySize."""
    def __init__(self, rows: int = 24, cols: int = 80):
        self.rows = rows
        self.cols = cols
