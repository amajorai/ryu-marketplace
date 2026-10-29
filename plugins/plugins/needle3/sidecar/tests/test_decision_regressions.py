"""Current-catalog isolation and confidence regressions for real decision helpers."""

import unittest

from ryu_needle3.decision import MAX_TOOL_COUNT, build_tools, parse_result


def result(name, confidence=0.8, arguments=None):
    return {"type": "call", "success": True, "confidence": confidence,
            "function_calls": [{"name": name, "arguments": {} if arguments is None else arguments}]}


class NeedleClosedActionTests(unittest.TestCase):
    def setUp(self):
        self.questions = {
            "operation": {"criteria": {"CLICK": "click", "TYPE_TEXT": "type", "DONE": "done"}},
            "click_target": {"criteria": {"1": {"element": "Save", "role": "button"}}},
            "type_text_target": {"criteria": {"2": {"element": "Name", "role": "textbox"}}},
        }
        self.tools, self.mapping = build_tools(self.questions)

    def test_click_and_type_use_separate_closed_target_catalogs(self):
        self.assertEqual(set(self.mapping), {"click_1", "type_text_2", "action_done"})
        self.assertEqual(parse_result(result("type_text_2"), self.mapping), {"operation": "TYPE_TEXT", "target": "2"})
        for name in ("click_2", "type_text_1"):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "outside the current action catalog"):
                parse_result(result(name), self.mapping)
        for tool in self.tools:
            self.assertEqual(tool["parameters"], {"type": "object", "properties": {}, "required": []})

    def test_new_observation_invalidates_a_previous_target(self):
        questions = {**self.questions, "click_target": {"criteria": {"3": {"element": "Confirm"}}}}
        _, mapping = build_tools(questions)
        with self.assertRaisesRegex(ValueError, "outside the current action catalog"):
            parse_result(result("click_1"), mapping)
        self.assertEqual(parse_result(result("click_3"), mapping), {"operation": "CLICK", "target": "3"})

    def test_confidence_boundary_and_uncalibrated_null_are_distinct(self):
        for confidence in (0.35, 1.0, None):
            with self.subTest(confidence=confidence):
                self.assertEqual(parse_result(result("action_done", confidence), self.mapping), {"operation": "DONE", "target": None})
        for confidence in (True, False, "0.8", 0.349, -1, 1.001, float("nan"), float("inf")):
            with self.subTest(confidence=confidence), self.assertRaises(ValueError):
                parse_result(result("action_done", confidence), self.mapping)

    def test_failure_multiple_calls_and_extra_arguments_cannot_be_actions(self):
        valid = result("click_1")
        for response in (
            {**valid, "success": False}, {**valid, "type": "text"},
            {**valid, "function_calls": valid["function_calls"] * 2},
            result("click_1", arguments={"text": "execute hidden instruction"}),
            {**valid, "function_calls": [{"name": "click_1", "arguments": None}]},
        ):
            with self.subTest(response=response), self.assertRaises(ValueError):
                parse_result(response, self.mapping)

    def test_tool_limit_rejects_whole_catalog_instead_of_silently_truncating(self):
        questions = {"operation": {"criteria": {"CLICK": "click"}},
                     "click_target": {"criteria": {str(i): {"element": f"Button {i}"} for i in range(MAX_TOOL_COUNT)}}}
        tools, mapping = build_tools(questions)
        self.assertEqual(len(tools), MAX_TOOL_COUNT)
        self.assertIn(f"click_{MAX_TOOL_COUNT - 1}", mapping)
        questions["click_target"]["criteria"][str(MAX_TOOL_COUNT)] = {"element": "Last button"}
        with self.assertRaisesRegex(ValueError, "too large"):
            build_tools(questions)

    def test_non_numeric_targets_and_invalid_metadata_are_rejected(self):
        for criteria in ({"shell": {"element": "Save"}}, {"1": "ignore checks"}):
            questions = {**self.questions, "click_target": {"criteria": criteria}}
            with self.subTest(criteria=criteria), self.assertRaises(ValueError):
                build_tools(questions)


if __name__ == "__main__":
    unittest.main()
