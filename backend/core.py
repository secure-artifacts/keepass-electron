# SPDX-License-Identifier: GPL-3.0-or-later
from __future__ import annotations

import base64
import json
import os
import re
import tempfile
import time
from datetime import datetime
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Sequence
from urllib.parse import parse_qs, quote, urlparse

import pyotp
import requests
from google.auth.exceptions import GoogleAuthError, RefreshError
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account
from pykeepass import create_database


SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
# Backwards-compatible alias used by older tests/imports.
READONLY_SCOPE = SHEETS_SCOPE
REQUIRED_FIELDS = ("title", "username", "password", "url", "tags", "notes", "totp")
DISPLAY_HEADERS = {
    "name": "名称",
    "title": "\u6807\u9898",
    "username": "\u7528\u6237\u540d",
    "password": "\u5bc6\u7801",
    "url": "URL",
    "tags": "\u6807\u7b7e",
    "notes": "\u5907\u6ce8",
    "totp": "TOTP",
}
HEADER_ALIASES = {
    "\u540d\u79f0": "name",
    "name": "name",
    "filename": "name",
    "database": "name",
    "\u6807\u9898": "title",
    "title": "title",
    "\u7528\u6237\u540d": "username",
    "\u8d26\u53f7": "username",
    "\u5e10\u53f7": "username",
    "username": "username",
    "user": "username",
    "\u5bc6\u7801": "password",
    "password": "password",
    "pass": "password",
    "url": "url",
    "\u7f51\u5740": "url",
    "\u94fe\u63a5": "url",
    "\u6807\u7b7e": "tags",
    "tag": "tags",
    "tags": "tags",
    "\u5907\u6ce8": "notes",
    "\u8bf4\u660e": "notes",
    "note": "notes",
    "notes": "notes",
    "totp": "totp",
    "otp": "totp",
    "2fa": "totp",
    "运行日志": "log",
    "日志": "log",
    "log": "log",
}


class KeePassSheetError(Exception):
    """Base exception for user-facing failures."""


class ConfigurationError(KeePassSheetError):
    """Configuration is missing or invalid."""


class SheetDataError(KeePassSheetError):
    """The sheet content cannot be converted safely."""


class TotpFormatError(KeePassSheetError):
    """A TOTP value is not supported."""


class GenerationError(KeePassSheetError):
    """KDBX generation failed."""


@dataclass(frozen=True)
class CredentialEntry:
    sheet_row: int
    name: str
    title: str
    username: str
    password: str
    url: str
    tags: str
    notes: str
    totp: str


@dataclass(frozen=True)
class SheetFetchResult:
    spreadsheet_id: str
    sheet_name: str
    service_account_email: str
    entries: tuple[CredentialEntry, ...]


@dataclass(frozen=True)
class PreparedEntry:
    source: CredentialEntry
    tag_list: tuple[str, ...]
    otp_uri: str | None
    keepass_totp_fields: tuple[tuple[str, str, bool], ...]


@dataclass(frozen=True)
class GenerationResult:
    files: tuple[Path, ...]
    entry_count: int


ProgressCallback = Callable[[int, int, str], None]


def _repair_unicode_text(value: object) -> str:
    """Return valid Unicode text that can always be encoded as UTF-8.

    Electron/Chromium can occasionally pass a JavaScript string containing an
    unpaired UTF-16 surrogate (for example ``\\udca8``).  Such a value is not
    valid Unicode and causes urllib/json UTF-8 encoding to fail.  Valid
    characters, including emoji, are preserved; only isolated surrogate code
    units are replaced with U+FFFD.
    """
    if value is None:
        return ""
    text = str(value)
    try:
        return text.encode("utf-16", "surrogatepass").decode("utf-16", "replace")
    except (UnicodeError, LookupError):
        return text.encode("utf-8", "replace").decode("utf-8")


def _string(value: object) -> str:
    return _repair_unicode_text(value)


def _text(value: object) -> str:
    return _string(value).strip()


def _normalize_header(value: object) -> str:
    text = unicodedata.normalize("NFKC", _text(value)).replace("\ufeff", "")
    return re.sub(r"\s+", "", text).casefold()


