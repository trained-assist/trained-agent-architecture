#!/usr/bin/env python3
"""Local Epic #253 launcher. Runtime artifacts belong outside Git."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time
import uuid

from prompt_packet import EPIC_URL, build_packet, github_snapshot, launch_task
from loop_policy import assess, preflight, receipt

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


def cancel_owned(child):
    if child.poll() is None:
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass  # Outcome remains unknown; never start another executor.


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
    if (root / 'stop.json').exists():
        print('Operator stop persists; use explicit --resume after reconciliation.')
        return False
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
    task = launch_task(handoff)
    ledger_path = root / 'loop.json'
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {}
    preflight(ledger, task, args.max_sessions)
    if task['role'] in {'reviewer', 'verifier'}:
        target = subprocess.run(['git', '-C', task['checkout'], 'rev-parse', 'HEAD'], capture_output=True, text=True)
        if target.returncode or target.stdout.strip() != task['head_sha']:
            raise ValueError('review/verifier checkout is not at the frozen SHA')
    if task['role'] == 'reviewer':
        review_tree = subprocess.run(['git', '-C', task['checkout'], 'status', '--porcelain'],
                                     capture_output=True, text=True, check=True).stdout
        if review_tree.strip():
            raise ValueError('reviewer requires a clean independent checkout')
    refs = [EPIC_URL] + task['references'] + task['prerequisites']
    refs.extend(handoff[key] for key in ('pr', 'work_issue') if handoff.get(key))
    snapshot = github_snapshot(refs, now(), enabled=not args.offline)
    prompt, packet = build_packet(handoff, task, iteration, root, args.prompt, snapshot,
                                 execution_cwd=str(Path(args.cwd).resolve()),
                                 limits=dict(session_seconds=args.session_seconds, max_sessions=args.max_sessions,
                                             sessions_spent=ledger.get('sessions_started', 0), require_result=args.loop))
    atomic_json(root / ('launch-' + iteration + '.json'), packet)
    if (root / 'stop.json').exists():
        print('Operator stopped during preflight; no executor launched.')
        return False
    log_path = root / ('session-' + iteration + '.jsonl')
    state = dict(iteration_id=iteration, phase='STARTING', started_at=now(),
                 cwd=str(Path(args.cwd).resolve()), log=str(log_path), child_pid=None,
                 session_id=None, heartbeat_at=now(),
                 task_step=task['step'], prompt_characters=len(prompt),
                 role=task['role'], requirements_revision=task['requirements_revision'],
                 last_progress_at=ledger.get('last_progress_at'),
                 expected_event='CLI event or durable checkpoint',
                 deadline_at=(dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=args.session_seconds)).isoformat(),
                 model_metadata='UNKNOWN; requested profile is not actual model-family evidence',
                 requested_profile=task.get('execution'),
                 prompt_sha256=hashlib.sha256(prompt.encode()).hexdigest())
    atomic_json(state_file, state)  # Intent persists before spawning.
    ledger.update(sessions_started=ledger.get('sessions_started', 0) + 1,
                  max_sessions=args.max_sessions, reserved_iteration=iteration)
    atomic_json(ledger_path, ledger)
    try:
        with open(log_path, 'x', encoding='utf-8') as log:
            if (root / 'stop.json').exists():
                raise ValueError('operator stopped before spawn; no continuation')
            command = [args.executable, 'run', '--format', 'json', '--auto', '--variant', 'minimal']
            if task.get('execution'):
                command.extend(['--model', task['execution']['model']])
            child = subprocess.Popen(command, cwd=args.cwd, start_new_session=True,
                                     stdin=subprocess.PIPE, stdout=log, stderr=log, text=True)
            state.update(phase='RUNNING', child_pid=child.pid)
            atomic_json(state_file, state)
            child.stdin.write(prompt)
            child.stdin.close()
            cursor = 0
            deadline = time.monotonic() + args.session_seconds
            checkpoint_digests = set(ledger.get('seen_evidence', []))
            # Logs stay private: raw tool output may include credentials.
            while child.poll() is None:
                if (root / 'stop.json').exists():
                    state['stop_reason'] = 'operator stop; reconcile in-flight effects'
                    atomic_json(state_file, state)
                    cancel_owned(child)
                    raise ValueError('manual stop: no automatic continuation')
                if time.monotonic() >= deadline:
                    state['stop_reason'] = 'session deadline; executor outcome unknown'
                    cancel_owned(child)
                    raise ValueError('deadline reached; reconcile executor/effects before retry')
                checkpoint_path = root / ('checkpoint-' + iteration + '.json')
                if checkpoint_path.exists():
                    try:
                        checkpoint = json.loads(checkpoint_path.read_text())
                        if (checkpoint.get('iteration_id') != iteration or
                            checkpoint.get('requirements_revision') != task['requirements_revision']):
                            raise ValueError('checkpoint identity mismatch')
                        if checkpoint.get('phase') not in {'WORKING', 'WAITING_PROVIDER', 'WAITING_TOOL', 'WAITING_CI', 'RETRY_AT'}:
                            raise ValueError('invalid checkpoint phase')
                        digests = {receipt(item) for item in checkpoint.get('evidence', [])}
                        if any(item['criterion'] not in task['acceptance'] for item in checkpoint.get('evidence', [])):
                            raise ValueError('checkpoint receipt does not match task criterion')
                        if digests - checkpoint_digests:
                            state['last_progress_at'] = now()
                            checkpoint_digests |= digests
                        state.update(observed_phase=checkpoint['phase'], checkpoint_ref=str(checkpoint_path),
                                     checkpoint_state='RECORDED', expected_event=checkpoint.get('next_event'),
                                     retry_at=checkpoint.get('retry_at'))
                    except (OSError, ValueError):
                        state['checkpoint_state'] = 'INVALID; verify artifact before acceptance'
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
        if next_handoff['step'] != task['step'] or next_handoff['repo'] != task['repo']:
            raise ValueError('handoff does not report the selected task/repository')
        if next_handoff.get('requirements_revision') != task['requirements_revision']:
            raise ValueError('handoff changed accepted requirements revision')
        if task['role'] == 'reviewer':
            after = subprocess.run(['git', '-C', task['checkout'], 'status', '--porcelain'],
                                   capture_output=True, text=True, check=True).stdout
            head = subprocess.run(['git', '-C', task['checkout'], 'rev-parse', 'HEAD'],
                                  capture_output=True, text=True, check=True).stdout.strip()
            if after.strip() or head != task['head_sha']:
                raise ValueError('reviewer changed the frozen checkout; verdict withheld')
        atomic_json(root / ('handoff-' + iteration + '.json'), next_handoff)
        updated_ledger, continue_loop = assess(ledger, next_handoff, task, require_result=args.loop)
        if args.loop and updated_ledger.get('decision') == 'REPLAN_REQUIRED' and next_handoff.get('next_task', {}).get('diagnostic'):
            preflight(updated_ledger, launch_task(next_handoff), args.max_sessions)
            continue_loop = True  # Exactly one explicit diagnostic after first no-progress.
        if updated_ledger.get('last_progress') == iteration:
            updated_ledger['last_progress_at'] = now()
        elif state.get('last_progress_at'):
            updated_ledger['last_progress_at'] = state['last_progress_at']
        atomic_json(ledger_path, updated_ledger)
        atomic_json(root / 'handoff.json', next_handoff)
        state.update(phase='COMPLETE', decision=updated_ledger.get('decision'),
                     last_progress_at=updated_ledger.get('last_progress_at'))
        atomic_json(state_file, state)
        print('Completed iteration ' + iteration + ': ' + next_handoff['step'] + ' ' + next_handoff['state'])
        return continue_loop and next_handoff['state'] not in WAITING and not next_handoff.get('epic_complete')
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
    parser.add_argument('--offline', action='store_true', help='skip GitHub prefetch; agent must verify status')
    parser.add_argument('--max-sessions', type=int, default=8, help='durable total session cap; raising it extends the window')
    parser.add_argument('--session-seconds', type=float, default=1500)
    parser.add_argument('--status', action='store_true')
    parser.add_argument('--stop', action='store_true', help='persist stop and cancel the owned executor')
    parser.add_argument('--resume', action='store_true', help='clear operator stop/stagnation after explicit replan; keeps spent budget')
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
    if args.max_sessions < 1 or args.session_seconds <= 0 or not math.isfinite(args.session_seconds):
        parser.error('session count and duration must be positive')
    if args.stop:
        atomic_json(root / 'stop.json', dict(requested_at=now(), reason='operator stop'))
        print('Stop persisted. No new sessions will start.')
        return 0
    if args.status:
        active = json.loads((root / 'active.json').read_text()) if (root / 'active.json').exists() else {}
        ledger = json.loads((root / 'loop.json').read_text()) if (root / 'loop.json').exists() else {}
        if active.get('phase') == 'RUNNING' and not alive(active.get('child_pid')):
            active = dict(active, phase='UNKNOWN_RECONCILE')
        print(json.dumps(dict(active=active, loop=ledger, stopped=(root / 'stop.json').exists()), ensure_ascii=False, indent=2))
        return 0
    with open(root / 'controller.lock', 'a') as lock:
        try:
            if args.resume:
                active = json.loads((root / 'active.json').read_text()) if (root / 'active.json').exists() else {}
                if alive(active.get('child_pid')) or active.get('phase') in {'STARTING', 'RUNNING', 'NEEDS_RECONCILE'}:
                    raise ValueError('reconcile previous executor before resume')
                (root / 'stop.json').unlink(missing_ok=True)
                ledger = json.loads((root / 'loop.json').read_text()) if (root / 'loop.json').exists() else {}
                ledger.update(no_progress=0, decision='CONTINUE', resumed_at=now())
                atomic_json(root / 'loop.json', ledger)
                print('Replan resumed. Spent session budget preserved; no executor launched.')
                return 0
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
