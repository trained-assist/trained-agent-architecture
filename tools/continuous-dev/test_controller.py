import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location('controller', HERE / 'controller.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


def handoff():
    return dict(epic=c.EPIC, revision='v3', iteration_id='bootstrap', step='I04.a',
                state='READY', repo='trained-assist/trained-assist-llm-ladder',
                checkout='/tmp/synthetic', branch='fixture', head_sha='a' * 40,
                tests=[dict(command='fixture', result='PASS', evidence='local fixture')],
                sandbox=dict(lane='local'), opencode=dict(launch_state='NOT_APPLICABLE'),
                next_action='reconcile contracts', waiting_for=None,
                next_task=dict(step='I04.a', goal='Verify the shared identity contract',
                               acceptance=['Ladder-issued key passes Host lookup']))


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / 'state'
        self.state.mkdir()
        self.fake = self.root / 'fake-opencode'
        self.fake.write_text('''#!/usr/bin/env python3
import json, os, re, sys
prompt = sys.stdin.read()
packet = json.loads(prompt.split('## Карточка запуска\\n', 1)[1])
iteration = packet['iteration_id']
base = json.loads(os.environ['TEST_HANDOFF'])
base['iteration_id'] = iteration
mode = os.environ.get('TEST_MODE', 'ok')
if mode == 'missing':
    text = 'No handoff.'
elif mode == 'malformed':
    text = '<HANDOFF>{invalid}</HANDOFF>'
else:
    text = '<HANDOFF>' + json.dumps(base) + '</HANDOFF>'
print(json.dumps({'type':'text','sessionID':'synthetic-session','part':{'type':'text','text':text}}))
sys.exit(9 if mode == 'nonzero' else 0)
''')
        self.fake.chmod(0o700)
        c.atomic_json(self.state / 'handoff.json', handoff())
        self.args = argparse.Namespace(cwd=str(self.root), executable=str(self.fake),
                                       prompt=str(HERE / 'system-prompt.md'), offline=True)
        self.addCleanup(patch.stopall)
        patch.object(c, 'legacy_active', return_value=False).start()
        patch.dict(os.environ, TEST_HANDOFF=json.dumps(handoff()), TEST_MODE='ok').start()

    def event(self, value, kind='text'):
        part = dict(type='text', text='<HANDOFF>' + json.dumps(value) + '</HANDOFF>')
        if kind == 'message.part.updated':
            return json.dumps(dict(type=kind, properties=dict(part=part)))
        return json.dumps(dict(type=kind, part=part))

    def test_cli_and_sdk_formats(self):
        for kind in ('text', 'message.part.updated'):
            self.assertEqual(c.extract(self.event(handoff(), kind)), handoff())

    def test_tool_output_cannot_be_handoff(self):
        with self.assertRaisesRegex(ValueError, 'no assistant'):
            c.extract(self.event(handoff(), 'tool_use'))

    def test_invalid_final_block_does_not_restore_older_success(self):
        with self.assertRaises(ValueError):
            c.extract(self.event(handoff()) + '\n' + json.dumps(dict(
                type='text', part=dict(type='text', text='<HANDOFF>{}</HANDOFF>'))))

    def test_legacy_yaml_rejected(self):
        with self.assertRaises(ValueError):
            c.extract(json.dumps(dict(type='text', part=dict(type='text',
                           text='<HANDOFF>status: done</HANDOFF>'))))

    def test_step_done_is_not_epic_complete(self):
        h = handoff()
        h['state'] = 'DONE'
        c.validate(h)
        h['epic_complete'] = True
        with self.assertRaisesRegex(ValueError, 'A/B/C'):
            c.validate(h)

    def test_waiting_and_unknown_probe_do_not_launch(self):
        for state in c.WAITING:
            h = handoff()
            h.update(state=state, waiting_for='review event')
            c.atomic_json(self.state / 'handoff.json', h)
            self.assertFalse(c.run_once(self.args, self.state))
        h = handoff()
        h['opencode']['launch_state'] = 'UNKNOWN'
        c.atomic_json(self.state / 'handoff.json', h)
        with self.assertRaisesRegex(ValueError, 'probe outcome'):
            c.run_once(self.args, self.state)
        self.assertFalse((self.state / 'active.json').exists())

    def test_executor_exit_and_invalid_output_preserve_previous_handoff(self):
        original = (self.state / 'handoff.json').read_bytes()
        for mode in ('nonzero', 'missing', 'malformed'):
            with self.subTest(mode=mode):
                (self.state / 'active.json').unlink(missing_ok=True)
                os.environ['TEST_MODE'] = mode
                with self.assertRaises(ValueError):
                    c.run_once(self.args, self.state)
                self.assertEqual((self.state / 'handoff.json').read_bytes(), original)
                self.assertEqual(json.loads((self.state / 'active.json').read_text())['phase'],
                                 'NEEDS_RECONCILE')
                with self.assertRaisesRegex(ValueError, 'needs reconciliation'):
                    c.run_once(self.args, self.state)

    def test_success_commits_real_timestamp_and_private_files(self):
        self.assertTrue(c.run_once(self.args, self.state))
        h = json.loads((self.state / 'handoff.json').read_text())
        active = json.loads((self.state / 'active.json').read_text())
        self.assertEqual(h['iteration_id'], active['iteration_id'])
        self.assertEqual(active['phase'], 'COMPLETE')
        self.assertNotIn('$(', active['finished_at'])
        self.assertEqual((self.state / 'handoff.json').stat().st_mode & 0o777, 0o600)
        self.assertEqual(len(list(self.state.glob('handoff-*.json'))), 1)
        packet = json.loads(next(self.state.glob('launch-*.json')).read_text())
        self.assertEqual(packet['task']['goal'], 'Verify the shared identity contract')
        self.assertEqual(packet['github']['status'], 'NOT_FETCHED')
        self.assertLess(active['prompt_characters'], 6000)

    def test_crash_intent_is_not_automatically_retried(self):
        for phase in ('STARTING', 'RUNNING', 'NEEDS_RECONCILE'):
            c.atomic_json(self.state / 'active.json', dict(phase=phase, iteration_id='crashed'))
            with self.assertRaisesRegex(ValueError, 'needs reconciliation'):
                c.run_once(self.args, self.state)

    def test_executor_cannot_report_previous_step_as_selected_task(self):
        h = handoff()
        h['next_task']['step'] = 'I05.a'
        c.atomic_json(self.state / 'handoff.json', h)
        with self.assertRaisesRegex(ValueError, 'selected task'):
            c.run_once(self.args, self.state)
        self.assertEqual(json.loads((self.state / 'handoff.json').read_text())['step'], 'I04.a')

    def test_legacy_launcher_blocks_adoption(self):
        with patch.object(c, 'legacy_active', return_value=True):
            with self.assertRaisesRegex(ValueError, 'legacy controller'):
                c.run_once(self.args, self.state)

    def test_sleeping_legacy_scheduler_is_detected_by_pid(self):
        home = self.root / 'legacy-home'
        pid_file = home / 'code/trained-agent-architecture/continuous-dev/controller.pid'
        pid_file.parent.mkdir(parents=True)
        pid_file.write_text(str(os.getpid()))
        # Use the unpatched function rather than the setUp preflight override.
        real_spec = importlib.util.spec_from_file_location('real_controller', HERE / 'controller.py')
        real = importlib.util.module_from_spec(real_spec)
        real_spec.loader.exec_module(real)
        with patch.object(real.Path, 'home', return_value=home), patch.object(
            real.subprocess, 'run', return_value=argparse.Namespace(stdout='')):
            self.assertTrue(real.legacy_active())

    def main(self, *flags):
        with patch.object(sys, 'argv', ['controller', '--state-dir', str(self.state), *flags]):
            return c.main()

    def test_real_file_lock_blocks_second_controller(self):
        with open(self.state / 'controller.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.main('--cwd', str(self.root)), 75)
        self.assertFalse((self.state / 'active.json').exists())

    def test_reconcile_requires_iteration_and_dead_executor(self):
        source = self.root / 'reconciled.json'
        source.write_text(json.dumps(handoff()))
        c.atomic_json(self.state / 'active.json', dict(phase='NEEDS_RECONCILE',
                                                      iteration_id='crashed', child_pid=os.getpid()))
        self.assertEqual(self.main('--import-handoff', str(source),
                                   '--reconcile-iteration', 'crashed'), 75)
        c.atomic_json(self.state / 'active.json', dict(phase='NEEDS_RECONCILE',
                                                      iteration_id='crashed', child_pid=None))
        self.assertEqual(self.main('--import-handoff', str(source)), 75)
        self.assertEqual(self.main('--import-handoff', str(source),
                                   '--reconcile-iteration', 'crashed'), 0)

    def test_runtime_dir_nested_under_git_rejected(self):
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        with patch.object(sys, 'argv', ['controller', '--state-dir', str(self.root / 'new/deep/state')]):
            with self.assertRaises(SystemExit):
                c.main()


if __name__ == '__main__':
    unittest.main()