def _header_mapping(row: Sequence[object]) -> tuple[dict[str, int], list[str]]:
    mapping: dict[str, int] = {}
    duplicates: list[str] = []
    for index, cell in enumerate(row):
        canonical = HEADER_ALIASES.get(_normalize_header(cell))
        if not canonical:
            continue
        if canonical in mapping:
            duplicates.append(DISPLAY_HEADERS[canonical])
        else:
            mapping[canonical] = index
    return mapping, duplicates


def parse_sheet_values(
    values: Sequence[Sequence[object]],
) -> tuple[CredentialEntry, ...]:
    """Convert a Google Sheets values response into validated entries."""
    if not values:
        raise SheetDataError(
            "\u8868\u683c\u6ca1\u6709\u53ef\u8bfb\u53d6\u7684\u5185\u5bb9\u3002"
        )

    header_index: int | None = None
    header_map: dict[str, int] = {}
    duplicate_headers: list[str] = []

    # Search the first 20 rows so a title or note above the header does not break import.
    for idx, row in enumerate(values[:20]):
        candidate_map, candidate_duplicates = _header_mapping(row)
        if all(field in candidate_map for field in REQUIRED_FIELDS):
            header_index = idx
            header_map = candidate_map
            duplicate_headers = candidate_duplicates
            break

    if header_index is None:
        first_non_empty_index = next(
            (
                idx
                for idx, row in enumerate(values[:20])
                if any(_text(cell) for cell in row)
            ),
            0,
        )
        candidate_map, candidate_duplicates = _header_mapping(
            values[first_non_empty_index]
        )
        missing = [
            DISPLAY_HEADERS[field]
            for field in REQUIRED_FIELDS
            if field not in candidate_map
        ]
        details = (
            "\u3001".join(missing) if missing else "\u672a\u8bc6\u522b\u8868\u5934"
        )
        raise SheetDataError(
            "\u627e\u4e0d\u5230\u5b8c\u6574\u8868\u5934\u3002"
            f"\u7f3a\u5c11\uff1a{details}\u3002"
            "\u8bf7\u4f7f\u7528\uff1a\u6807\u9898\u3001\u7528\u6237\u540d\u3001\u5bc6\u7801\u3001URL\u3001\u6807\u7b7e\u3001\u5907\u6ce8\u3001TOTP\u3002"
        )

    if duplicate_headers:
        names = "\u3001".join(sorted(set(duplicate_headers)))
        raise SheetDataError(
            f"\u8868\u5934\u91cd\u590d\uff1a{names}\u3002\u6bcf\u4e2a\u5b57\u6bb5\u53ea\u80fd\u51fa\u73b0\u4e00\u6b21\u3002"
        )

    entries: list[CredentialEntry] = []
    for zero_based_index, row in enumerate(
        values[header_index + 1 :], start=header_index + 1
    ):

        def value_for(field: str) -> str:
            column = header_map[field]
            return _string(row[column]) if column < len(row) else ""

        fields = {field: value_for(field) for field in REQUIRED_FIELDS}
        name_column = header_map.get("name")
        raw_name = _string(row[name_column]) if name_column is not None and name_column < len(row) else ""
        if not any(value.strip() for value in fields.values()) and not raw_name.strip():
            continue

        sheet_row = zero_based_index + 1
        title = (
            fields["title"].strip()
            or f"\u672a\u547d\u540d\uff08\u8868\u683c\u7b2c {sheet_row} \u884c\uff09"
        )
        name = raw_name.strip() or title
        entries.append(
            CredentialEntry(
                sheet_row=sheet_row,
                name=name,
                title=title,
                username=fields["username"].strip(),
                password=fields["password"],
                url=fields["url"].strip(),
                tags=fields["tags"].strip(),
                notes=fields["notes"],
                totp=fields["totp"].strip(),
            )
        )

    if not entries:
        raise SheetDataError(
            "\u8868\u593c\u53ea\u6709\u8868\u5934\uff0c\u6ca1\u6709\u53ef\u751f\u6210\u7684\u6570\u636e\u884c\u3002"
        )
    return tuple(entries)


