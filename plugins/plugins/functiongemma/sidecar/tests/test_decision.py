import unittest

from ryu_functiongemma.decision import build_tool, compact_observations, parse_call


class FunctionGemmaDecisionTests(unittest.TestCase):
    def setUp(self):
        self.questions = {
            "operation": {
                "criteria": {"CLICK": "click", "DONE": "done", "BLOCKED": "blocked"}
            },
            "click_target": {
                "criteria": {
                    "1": {"element": "Save", "role": "button"},
                    "2": {"element": "Cancel", "role": "button"},
                }
            },
        }

    def test_schema_contains_only_current_closed_choices(self):
        tool, operations, click_targets, type_targets = build_tool(self.questions)
        parameters = tool["function"]["parameters"]
        self.assertEqual(parameters["properties"]["operation"]["enum"], ["BLOCKED", "CLICK", "DONE"])
        self.assertEqual(parameters["properties"]["target"]["enum"], ["none", "1", "2"])
        self.assertEqual(operations, {"CLICK", "DONE", "BLOCKED"})
        self.assertEqual(click_targets, {"1", "2"})
        self.assertEqual(type_targets, set())

    def test_compacts_untrusted_controls_and_recent_history(self):
        state = {
            "task": "Click Save",
            "page": {"app": "Editor", "title": "Draft"},
            "recent_actions": [
                {"operation": f"STEP-{index}", "page_changed": index % 2 == 0}
                for index in range(10)
            ],
        }
        questions = {
            **self.questions,
            "click_target": {
                "criteria": {
                    "1": {
                        "element": "[1] " + "Save " * 100,
                        "role": "button",
                        "current_value": "x" * 1000,
                    }
                }
            },
        }
        compact = compact_observations(state, questions)
        self.assertEqual(len(compact["recent_actions"]), 4)
        self.assertLessEqual(len(compact["controls"][0]["element"]), 160)
        self.assertLessEqual(len(compact["controls"][0]["current_value"]), 128)

    def test_rejects_operations_outside_the_shadow_contract(self):
        invalid = {"operation": {"criteria": {"OPEN_SHELL": "run"}}}
        with self.assertRaises(ValueError):
            build_tool(invalid)

    def test_parses_one_closed_function_call(self):
        output = (
            "<start_function_call>call:computer_use_action{"
            "operation:<escape>CLICK<escape>,target:<escape>2<escape>"
            "}<end_function_call>"
        )
        self.assertEqual(
            parse_call(output, {"CLICK", "DONE"}, {"2"}, set()),
            {"operation": "CLICK", "target": "2"},
        )

    def test_rejects_unknown_targets_and_invalid_targetless_actions(self):
        wrong_target = (
            "<start_function_call>call:computer_use_action{"
            "operation:<escape>CLICK<escape>,target:<escape>9<escape>"
            "}<end_function_call>"
        )
        with self.assertRaises(ValueError):
            parse_call(wrong_target, {"CLICK"}, {"1"}, set())

        wrong_done = (
            "<start_function_call>call:computer_use_action{"
            "operation:<escape>DONE<escape>,target:<escape>1<escape>"
            "}<end_function_call>"
        )
        with self.assertRaises(ValueError):
            parse_call(wrong_done, {"DONE"}, {"1"}, set())


if __name__ == "__main__":
    unittest.main()
