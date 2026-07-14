from __future__ import annotations

import io
import json
import sys
import unittest

import backend_server
import core


class UnicodeTransportTests(unittest.TestCase):
    def test_lone_surrogate_is_repaired(self) -> None:
        malformed = "abc\udca8def"
        self.assertEqual(core._string(malformed), "abc�def")
        self.assertEqual(backend_server.repair_unicode_text(malformed), "abc�def")

    def test_valid_emoji_is_preserved(self) -> None:
        self.assertEqual(core._string("🔐 KeePass"), "🔐 KeePass")

    def test_recursive_json_sanitizer(self) -> None:
        data = {"sheetName": "Sheet\udca8", "values": ["😀", "x\udca8y"]}
        safe = backend_server.sanitize_json_value(data)
        self.assertEqual(safe["sheetName"], "Sheet�")
        self.assertEqual(safe["values"], ["😀", "x�y"])

    def test_send_always_emits_valid_utf8_json(self) -> None:
        output = io.StringIO()
        original = sys.stdout
        try:
            sys.stdout = output
            backend_server.send({"id": "1", "value": "a\udca8b"})
        finally:
            sys.stdout = original
        decoded = json.loads(output.getvalue())
        self.assertEqual(decoded["value"], "a�b")


if __name__ == "__main__":
    unittest.main()