def extract_spreadsheet_id(link_or_id: str) -> str:
    """Accept a normal Google Sheets URL or a raw spreadsheet ID."""
    value = link_or_id.strip()
    if not value:
        raise ConfigurationError(
            "\u8bf7\u8f93\u5165 Google \u8868\u683c\u94fe\u63a5\u6216 Spreadsheet ID\u3002"
        )

    direct_match = re.fullmatch(r"[A-Za-z0-9_-]{20,}", value)
    if direct_match:
        return value

    match = re.search(
        r"/spreadsheets/(?:u/\d+/)?d/([A-Za-z0-9_-]{20,})(?:/|$)",
        value,
    )
    if match:
        return match.group(1)

    parsed = urlparse(value)
    query = parse_qs(parsed.query)
    query_id = query.get("id") or query.get("key")
    if query_id and re.fullmatch(r"[A-Za-z0-9_-]{20,}", query_id[0]):
        return query_id[0]

    raise ConfigurationError(
        "\u65e0\u6cd5\u4ece\u8f93\u5165\u4e2d\u8bc6\u522b Spreadsheet ID\u3002"
        "\u8bf7\u7c98\u8d34\u5b8c\u6574\u7684 Google Sheets \u94fe\u63a5\u3002"
    )


def load_service_account_email(json_path: str | Path) -> str:
    path = Path(json_path).expanduser()
    if not path.is_file():
        raise ConfigurationError(
            "\u670d\u52a1\u8d26\u53f7 JSON \u6587\u4ef6\u4e0d\u5b58\u5728\u3002"
        )
    try:
        info = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigurationError(
            "\u670d\u52a1\u8d26\u53f7 JSON \u6587\u4ef6\u65e0\u6cd5\u8bfb\u53d6\u6216\u683c\u5f0f\u9519\u8bef\u3002"
        ) from exc

    if not isinstance(info, dict):
        raise ConfigurationError(
            "\u670d\u52a1\u8d26\u53f7 JSON \u7684\u9876\u5c42\u7ed3\u6784\u5fc5\u987b\u662f\u5bf9\u8c61\u3002"
        )

    if info.get("type") != "service_account":
        raise ConfigurationError(
            "\u9009\u62e9\u7684 JSON \u4e0d\u662f Google \u670d\u52a1\u8d26\u53f7\u5bc6\u94a5\u6587\u4ef6\u3002"
        )

    email = _text(info.get("client_email"))
    private_key = _string(info.get("private_key"))
    token_uri = _text(info.get("token_uri"))
    token_target = urlparse(token_uri)

    if not email or not email.casefold().endswith(".gserviceaccount.com"):
        raise ConfigurationError(
            "\u670d\u52a1\u8d26\u53f7 JSON \u4e2d\u7684 client_email \u65e0\u6548\u3002"
        )
    if not private_key.startswith("-----BEGIN PRIVATE KEY-----"):
        raise ConfigurationError(
            "\u670d\u52a1\u8d26\u53f7 JSON \u4e2d\u7f3a\u5c11\u6709\u6548\u7684 private_key\u3002"
        )
    if token_target.scheme != "https" or token_target.hostname not in {
        "oauth2.googleapis.com",
        "www.googleapis.com",
    }:
        raise ConfigurationError(
            "\u670d\u52a1\u8d26\u53f7 JSON \u4e2d\u7684 token_uri \u65e0\u6548\u3002"
        )
    return email


