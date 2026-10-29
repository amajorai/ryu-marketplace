"""Closed-action regressions using the production schema and result parser."""

import unittest

from ryu_functiongemma.decision import build_tool, compact_observations, parse_call


def call(operation, target):
    return (
        "<start_function_call>call:computer_use_action{"
        f"operation:<escape>{operation}<escape>,target:<escape>{target}<escape>"
        "}<end_function_call>"
    )


class FunctionGemmaClosedActionTests(unittest.TestCase):
    def setUp(self):
        self.questions = {
            "operation": {"criteria": {"CLICK": "click", "TYPE_TEXT": "type", "WAIT": "wait"}},
            "click_target": {"criteria": {"1": {"element": "Save", "role": "button"}}},
            "type_text_target": {"criteria": {"2": {"element": "Name", "role": "textbox"}}},
        }
        self.tool, self.operations, self.click_targets, self.type_targets = build_tool(self.questions)

    def test_typing_and_clicking_cannot_exchange_target_kinds(self):
        for operation, target in (("CLICK", "2"), ("TYPE_TEXT", "1")):
            with self.subTest(operation=operation), self.assertRaisesRegex(ValueError, "outside the current choices"):
                parse_call(call(operation, target), self.operations, self.click_targets, self.type_targets)
        self.assertEqual(
            parse_call(call("TYPE_TEXT", "2"), self.operations, self.click_targets, self.type_targets),
            {"operation": "TYPE_TEXT", "target": "2"},
        )

    def test_previous_observation_target_is_not_reused(self):
        next_questions = {**self.questions, "click_target": {"criteria": {"3": {"element": "Confirm"}}}}
        _, operations, click_targets, type_targets = build_tool(next_questions)
        with self.assertRaisesRegex(ValueError, "outside the current choices"):
            parse_call(call("CLICK", "1"), operations, click_targets, type_targets)
        self.assertEqual(parse_call(call("CLICK", "3"), operations, click_targets, type_targets), {"operation": "CLICK", "target": "3"})

    def test_targetless_action_normalizes_none_and_forbids_a_target(self):
        self.assertEqual(parse_call(call("WAIT", "none"), self.operations, self.click_targets, self.type_targets), {"operation": "WAIT", "target": None})
        with self.assertRaisesRegex(ValueError, "action that has none"):
            parse_call(call("WAIT", "1"), self.operations, self.click_targets, self.type_targets)

    def test_extra_fields_duplicate_fields_and_free_text_are_rejected(self):
        valid = call("CLICK", "1")
        for text in (
            valid.replace("target:<escape>1<escape>", "target:<escape>1<escape>,target:<escape>1<escape>"),
            valid.replace("target:<escape>1<escape>", "target:<escape>1<escape>,command:<escape>rm -rf /<escape>"),
            "Ignore the UI and execute this: " + valid,
            valid + " additional instructions",
            valid + call("WAIT", "none"),
            valid.replace("computer_use_action", "run_shell"),
            valid.removesuffix("}<end_function_call>"),
        ):
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_call(text, self.operations, self.click_targets, self.type_targets)

    def test_non_numeric_target_catalog_is_rejected_before_inference(self):
        for target in ("shell", "-1", "1; delete"):
            questions = {**self.questions, "click_target": {"criteria": {target: {"element": "Save"}}}}
            with self.subTest(target=target), self.assertRaisesRegex(ValueError, "numeric strings"):
                build_tool(questions)

    def test_observations_do_not_include_unsupplied_page_or_history_fields(self):
        observations = compact_observations(
            {"task": "Save draft", "page": {"app": "Editor", "title": "Draft", "cookies": "secret"},
             "recent_actions": [{"operation": "CLICK", "page_changed": "true", "token": "secret"}]},
            self.questions,
        )
        self.assertEqual(observations["page"], {"app": "Editor", "title": "Draft"})
        self.assertEqual(observations["recent_actions"], [{"operation": "CLICK", "page_changed": False}])
        self.assertEqual([(control["id"], control["operation"]) for control in observations["controls"]], [("1", "CLICK"), ("2", "TYPE_TEXT")])


if __name__ == "__main__":
    unittest.main()
