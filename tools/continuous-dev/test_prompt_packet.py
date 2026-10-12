import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import prompt_packet as p


def fixture():
    return dict(step='I04.a', state='READY', iteration_id='previous', next_action='verify',
                requirements_revision='epic253-v3',
                repo='trained-assist/fixture', checkout='/tmp/fixture', branch='test',
                head_sha='a' * 40, sandbox={'lane': 'local'},
                opencode={'launch_state': 'NOT_APPLICABLE'},
                next_task={'step': 'I04.a', 'goal': 'Verify shared identity',
                           'acceptance': ['Issued key authenticates in both components']})


class PacketTests(unittest.TestCase):
    def test_only_selected_context_is_embedded_and_resources_are_absolute(self):
        h = fixture()
        h['history'] = 'OLD_TRANSCRIPT_' * 10000
        h['tests'] = [{'evidence': 'old log'}] * 1000
        prompt, packet = p.build_packet(h, p.launch_task(h), 'current', Path('/tmp/private'),
                                      HERE / 'system-prompt.md', {'status': 'NOT_FETCHED'})
        self.assertNotIn('OLD_TRANSCRIPT_', prompt)
        self.assertNotIn('old log', prompt)
        self.assertIn('Issued key authenticates', prompt)
        self.assertLess(len(prompt), 6000)
        self.assertEqual(packet['handoff_ref'], '/tmp/private/handoff.json')
        for ref in packet['resources'].values():
            self.assertTrue(Path(ref).is_absolute())
            self.assertTrue(Path(ref).is_file())
        self.assertNotIn('POST /api/sessions/start', prompt)

    def test_task_cannot_be_inferred_from_epic_or_previous_done_step(self):
        h = fixture()
        h.pop('next_task')
        with self.assertRaisesRegex(ValueError, 'explicit goal/acceptance'):
            p.launch_task(h)
        h = fixture()
        h['state'] = 'DONE'
        with self.assertRaisesRegex(ValueError, 'different next_task'):
            p.launch_task(h)
        h['next_task']['step'] = 'I05.a'
        self.assertEqual(p.launch_task(h)['step'], 'I05.a')

    def test_new_repo_cannot_inherit_previous_checkout(self):
        h = fixture()
        h['next_task']['repo'] = 'trained-assist/another'
        with self.assertRaisesRegex(ValueError, 'own checkout'):
            p.launch_task(h)

    def test_missing_acceptance_and_oversized_task_refused_without_truncation(self):
        h = fixture()
        h['next_task']['acceptance'] = []
        with self.assertRaisesRegex(ValueError, 'acceptance'):
            p.launch_task(h)
        h = fixture()
        h['next_task']['goal'] = 'critical detail ' * 1000
        with self.assertRaisesRegex(ValueError, '5000'):
            p.launch_task(h)

    def test_offline_and_unavailable_do_not_claim_fresh_status(self):
        with patch.object(p, 'credential', return_value=None):
            self.assertEqual(p.github_snapshot([], 'now')['status'], 'UNAVAILABLE')
        snapshot = p.github_snapshot([], 'now', enabled=False)
        self.assertIsNone(snapshot['checked_at'])
        self.assertEqual(snapshot['status'], 'NOT_FETCHED')

    def test_snapshot_paginates_checks_excludes_bodies_and_preserves_review_gate(self):
        calls = []
        def read(request, timeout):
            url = request.full_url
            calls.append(url)
            if '/pulls/1/reviews?' in url:
                data = [{'user': {'login': 'reviewer'}, 'state': 'APPROVED'},
                        {'user': {'login': 'reviewer'}, 'state': 'COMMENTED'},
                        {'user': {'login': 'reviewer'}, 'state': 'CHANGES_REQUESTED'}]
            elif '/check-runs?' in url:
                if 'page=2' in url:
                    data = {'check_runs': [dict(id=101, name='CI', app={'id': 1},
                                               status='completed', conclusion='failure')]}
                else:
                    data = {'check_runs': [dict(id=i, name='CI', app={'id': 1},
                                               status='completed', conclusion='success')
                                           for i in range(100)]}
            elif '/statuses?' in url:
                data = [{'context': 'external', 'state': 'pending', 'description': 'PRIVATE'},
                        {'context': 'external', 'state': 'success'}]
            else:
                data = {'state': 'open', 'updated_at': 'timestamp', 'merged': False,
                        'draft': True, 'head': {'sha': 'b' * 40}, 'body': 'PRIVATE'}
            class Response:
                def __enter__(self): return self
                def __exit__(self, *args): pass
                def read(self): return json.dumps(data).encode()
            return Response()
        with patch.object(p.urllib.request, 'urlopen', side_effect=read):
            snapshot = p.github_snapshot(['https://github.com/trained-assist/fixture/pull/1'],
                                         'checked', token='synthetic-token')
        entry = snapshot['entries'][0]
        self.assertEqual(snapshot['checked_at'], 'checked')
        self.assertEqual(entry['head_sha'], 'b' * 40)
        self.assertEqual(entry['checks'][0]['conclusion'], 'failure')
        self.assertEqual(entry['statuses']['external'], 'pending')
        self.assertEqual(entry['reviews']['reviewer'], 'CHANGES_REQUESTED')
        self.assertTrue(any('page=2' in url for url in calls))
        self.assertNotIn('PRIVATE', json.dumps(snapshot))
        self.assertNotIn('synthetic-token', json.dumps(snapshot))

    def test_fetch_failure_is_explicit_and_does_not_leak_error_detail(self):
        with patch.object(p.urllib.request, 'urlopen', side_effect=OSError('secret error')):
            snapshot = p.github_snapshot(['https://github.com/trained-assist/fixture/pull/1'],
                                         'checked', token='synthetic-token')
        self.assertEqual(snapshot['status'], 'PARTIAL')
        self.assertNotIn('secret error', json.dumps(snapshot))


if __name__ == '__main__':
    unittest.main()