def fetch_sheet_entries(
    link_or_id: str,
    sheet_name: str,
    service_account_json: str | Path,
) -> SheetFetchResult:
    spreadsheet_id = extract_spreadsheet_id(link_or_id)
    sheet_name = sheet_name.strip()
    if not sheet_name:
        raise ConfigurationError(
            "\u8bf7\u8f93\u5165 Sheet \u540d\u79f0\uff08\u5e95\u90e8\u6807\u7b7e\u9875\u540d\uff09\u3002"
        )

    json_path = Path(service_account_json).expanduser()
    email = load_service_account_email(json_path)

    try:
        credentials = service_account.Credentials.from_service_account_file(
            str(json_path),
            scopes=[SHEETS_SCOPE],
        )
        escaped_sheet_name = sheet_name.replace("'", "''")
        range_name = f"'{escaped_sheet_name}'!A:I"
        endpoint = (
            "https://sheets.googleapis.com/v4/spreadsheets/"
            f"{quote(spreadsheet_id, safe='', encoding='utf-8', errors='replace')}/values/{quote(range_name, safe='', encoding='utf-8', errors='replace')}"
        )
        params = {
            "valueRenderOption": "FORMATTED_VALUE",
            "dateTimeRenderOption": "FORMATTED_STRING",
            "majorDimension": "ROWS",
        }
        transient_statuses = {429, 500, 502, 503, 504}
        with AuthorizedSession(credentials, refresh_timeout=20) as session:
            for attempt in range(2):
                try:
                    api_response = session.get(
                        endpoint,
                        params=params,
                        timeout=(10, 30),
                    )
                except requests.RequestException:
                    if attempt == 1:
                        raise
                    time.sleep(2**attempt)
                    continue

                if api_response.status_code in transient_statuses and attempt < 1:
                    retry_after = api_response.headers.get("Retry-After", "")
                    try:
                        delay = min(10.0, max(0.0, float(retry_after)))
                    except ValueError:
                        delay = float(2**attempt)
                    time.sleep(delay)
                    continue
                break
        status = api_response.status_code
        if status >= 400:
            if status == 400:
                message = "\u8bf7\u6c42\u65e0\u6548\u3002\u8bf7\u68c0\u67e5 Sheet \u540d\u79f0\u662f\u5426\u4e0e\u5e95\u90e8\u6807\u7b7e\u9875\u5b8c\u5168\u4e00\u81f4\u3002"
            elif status == 403:
                message = (
                    "\u65e0\u6743\u8bfb\u53d6\u8868\u683c\uff0c\u6216 Google Sheets API \u5c1a\u672a\u542f\u7528\u3002"
                    f"请把该表格以‘编辑者’权限共享给：{email}"
                )
            elif status == 404:
                message = "\u627e\u4e0d\u5230\u8868\u683c\u3002\u8bf7\u68c0\u67e5\u94fe\u63a5\uff0c\u5e76\u786e\u8ba4\u5df2\u5171\u4eab\u7ed9\u670d\u52a1\u8d26\u53f7\u3002"
            else:
                message = f"Google Sheets API \u8fd4\u56de\u9519\u8bef\uff08HTTP {status}\uff09\u3002"
            raise ConfigurationError(message)
        try:
            response = api_response.json()
        except ValueError as exc:
            raise ConfigurationError(
                "Google Sheets API \u8fd4\u56de\u4e86\u65e0\u6cd5\u89e3\u6790\u7684\u54cd\u5e94\u3002"
            ) from exc
        if not isinstance(response, dict):
            raise ConfigurationError(
                "Google Sheets API \u8fd4\u56de\u4e86\u975e\u9884\u671f\u683c\u5f0f\u7684\u54cd\u5e94\u3002"
            )
    except ConfigurationError:
        raise
    except (RefreshError, GoogleAuthError) as exc:
        raise ConfigurationError(
            "\u670d\u52a1\u8d26\u53f7\u8ba4\u8bc1\u5931\u8d25\u3002\u8bf7\u68c0\u67e5 JSON \u5bc6\u94a5\u662f\u5426\u6709\u6548\u3002"
        ) from exc
    except requests.RequestException as exc:
        raise ConfigurationError(
            "\u8fde\u63a5 Google Sheets API \u5931\u8d25\u3002\u8bf7\u68c0\u67e5\u7f51\u7edc\u3001\u4ee3\u7406\u6216\u9632\u706b\u5899\u8bbe\u7f6e\u3002"
        ) from exc
    except OSError as exc:
        raise ConfigurationError(
            "\u65e0\u6cd5\u8bfb\u53d6\u672c\u5730\u670d\u52a1\u8d26\u53f7\u6587\u4ef6\u3002"
        ) from exc

    entries = parse_sheet_values(response.get("values", []))
    return SheetFetchResult(
        spreadsheet_id=spreadsheet_id,
        sheet_name=sheet_name,
        service_account_email=email,
        entries=entries,
    )



