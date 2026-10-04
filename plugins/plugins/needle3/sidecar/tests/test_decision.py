import unittest

from ryu_needle3.decision import build_tools, parse_result


class NeedleDecisionTests(unittest.TestCase):
    def test_builds_closed_tools_from_current_choices(self):
        questions = {
            "operation": {
                "criteria": {"CLICK": "click", "DONE": "done", "BLOCKED": "blocked"}
            },
            "click_target": {
                "criteria": {
                    "1": {"element": "Save", "role": "button", "current_value": ""},
                    "2": {"element": "Cancel", "role": "button", "current_value": ""},
                }
            },
        }
        tools, mapping = build_tools(questions)
        self.assertEqual({"click_1", "click_2", "action_done", "action_blocked"}, {tool["name"] for tool in tools})
        self.assertEqual(mapping["click_1"], ("CLICK", "1"))
        self.assertEqual(mapping["action_done"], ("DONE", None))

    def test_rejects_empty_or_untrusted_function_calls(self):
        mapping = {"click_1": ("CLICK", "1")}
        self.assertEqual(
            parse_result(
                {
                    "type": "call",
                    "success": True,
                    "confidence": 0.8,
                    "function_calls": [{"name": "click_1", "arguments": {}}],
                },
                mapping,
            ),
            {"operation": "CLICK", "target": "1"},
        )
        for response in (
            {"type": "call", "success": True, "confidence": 0.8, "function_calls": []},
            {
                "type": "call",
                "success": True,
                "confidence": 0.1,
                "function_calls": [{"name": "click_1", "arguments": {}}],
            },
            {
                "type": "call",
                "success": True,
                "confidence": 0.9,
                "function_calls": [{"name": "shell", "arguments": {}}],
            },
        ):
            with self.assertRaises(ValueError):
                parse_result(response, mapping)

    def test_accepts_uncalibrated_score_only_for_one_closed_tool_call(self):
        mapping = {"action_blocked": ("BLOCKED", None)}
        self.assertEqual(
            parse_result(
                {
                    "type": "call",
                    "success": True,
                    "confidence": None,
                    "function_calls": [{"name": "action_blocked", "arguments": {}}],
                },
                mapping,
            ),
            {"operation": "BLOCKED", "target": None},
        )
        with self.assertRaisesRegex(ValueError, "missing its confidence field"):
            parse_result(
                {
                    "type": "call",
                    "success": True,
                    "function_calls": [{"name": "action_blocked", "arguments": {}}],
                },
                mapping,
            )


if __name__ == "__main__":
    unittest.main()
