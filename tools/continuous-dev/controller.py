#!/usr/bin/env python3
"""Local Epic #253 launcher. Runtime artifacts belong outside Git."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import uuid

EPIC = 'trained-assist/trained-agent-architecture#253'
STATES = {'READY', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CI', 'WAITING_REVIEW',
          'BLOCKED', 'DONE'}
WAITING = {'IN_REVIEW', 'WAITING_CI', 'WAITING_REVIEW', 'BLOCKED'}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def atomic_json(path, value):
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=path.name + '.')
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(value, out, ensure_ascii=False, indent=2)
            out.write('\n')
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def validate(handoff):
    if not isinstance(handoff, dict) or handoff.get('epic') != EPIC:
        raise ValueError('wrong or missing epic')
    for key in ('revision', 'iteration_id', 'step', 'repo', 'checkout', 'branch',
                'head_sha', 'next_action'):
        if not isinstance(handoff.get(key), str) or not handoff[key].strip():
            raise ValueError('missing field: ' + key)
    if handoff.get('state') not in STATES:
        raise ValueError('invalid step state')
    if not re.fullmatch(r'[0-9a-f]{40}', handoff['head_sha']):
        raise ValueError('head_sha must be a full commit SHA')
    if not isinstance(handoff.get('tests'), list):
        raise ValueError('tests must be a list')
    for test in handoff['tests']:
        if not isinstance(test, dict) or test.get('result') not in {'PASS', 'FAIL', 'NOT_RUN'}:
            raise ValueError('invalid test evidence')
        if not test.get('command') or not test.get('evidence'):
            raise ValueError('test requires command and evidence')
    if not isinstance(handoff.get('sandbox'), dict):
        raise ValueError('sandbox must be recorded')
    probe = handoff.get('opencode')
    if not isinstance(probe, dict) or probe.get('launch_state') not in {
        'NOT_STARTED', 'NOT_APPLICABLE', 'STARTING', 'OBSERVING', 'COMPLETE', 'UNKNOWN'
    }:
        raise ValueError('invalid OpenCode launch state')
    if handoff['state'] in WAITING and not handoff.get('waiting_for'):
        raise ValueError('waiting state requires waiting_for')
    if handoff.get('epic_complete'):
        accepted = handoff.get('acceptance', {})
        if handoff['state'] != 'DONE' or any(
            not isinstance(accepted.get(m), dict) or
            accepted[m].get('result') != 'PASS' or not accepted[m].get('evidence')
            for m in ('A', 'B', 'C')
        ):
            raise ValueError('epic completion requires A/B/C acceptance references')
    return handoff


def extract(log):
    # CLI --format json emits type=text; SDK envelopes use properties.part.
    # Tool output is never considered a handoff, even if it contains the marker.
    texts = {}
    for line in log.splitlines():
        try:
            event = json.loads(line)
        except (ValueError, TypeError):
            continue
        if not isinstance(event, dict):
            continue
        if event.get('type') == 'text':
            part = event.get('part', {})
        elif event.get('type') == 'message.part.updated':
            part = event.get('properties', {}).get('part', event.get('part', {}))
        else:
            continue
        if part.get('type') != 'text' or not isinstance(part.get('text'), str):
            continue
        # Updated parts are snapshots, not text deltas.
        key = part.get('id', str(len(texts)))
        texts.pop(key, None)
        texts[key] = part['text']
    for text in reversed(list(texts.values())):
        blocks = re.findall(r'<HANDOFF>\s*(.*?)\s*</HANDOFF>', text, re.S)
        if blocks:
            # Reject an invalid final block instead of falling back to stale state.
            return validate(json.loads(blocks[-1]))
    raise ValueError('no assistant JSON HANDOFF in output')


def alive(pid):
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def legacy_active():
    output = subprocess.run(['ps', '-axo', 'pid=,args='], capture_output=True,
                            text=True, check=True).stdout
    legacy = '/trained-agent-architecture/continuous-dev/'
    if any(legacy in line and ('controller.sh' in line or 'run-continuous.sh' in line)
           for line in output.splitlines()):
        return True
    # Legacy loop may have a relative argv while sleeping between sessions.
    pid_file = Path.home() / 'code/trained-agent-architecture/continuous-dev/controller.pid'
    if pid_file.exists():
        try:
            pid = int(pid_file.read_text().strip())
        except ValueError:
            raise ValueError('invalid legacy PID file; inspect it before adoption')
        if alive(pid):
            return True
    return False


def run_once(args, root):
    state_file = root / 'active.json'
    old = json.loads(state_file.read_text()) if state_file.exists() else {}
    if old.get('phase') in {'STARTING', 'RUNNING', 'NEEDS_RECONCILE'}:
        raise ValueError('previous iteration needs reconciliation: ' + str(old.get('iteration_id')))
    if legacy_active():
        raise ValueError('legacy controller is active; reconcile it before switching launchers')
    handoff = validate(json.loads((root / 'handoff.json').read_text()))
    if handoff.get('epic_complete'):
        print('A/B/C accepted; scope complete.')
        return False
    if handoff['state'] in WAITING:
        print('No launch: ' + handoff['state'] + '; ' + handoff['waiting_for'])
        return False
    if handoff['opencode']['launch_state'] in {'STARTING', 'OBSERVING', 'UNKNOWN'}:
        raise ValueError('OpenCode probe outcome is unresolved')
    if not args.cwd or not Path(args.cwd).is_dir():
        raise ValueError('--cwd must name the verified execution checkout')
    iteration = uuid.uuid4().hex
    prompt = Path(args.prompt).read_text() + '\n\n## Durable previous handoff\n' + json.dumps(handoff)
    prompt += ('\n\nController iteration_id=' + iteration +
               '\nExecute or reconcile ONE atomic step. Your final assistant text must end '
               'with <HANDOFF>{valid JSON matching the documented schema}</HANDOFF>. '
               'Use this controller iteration_id. No YAML or Markdown fences inside the block. '
               'DONE means this step completed; epic_complete only after accepted A/B/C.\n')
    log_path = root / ('session-' + iteration + '.jsonl')
    state = dict(iteration_id=iteration, phase='STARTING', started_at=now(),
                 cwd=str(Path(args.cwd).resolve()), log=str(log_path), child_pid=None,
                 session_id=None, heartbeat_at=now(),
                 prompt_sha256=hashlib.sha256(prompt.encode()).hexdigest())
    atomic_json(state_file, state)  # Intent persists before spawning.
    try:
        with open(log_path, 'x', encoding='utf-8') as log:
            child = subprocess.Popen([args.executable, 'run', '--format', 'json', '--auto',
                                      '--variant', 'minimal'], cwd=args.cwd,
                                     stdin=subprocess.PIPE, stdout=log, stderr=log, text=True)
            state.update(phase='RUNNING', child_pid=child.pid)
            atomic_json(state_file, state)
            child.stdin.write(prompt)
            child.stdin.close()
            cursor = 0
            # Logs stay private: raw tool output may include credentials.
            while child.poll() is None:
                with open(log_path) as stream:
                    stream.seek(cursor)
                    for line in stream:
                        if not line.endswith('\n'):
                            break
                        cursor += len(line.encode())
                        try:
                            event = json.loads(line)
                        except ValueError:
                            continue
                        if isinstance(event, dict) and not state['session_id']:
                            state['session_id'] = event.get('sessionID')
                state['heartbeat_at'] = now()
                atomic_json(state_file, state)
                time.sleep(1)
        state.update(exit_code=child.returncode, finished_at=now())
        if child.returncode:
            raise ValueError('executor exited with code ' + str(child.returncode))
        next_handoff = extract(log_path.read_text())
        if next_handoff['iteration_id'] != iteration:
            raise ValueError('handoff belongs to a different iteration')
        atomic_json(root / ('handoff-' + iteration + '.json'), next_handoff)
        atomic_json(root / 'handoff.json', next_handoff)
        state['phase'] = 'COMPLETE'
        atomic_json(state_file, state)
        print('Completed iteration ' + iteration + ': ' + next_handoff['step'] + ' ' + next_handoff['state'])
        return next_handoff['state'] not in WAITING and not next_handoff.get('epic_complete')
    except BaseException:
        state.update(phase='NEEDS_RECONCILE', finished_at=now())
        atomic_json(state_file, state)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir', required=True)
    parser.add_argument('--cwd')
    parser.add_argument('--executable', default='opencode')
    parser.add_argument('--prompt', default=str(Path(__file__).with_name('system-prompt.md')))
    parser.add_argument('--loop', action='store_true')
    parser.add_argument('--interval', type=float, default=300)
    parser.add_argument('--import-handoff', type=Path)
    parser.add_argument('--reconcile-iteration')
    args = parser.parse_args()
    os.umask(0o077)
    root = Path(args.state_dir).resolve()
    # Also reject a Git workspace nested below a parent repository.
    ancestor = root
    while not ancestor.exists():
        ancestor = ancestor.parent
    if subprocess.run(['git', '-C', str(ancestor),
                       'rev-parse', '--show-toplevel'], capture_output=True).returncode == 0:
        parser.error('state-dir must be outside Git')
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    with open(root / 'controller.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Another controller owns this state directory.', file=sys.stderr)
            return 75
        try:
            if args.import_handoff:
                old_path = root / 'active.json'
                old = json.loads(old_path.read_text()) if old_path.exists() else {}
                if legacy_active() or alive(old.get('child_pid')):
                    raise ValueError('executor is still alive; do not replace its handoff')
                if old.get('phase') in {'STARTING', 'RUNNING', 'NEEDS_RECONCILE'}:
                    if args.reconcile_iteration != old.get('iteration_id'):
                        raise ValueError('inspect side effects, then specify --reconcile-iteration')
                handoff = validate(json.loads(args.import_handoff.read_text()))
                atomic_json(root / 'handoff.json', handoff)
                atomic_json(root / 'active.json', dict(phase='RECONCILED', reconciled_at=now(),
                                                      previous_iteration=old.get('iteration_id')))
                print('Imported reconciled handoff. No executor launched.')
                return 0
            while run_once(args, root) and args.loop:
                time.sleep(max(args.interval, 1))
            return 0
        except (OSError, ValueError) as error:
            print(str(error), file=sys.stderr)
            return 75


if __name__ == '__main__':
    sys.exit(main())