def write_generation_logs(
    spreadsheet_id: str,
    sheet_name: str,
    service_account_json: str | Path,
    row_messages: dict[int, str],
) -> None:
    """Write generation results to column I without touching columns A:H.

    The service account must have Editor permission because the software writes
    only the per-row running log requested by the user.
    """
    if not row_messages:
        return
    json_path = Path(service_account_json).expanduser()
    load_service_account_email(json_path)
    try:
        credentials = service_account.Credentials.from_service_account_file(
            str(json_path), scopes=[SHEETS_SCOPE]
        )
        endpoint = (
            "https://sheets.googleapis.com/v4/spreadsheets/"
            f"{quote(spreadsheet_id, safe='', encoding='utf-8', errors='replace')}/values:batchUpdate"
        )
        escaped = sheet_name.replace("'", "''")
        items = [
            {
                "range": f"'{escaped}'!I{int(row)}",
                "majorDimension": "ROWS",
                "values": [[message]],
            }
            for row, message in sorted(row_messages.items())
        ]
        payload = {
            "valueInputOption": "RAW",
            "includeValuesInResponse": False,
            "data": items,
        }
        with AuthorizedSession(credentials, refresh_timeout=20) as session:
            response = session.post(endpoint, json=payload, timeout=(10, 30))
        if response.status_code >= 400:
            if response.status_code == 403:
                raise ConfigurationError(
                    "无法写入 I 列运行日志。请把表格以‘编辑者’权限共享给服务账号。"
                )
            raise ConfigurationError(
                f"写入 I 列运行日志失败（HTTP {response.status_code}）。"
            )
    except ConfigurationError:
        raise
    except (RefreshError, GoogleAuthError) as exc:
        raise ConfigurationError("服务账号认证失败，无法写入运行日志。") from exc
    except requests.RequestException as exc:
        raise ConfigurationError("连接 Google Sheets API 失败，无法写入运行日志。") from exc
    except OSError as exc:
        raise ConfigurationError("无法读取服务账号 JSON，运行日志未写入。") from exc

def split_tags(raw_tags: str) -> tuple[str, ...]:
    if not raw_tags.strip():
        return ()
    parts = re.split(r"[,;\uff0c\uff1b\n]+", raw_tags)
    deduplicated: list[str] = []
    seen: set[str] = set()
    for part in parts:
        tag = part.strip()
        key = tag.casefold()
        if tag and key not in seen:
            deduplicated.append(tag)
            seen.add(key)
    return tuple(deduplicated)


def normalize_totp(raw_totp: str, title: str, username: str) -> str | None:
    """Return an otpauth://totp URI, accepting either a URI or a Base32 secret."""
    raw = raw_totp.strip()
    if not raw:
        return None

    lowered = raw.casefold()
    if lowered.startswith("otpauth-migration://"):
        raise TotpFormatError(
            "\u4e0d\u652f\u6301 Google Authenticator \u7684 migration \u5bfc\u51fa\u94fe\u63a5\u3002"
            "\u8bf7\u4f7f\u7528\u5355\u4e2a\u8d26\u53f7\u7684 otpauth://totp \u94fe\u63a5\u6216 Base32 \u5bc6\u94a5\u3002"
        )

    if lowered.startswith("otpauth://"):
        try:
            parsed = pyotp.parse_uri(raw)
        except Exception as exc:
            raise TotpFormatError(
                "otpauth \u94fe\u63a5\u683c\u5f0f\u65e0\u6548\u3002"
            ) from exc
        if not isinstance(parsed, pyotp.TOTP):
            raise TotpFormatError(
                "\u53ea\u652f\u6301 TOTP\uff0c\u4e0d\u652f\u6301 HOTP/counter \u7c7b\u578b\u3002"
            )
        return raw

    secret = re.sub(r"[\s-]+", "", raw).upper()
    if not re.fullmatch(r"[A-Z2-7]+=*", secret):
        raise TotpFormatError(
            "TOTP \u4e0d\u662f\u6709\u6548\u7684 Base32 \u5bc6\u94a5\uff0c\u4e5f\u4e0d\u662f otpauth://totp \u94fe\u63a5\u3002"
        )
    unpadded = secret.rstrip("=")
    if len(unpadded) < 8:
        raise TotpFormatError("Base32 TOTP \u5bc6\u94a5\u8fc7\u77ed\u3002")
    padded = unpadded + ("=" * ((8 - len(unpadded) % 8) % 8))
    try:
        decoded = base64.b32decode(padded, casefold=True)
    except Exception as exc:
        raise TotpFormatError(
            "Base32 TOTP \u5bc6\u94a5\u65e0\u6cd5\u89e3\u7801\u3002"
        ) from exc
    if not decoded:
        raise TotpFormatError("Base32 TOTP \u5bc6\u94a5\u4e3a\u7a7a\u3002")

    account_name = username.strip() or title.strip() or "account"
    issuer_name = title.strip() or "Google Sheets"
    return pyotp.TOTP(unpadded).provisioning_uri(
        name=account_name,
        issuer_name=issuer_name,
    )


