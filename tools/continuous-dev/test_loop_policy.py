import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import loop_policy as policy
import prompt_packet as packets


class LoopPolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.handoff = dict(iteration_id='builder-run', requirements_revision='accepted-v1',
                            step='slice', state='READY', repo='owner/repo', checkout=str(self.root),
                            branch='test', head_sha='a' * 40, next_action='verify',
                            next_task=dict(step='slice', goal='Deliver the client response',
                                           acceptance=['Client receives the response']))
        self.task = packets.launch_task(self.handoff)

    def artifact(self, name, contents, kind='artifact'):
        path = self.root / name
        path.write_text(contents)
        return dict(kind=kind, ref=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                    criterion=self.task['acceptance'][0])

    def result(self, evidence=None, kind='progress'):
        return dict(kind=kind, requirements_revision='accepted-v1', source_shas={'owner/repo': 'a' * 40},
                    harness='valid', evidence=evidence or [])

    def assess(self, ledger, result, state='READY'):
        h = dict(self.handoff, state=state, result=result)
        return policy.assess(ledger, h, self.task, require_result=True)

    def test_role_overlay_only_selected_role_and_exact_revision(self):
        prompt, _ = packets.build_packet(dict(self.handoff, sandbox={}, opencode={}), self.task,
            'run', self.root, HERE / 'system-prompt.md', {'status': 'NOT_FETCHED'})
        self.assertIn('Роль этой сессии: builder', prompt)
        self.assertNotIn('Проверь одну гипотезу или альтернативу', prompt)
        self.handoff['next_task']['requirements_revision'] = 'rewritten-v2'
        with self.assertRaisesRegex(ValueError, 'silently rewrite'):
            packets.launch_task(self.handoff)

    def test_reviewer_requires_separate_frozen_workspace(self):
        self.handoff['next_task'].update(role='reviewer', frozen={
            'requirements_revision': 'accepted-v1', 'source_shas': {'owner/repo': 'a' * 40},
            'evidence': ['private evidence'], 'builder_checkout': str(self.root)})
        with self.assertRaisesRegex(ValueError, 'separate'):
            packets.launch_task(self.handoff)
        self.handoff['next_task']['checkout'] = str(self.root / 'reviewer')
        self.assertEqual(packets.launch_task(self.handoff)['role'], 'reviewer')
        self.handoff['next_task']['head_sha'] = 'b' * 40
        with self.assertRaisesRegex(ValueError, 'frozen revision'):
            packets.launch_task(self.handoff)

    def test_same_artifact_new_path_and_new_iteration_is_not_delta(self):
        receipt = self.artifact('first.json', '{"outcome":"response received"}')
        ledger, keep = self.assess({}, self.result([receipt]))
        self.assertTrue(keep)
        duplicate = self.artifact('renamed.json', '{"outcome":"response received"}')
        self.handoff['iteration_id'] = 'another-run'
        ledger, keep = self.assess(ledger, self.result([duplicate]))
        self.assertFalse(keep)
        self.assertEqual(ledger['decision'], 'REPLAN_REQUIRED')
        with self.assertRaisesRegex(ValueError, 'same slice'):
            policy.preflight(ledger, self.task, 8)
        diagnostic = dict(self.task, step='slice.diag', role='researcher', diagnostic=True,
                          goal='Diagnose the missing client event', hypothesis='idle closes subscription')
        policy.preflight(ledger, diagnostic, 8)
        ledger, keep = self.assess(ledger, self.result([duplicate]))
        self.assertEqual(ledger['decision'], 'STAGNATED')
        self.assertFalse(keep)
        with self.assertRaisesRegex(ValueError, 'two iterations'):
            policy.preflight(ledger, diagnostic, 8)

    def test_negative_experiment_is_progress_and_waiting_is_not_stagnation(self):
        evidence = self.artifact('negative.json', '{"expected":"answer","actual":"exit 1"}',
                                 kind='negative_experiment')
        ledger, keep = self.assess({}, self.result([evidence], kind='product_failed'))
        self.assertTrue(keep)
        self.assertEqual(ledger['no_progress'], 0)
        ledger, keep = policy.assess(ledger, dict(self.handoff, state='WAITING_CI'),
                                    self.task, require_result=True)
        self.assertFalse(keep)
        self.assertEqual(ledger['no_progress'], 0)

    def test_failed_harness_cannot_verify_or_supply_quality_metrics(self):
        result = self.result([self.artifact('run.txt', 'measurement failed')], kind='verified')
        result['harness'] = 'invalid'
        with self.assertRaisesRegex(ValueError, 'invalid harness'):
            self.assess({}, result)
        result.update(kind='harness_failed', metrics={'quality': 1})
        with self.assertRaisesRegex(ValueError, 'failed harness'):
            self.assess({}, result)

    def test_receipt_must_match_content_and_selected_criterion(self):
        evidence = self.artifact('receipt', 'PASS')
        Path(evidence['ref']).write_text('FAIL')
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            self.assess({}, self.result([evidence]))
        evidence = self.artifact('other', 'new artifact')
        evidence['criterion'] = 'Unrelated work'
        with self.assertRaisesRegex(ValueError, 'unrelated'):
            self.assess({}, self.result([evidence]))

    def test_actual_new_commit_with_diff_counts_as_progress(self):
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        def git(*args):
            return subprocess.check_output(['git', '-C', str(self.root), *args], text=True).strip()
        git('config', 'user.name', 'fixture'); git('config', 'user.email', 'fixture@example.invalid')
        (self.root / 'code').write_text('before')
        git('add', 'code'); git('commit', '-qm', 'baseline')
        self.task['head_sha'] = git('rev-parse', 'HEAD')
        (self.root / 'code').write_text('after')
        git('commit', '-qam', 'change')
        result = self.result(); result['source_shas']['owner/repo'] = git('rev-parse', 'HEAD')
        ledger, keep = self.assess({}, result)
        self.assertTrue(keep)
        self.assertEqual(ledger['no_progress'], 0)
        ledger, keep = self.assess(ledger, result)
        self.assertFalse(keep)

    def delivery(self):
        proof = self.artifact('client.json', '{"fixture":"CLI response PASS"}', kind='criterion')
        telemetry = self.artifact('models.json', json.dumps(dict(mode='actual',
            builder={'model_family': 'fixture-a', 'session_id': 'one', 'source': 'synthetic trace'},
            reviewer={'model_family': 'fixture-b', 'session_id': 'two', 'source': 'synthetic trace'})))
        result = self.result([proof], kind='delivered')
        result['delivery'] = dict(versions={'owner/repo': dict(source='a' * 40, tested='a' * 40, installed='a' * 40)},
            client=dict(interface='CLI', result='PASS', evidence=proof),
            review=dict(verdict='PASS', requirements_revision='accepted-v1',
                        source_shas={'owner/repo': 'a' * 40}, iteration_id='independent-review',
                        builder_model_family='fixture-a', reviewer_model_family='fixture-b',
                        evidence=proof, model_metadata=telemetry))
        return result

    def test_delivery_requires_matching_versions_client_and_independent_review(self):
        result = self.delivery()
        self.assess({}, result)  # Synthetic schema/replay acceptance, not real delivery.
        cases = [
            ('version drift', lambda d: d['delivery']['versions']['owner/repo'].update(installed='b' * 40)),
            ('real client', lambda d: d['delivery']['client'].update(interface='worker')),
            ('independent review', lambda d: d['delivery']['review'].update(iteration_id='builder-run')),
            ('inconclusive', lambda d: d['delivery']['review'].update(reviewer_model_family='UNKNOWN')),
            ('requirements', lambda d: d['delivery']['review'].update(requirements_revision='changed-v2')),
        ]
        for pattern, mutate in cases:
            bad = copy.deepcopy(result); mutate(bad)
            with self.subTest(pattern=pattern), self.assertRaisesRegex(ValueError, pattern):
                self.assess({}, bad)

    def test_spent_budget_and_missing_result_block_continuation(self):
        with self.assertRaisesRegex(ValueError, 'budget exhausted'):
            policy.preflight({'sessions_started': 8}, self.task, 8)
        with self.assertRaisesRegex(ValueError, 'classified result'):
            policy.assess({}, self.handoff, self.task, require_result=True)
        with self.assertRaisesRegex(ValueError, 'delivered'):
            policy.assess({}, dict(self.handoff, epic_complete=True), self.task, require_result=False)


if __name__ == '__main__':
    unittest.main()
