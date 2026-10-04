import unittest

from ryu_laya.decision import parse_computer_use_result


class LayaComputerUseDecisionTests(unittest.TestCase):
    def setUp(self):
        self.questions = {
            "operation": {"criteria": {"CLICK": "click", "DONE": "done", "BLOCKED": "blocked"}},
            "click_target": {"criteria": {"1": {"element": "Save"}, "2": {"element": "Cancel"}}},
        }

    def test_normalizes_valid_operation_and_current_target(self):
        result = {
            "answers": {
                "operation": {"choice": "CLICK", "probabilities": {"CLICK": 0.9, "DONE": 0.1}},
                "click_target": {"choice": "2", "probabilities": {"1": 0.1, "2": 0.9}},
            }
        }
        self.assertEqual(
            parse_computer_use_result(result, self.questions),
            {"operation": "CLICK", "target": "2"},
        )

    def test_rejects_unknown_or_low_probability_choices(self):
        unknown = {
            "answers": {
                "operation": {"choice": "RUN_COMMAND", "probabilities": {"RUN_COMMAND": 1.0}}
            }
        }
        with self.assertRaises(ValueError):
            parse_computer_use_result(unknown, self.questions)

        low_probability = {
            "answers": {
                "operation": {"choice": "CLICK", "probabilities": {"CLICK": 0.2, "DONE": 0.8}}
            }
        }
        with self.assertRaises(ValueError):
            parse_computer_use_result(low_probability, self.questions)

    def test_rejects_target_outside_the_current_action_space(self):
        result = {
            "answers": {
                "operation": {"choice": "CLICK", "probabilities": {"CLICK": 1.0}},
                "click_target": {"choice": "9", "probabilities": {"9": 1.0}},
            }
        }
        with self.assertRaises(ValueError):
            parse_computer_use_result(result, self.questions)


if __name__ == "__main__":
    unittest.main()