def keepass_totp_fields(
    otp_uri: str | None,
) -> tuple[tuple[str, str, bool], ...]:
    """Return native KeePass 2.x TimeOtp fields for a validated TOTP URI.

    KeePassXC commonly recognizes a protected ``otp`` custom field containing
    the full otpauth URI. Classic KeePass 2.x uses the ``TimeOtp-*`` custom
    fields. Writing both conventions keeps one KDBX useful in either client.
    """
    if not otp_uri:
        return ()

    try:
        parsed = pyotp.parse_uri(otp_uri)
    except Exception as exc:
        raise TotpFormatError(
            "otpauth \u94fe\u63a5\u683c\u5f0f\u65e0\u6548\u3002"
        ) from exc
    if not isinstance(parsed, pyotp.TOTP):
        raise TotpFormatError(
            "\u53ea\u652f\u6301 TOTP\uff0c\u4e0d\u652f\u6301 HOTP/counter \u7c7b\u578b\u3002"
        )

    digest_name = parsed.digest().name.casefold().replace("-", "")
    algorithm = {
        "sha1": "HMAC-SHA-1",
        "sha256": "HMAC-SHA-256",
        "sha512": "HMAC-SHA-512",
    }.get(digest_name)
    if algorithm is None:
        raise TotpFormatError(
            "KeePass \u4e0d\u652f\u6301\u8be5 TOTP \u7b97\u6cd5\u3002"
        )

    secret = re.sub(r"[\s-]+", "", parsed.secret).upper().rstrip("=")
    return (
        ("TimeOtp-Secret-Base32", secret, True),
        ("TimeOtp-Length", str(parsed.digits), False),
        ("TimeOtp-Period", str(parsed.interval), False),
        ("TimeOtp-Algorithm", algorithm, False),
    )


def prepare_entries(entries: Iterable[CredentialEntry]) -> tuple[PreparedEntry, ...]:
    prepared: list[PreparedEntry] = []
    for entry in entries:
        try:
            otp_uri = normalize_totp(entry.totp, entry.title, entry.username)
            native_fields = keepass_totp_fields(otp_uri)
        except TotpFormatError as exc:
            raise SheetDataError(
                f"\u8868\u683c\u7b2c {entry.sheet_row} \u884c\u7684 TOTP \u65e0\u6548\uff1a{exc}"
            ) from exc
        prepared.append(
            PreparedEntry(
                source=entry,
                tag_list=split_tags(entry.tags),
                otp_uri=otp_uri,
                keepass_totp_fields=native_fields,
            )
        )
    if not prepared:
        raise SheetDataError(
            "\u6ca1\u6709\u9009\u4e2d\u53ef\u751f\u6210\u7684\u6570\u636e\u884c\u3002"
        )
    return tuple(prepared)


