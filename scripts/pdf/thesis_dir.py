"""Single source of truth for ~/thesis/ paths in Python scripts.

Default: $HOME/thesis (visible folder, cross-platform).
Override: set THESIS_DIR=/some/path to relocate (CI, alt drive, dev).
"""

import os
from pathlib import Path

from safe_ticker import safe_ticker_dir


def thesis_home() -> Path:
    override = os.environ.get('THESIS_DIR')
    if override:
        return Path(override)
    return Path.home() / 'thesis'


def reports_dir(ticker: str | None = None) -> Path:
    base = thesis_home() / 'reports'
    return base / safe_ticker_dir(ticker) if ticker else base


def cache_dir(ticker: str | None = None) -> Path:
    base = thesis_home() / 'cache'
    return base / safe_ticker_dir(ticker) if ticker else base


def config_path() -> Path:
    return thesis_home() / 'config.json'
