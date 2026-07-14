# SPDX-License-Identifier: GPL-3.0-or-later
from __future__ import annotations

import json
import sys
import traceback
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

from core import (
    CredentialEntry,
    KeePassSheetError,
    fetch_sheet_entries,
    generate_databases,
    load_service_account_email,
    write_generation_logs,
)


def repair_unicode_text(value: object) -> str:
    """Normalize a possibly malformed UTF-16 string into valid Unicode."""
    if value is None:
        return ""
    text = str(value)
    try:
        return text.encode("utf-16", "surrogatepass").decode("utf-16", "replace")
    except (UnicodeError, LookupError):
        return text.encode("utf-8", "replace").decode("utf-8")


def sanitize_json_value(value: Any) -> Any:
    """Recursively make renderer/backend JSON safe for UTF-8 transport."""
    if isinstance(value, str):
        return repair_unicode_text(value)
    if isinstance(value, dict):
        return {repair_unicode_text(key): sanitize_json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize_json_value(item) for item in value]
    return value


def send(message: dict[str, Any]) -> None:
    safe_message = sanitize_json_value(message)
    sys.stdout.write(json.dumps(safe_message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def entry_from_dict(data: dict[str, Any]) -> CredentialEntry:
    return CredentialEntry(
        sheet_row=int(data.get("sheetRow") or data.get("sheet_row") or 0),
        name=repair_unicode_text(data.get("name") or ""),
        title=repair_unicode_text(data.get("title") or ""),
        username=repair_unicode_text(data.get("username") or ""),
        password=repair_unicode_text(data.get("password") or ""),
        url=repair_unicode_text(data.get("url") or ""),
        tags=repair_unicode_text(data.get("tags") or ""),
        notes=repair_unicode_text(data.get("notes") or ""),
        totp=repair_unicode_text(data.get("totp") or ""),
    )


def public_entry(entry: CredentialEntry) -> dict[str, Any]:
    data = asdict(entry)
    return {
        "sheetRow": data["sheet_row"],
        "name": data["name"],
        "title": data["title"],
        "username": data["username"],
        "password": data["password"],
        "url": data["url"],
        "tags": data["tags"],
        "notes": data["notes"],
        "totp": data["totp"],
    }


def build_success_logs(mode: str, entries: list[CredentialEntry], files: list[Path]) -> dict[int, str]:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if mode == "combined":
        name = files[0].name if files else "KDBX"
        message = f"✅ {timestamp}｜整表生成成功｜数据库：{name}｜共 {len(entries)} 条"
        return {entry.sheet_row: message for entry in entries}
    return {
        entry.sheet_row: f"✅ {timestamp}｜单行生成成功｜数据库：{path.name}"
        for entry, path in zip(entries, files)
    }


def build_failure_logs(entries: list[CredentialEntry], error: BaseException) -> dict[int, str]:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    text = str(error).replace("\n", " ").strip()[:300]
    return {entry.sheet_row: f"❌ {timestamp}｜生成失败｜{type(error).__name__}: {text}" for entry in entries}


def handle(request_id: str, command: str, payload: dict[str, Any]) -> dict[str, Any]:
    if command == "service_email":
        return {"email": load_service_account_email(repair_unicode_text(payload.get("path", "")))}

    if command == "fetch":
        result = fetch_sheet_entries(
            repair_unicode_text(payload.get("link", "")),
            repair_unicode_text(payload.get("sheetName", "")),
            repair_unicode_text(payload.get("serviceAccountJson", "")),
        )
        return {
            "spreadsheetId": result.spreadsheet_id,
            "sheetName": result.sheet_name,
            "serviceAccountEmail": result.service_account_email,
            "entries": [public_entry(entry) for entry in result.entries],
        }

    if command == "generate":
        entries = [entry_from_dict(item) for item in payload.get("entries", [])]
        mode = str(payload.get("mode", "combined"))

        def progress(done: int, total: int, message: str) -> None:
            send({
                "id": request_id,
                "type": "progress",
                "done": done,
                "total": total,
                "message": message,
            })

        try:
            result = generate_databases(
                entries=entries,
                output_dir=payload.get("outputDir", ""),
                mode=mode,
                combined_filename=payload.get("combinedFilename", ""),
                master_password=payload.get("masterPassword", ""),
                group_name=payload.get("groupName", "Google Sheets Import"),
                overwrite=bool(payload.get("overwrite", False)),
                source_name=payload.get("sourceName", "GoogleSheets"),
                progress=progress,
            )
            files = list(result.files)
            logs = build_success_logs(mode, entries, files)
            logs_written = False
            try:
                spreadsheet_id = str(payload.get("spreadsheetId", "")).strip()
                sheet_name = str(payload.get("sheetName", "")).strip()
                json_path = str(payload.get("serviceAccountJson", "")).strip()
                if spreadsheet_id and sheet_name and json_path:
                    write_generation_logs(spreadsheet_id, sheet_name, json_path, logs)
                    logs_written = True
            except Exception as log_error:
                print(f"[warning] KDBX generated but I-column log failed: {log_error}", file=sys.stderr, flush=True)

            return {
                "files": [str(path) for path in files],
                "entryCount": result.entry_count,
                "logsWritten": logs_written,
            }
        except Exception as exc:
            try:
                spreadsheet_id = str(payload.get("spreadsheetId", "")).strip()
                sheet_name = str(payload.get("sheetName", "")).strip()
                json_path = str(payload.get("serviceAccountJson", "")).strip()
                if spreadsheet_id and sheet_name and json_path and entries:
                    write_generation_logs(spreadsheet_id, sheet_name, json_path, build_failure_logs(entries, exc))
            except Exception as log_error:
                print(f"[warning] failure log write failed: {log_error}", file=sys.stderr, flush=True)
            raise

    if command == "ping":
        return {"ok": True}
    raise ValueError(f"未知命令：{command}")


def main() -> None:
    # Force UTF-8 pipes on Windows and replace malformed input bytes rather than
    # crashing the whole IPC service.
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

    # 这是 Electron 主程序调用的后台通信进程，不是用户界面。
    # 用户若直接双击该 EXE，则给出明确提示并退出，避免误以为程序打不开。
    try:
        interactive = bool(sys.stdin and sys.stdin.isatty())
    except Exception:
        interactive = False
    if interactive:
        print("KeePass Studio 后端组件。")
        print("请启动 KeePassStudio.exe，勿直接运行 keepass_backend.exe。")
        try:
            input("按 Enter 退出...")
        except Exception:
            pass
        return

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        request_id = ""
        try:
            request = sanitize_json_value(json.loads(line))
            request_id = str(request.get("id", ""))
            command = str(request.get("command", ""))
            payload = request.get("payload") or {}
            if not isinstance(payload, dict):
                raise ValueError("payload 必须是对象")
            result = handle(request_id, command, payload)
            send({"id": request_id, "type": "result", "result": result})
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            if isinstance(exc, KeePassSheetError):
                message = repair_unicode_text(exc)
            else:
                message = repair_unicode_text(f"{type(exc).__name__}: {exc}")
            send({"id": request_id, "type": "error", "error": message})


if __name__ == "__main__":
    main()