_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def safe_filename(value: str, fallback: str = "database", max_length: int = 100) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    normalized = re.sub(r"[\x00-\x1f\x7f<>:\"/\\|?*]+", "_", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .")
    if not normalized:
        normalized = fallback
    if normalized.split(".", 1)[0].upper() in _WINDOWS_RESERVED_NAMES:
        normalized = f"_{normalized}"
    if len(normalized) > max_length:
        normalized = normalized[:max_length].rstrip(" .")
    return normalized or fallback


def _replace_filename_tokens(
    pattern: str,
    *,
    source_name: str,
    row_id: int | None = None,
    title: str = "",
    username: str = "",
    timestamp: str,
) -> str:
    replacements = {
        "{Source}": safe_filename(source_name, fallback="GoogleSheets", max_length=35),
        "{RowID}": f"{row_id:04d}" if row_id is not None else "",
        "{Title}": safe_filename(title, fallback="untitled", max_length=70),
        "{Username}": safe_filename(username, fallback="user", max_length=40),
        "{Time}": timestamp,
    }
    value = pattern
    for token, replacement in replacements.items():
        value = value.replace(token, replacement)
    return value


def _combined_filename(
    filename: str,
    *,
    source_name: str = "GoogleSheets",
    timestamp: str | None = None,
) -> str:
    stamp = timestamp or datetime.now().strftime("%Y%m%d-%H%M%S")
    expanded = _replace_filename_tokens(
        filename.strip() or "KeePassStudio-{Time}.kdbx",
        source_name=source_name,
        timestamp=stamp,
    )
    raw = Path(expanded).name
    if raw.casefold().endswith(".kdbx"):
        raw = raw[:-5]
    return f"{safe_filename(raw, fallback='passwords', max_length=110)}.kdbx"


def plan_output_files(
    entries: Sequence[CredentialEntry],
    output_dir: str | Path,
    mode: str,
    combined_filename: str,
    separate_pattern: str = "",
    source_name: str = "GoogleSheets",
) -> tuple[Path, ...]:
    directory = Path(output_dir).expanduser()
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    if mode == "combined":
        return (
            directory
            / _combined_filename(
                combined_filename,
                source_name=source_name,
                timestamp=stamp,
            ),
        )
    if mode != "separate":
        raise ConfigurationError("未知的生成方式。")

    # Per-row mode is intentionally deterministic: column A (名称) is the
    # database name and output filename.  ``separate_pattern`` is retained in
    # the API for backwards compatibility but is no longer used.
    paths: list[Path] = []
    used_names: set[str] = set()
    for entry in entries:
        base = safe_filename(
            entry.name,
            fallback=f"row-{entry.sheet_row:04d}_{entry.title}",
            max_length=120,
        )
        candidate = f"{base}.kdbx"
        suffix = 2
        while candidate.casefold() in used_names:
            candidate = f"{base}_{suffix}.kdbx"
            suffix += 1
        used_names.add(candidate.casefold())
        paths.append(directory / candidate)
    return tuple(paths)


def _chmod_private(path: Path) -> None:
    try:
        path.chmod(0o600)
    except OSError:
        # Windows ACLs and some removable filesystems do not use POSIX mode bits.
        pass


def _write_database_atomic(
    final_path: Path,
    prepared_entries: Sequence[PreparedEntry],
    master_password: str,
    group_name: str,
    database_name: str,
    on_entry_added: Callable[[int], None] | None = None,
) -> None:
    final_path.parent.mkdir(parents=True, exist_ok=True)
    group_name = group_name.strip() or "Google Sheets Import"

    try:
        with tempfile.TemporaryDirectory(
            prefix=".keepass-sheet-",
            dir=str(final_path.parent),
        ) as temp_dir:
            temp_path = Path(temp_dir) / "database.kdbx"
            database = create_database(str(temp_path), password=master_password)
            database.root_group.name = safe_filename(
                database_name,
                fallback=final_path.stem or "KeePass Database",
                max_length=120,
            )
            group = database.add_group(database.root_group, group_name)

            for index, prepared in enumerate(prepared_entries, start=1):
                source = prepared.source
                target_entry = database.add_entry(
                    group,
                    title=source.title,
                    username=source.username,
                    password=source.password,
                    url=source.url or None,
                    notes=source.notes or None,
                    tags=list(prepared.tag_list) or None,
                    otp=prepared.otp_uri,
                    # Google Sheets may legitimately contain duplicate title/username
                    # pairs. Every non-empty sheet row must become its own entry.
                    force_creation=True,
                )
                for key, value, protect in prepared.keepass_totp_fields:
                    target_entry.set_custom_property(key, value, protect=protect)
                if on_entry_added:
                    on_entry_added(index)

            database.save()
            if not temp_path.is_file() or temp_path.stat().st_size < 128:
                raise GenerationError(
                    "\u751f\u6210\u7684 KDBX \u6587\u4ef6\u5f02\u5e38\u6216\u4e3a\u7a7a\u3002"
                )
            os.replace(temp_path, final_path)
            _chmod_private(final_path)
    except KeePassSheetError:
        raise
    except Exception as exc:
        raise GenerationError(
            f"\u5199\u5165 KDBX \u6587\u4ef6\u5931\u8d25\uff1a{final_path.name}"
        ) from exc


def generate_databases(
    entries: Sequence[CredentialEntry],
    output_dir: str | Path,
    mode: str,
    combined_filename: str,
    master_password: str,
    group_name: str,
    overwrite: bool = False,
    separate_pattern: str = "",
    source_name: str = "GoogleSheets",
    progress: ProgressCallback | None = None,
) -> GenerationResult:
    if not master_password:
        raise ConfigurationError(
            "KeePass \u4e3b\u5bc6\u7801\u4e0d\u80fd\u4e3a\u7a7a\u3002"
        )
    if mode not in {"combined", "separate"}:
        raise ConfigurationError("\u751f\u6210\u65b9\u5f0f\u65e0\u6548\u3002")

    directory = Path(output_dir).expanduser()
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ConfigurationError(
            "\u8f93\u51fa\u76ee\u5f55\u65e0\u6cd5\u521b\u5efa\u6216\u5199\u5165\u3002"
        ) from exc
    if not directory.is_dir():
        raise ConfigurationError(
            "\u8f93\u51fa\u8def\u5f84\u4e0d\u662f\u76ee\u5f55\u3002"
        )

    prepared = prepare_entries(entries)
    output_paths = plan_output_files(
        [item.source for item in prepared],
        directory,
        mode,
        combined_filename,
        separate_pattern=separate_pattern,
        source_name=source_name,
    )
    existing = [path for path in output_paths if path.exists()]
    if existing and not overwrite:
        raise GenerationError(
            f"\u6709 {len(existing)} \u4e2a\u540c\u540d\u6587\u4ef6\u5df2\u5b58\u5728\uff0c\u672a\u5141\u8bb8\u8986\u76d6\u3002"
        )

    written: list[Path] = []
    if mode == "combined":
        total = len(prepared)
        if progress:
            progress(0, total, "\u6b63\u5728\u521b\u5efa KDBX \u6570\u636e\u5e93\u2026")

        def combined_progress(done: int) -> None:
            if progress:
                progress(
                    done,
                    total,
                    f"\u6b63\u5728\u5199\u5165\u7b2c {done}/{total} \u6761\u8bb0\u5f55\u2026",
                )

        _write_database_atomic(
            output_paths[0],
            prepared,
            master_password,
            group_name,
            database_name=output_paths[0].stem,
            on_entry_added=combined_progress,
        )
        written.append(output_paths[0])
        if progress:
            progress(
                total, total, "\u5408\u5e76\u6570\u636e\u5e93\u5df2\u751f\u6210\u3002"
            )
    else:
        total = len(prepared)
        if progress:
            progress(
                0, total, "\u6b63\u5728\u521b\u5efa\u5355\u884c KDBX \u6587\u4ef6\u2026"
            )
        for index, (prepared_entry, path) in enumerate(
            zip(prepared, output_paths),
            start=1,
        ):
            try:
                _write_database_atomic(
                    path,
                    (prepared_entry,),
                    master_password,
                    group_name,
                    database_name=prepared_entry.source.name,
                )
            except GenerationError as exc:
                raise GenerationError(
                    f"{exc}\n\u5df2\u6210\u529f\u751f\u6210 {len(written)}/{total} \u4e2a\u6587\u4ef6\u3002"
                ) from exc
            written.append(path)
            if progress:
                progress(
                    index,
                    total,
                    f"\u5df2\u751f\u6210 {index}/{total} \u4e2a\u6587\u4ef6\u2026",
                )

    return GenerationResult(files=tuple(written), entry_count=len(prepared))
