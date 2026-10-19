"""Build a small launch packet; detailed contracts remain addressable resources."""
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request

from loop_policy import ROLES, role_task

EPIC_URL = 'https://github.com/trained-assist/trained-agent-architecture/issues/253'
GITHUB_REF = re.compile(r'https://github\.com/([\w.-]+)/([\w.-]+)/(pull|issues)/(\d+)(?:#.*)?$')


def launch_task(handoff):
    task = handoff.get('next_task')
    if not isinstance(task, dict):
        raise ValueError('next_task with explicit goal/acceptance is required before launch')
    for key in ('step', 'goal'):
        if not isinstance(task.get(key), str) or not task[key].strip():
            raise ValueError('next_task requires ' + key)
    acceptance = task.get('acceptance')
    if not isinstance(acceptance, list) or not acceptance or any(
        not isinstance(item, str) or not item.strip() for item in acceptance
    ):
        raise ValueError('next_task requires acceptance assertions')
    if handoff['state'] == 'DONE' and task['step'] == handoff['step']:
        raise ValueError('DONE requires a different next_task.step')
    if task.get('repo', handoff['repo']) != handoff['repo'] and any(
        not task.get(key) for key in ('checkout', 'branch', 'head_sha')
    ):
        raise ValueError('a different task repo requires its own checkout/branch/head_sha')
    result = {key: task.get(key, handoff[key]) for key in
              ('repo', 'checkout', 'branch', 'head_sha')}
    if any(not isinstance(value, str) or not value.strip() for value in result.values()):
        raise ValueError('next_task target fields must be nonempty strings')
    if not re.fullmatch(r'[0-9a-f]{40}', result['head_sha']):
        raise ValueError('next_task requires a full head_sha')
    result.update(step=task['step'], goal=task['goal'], acceptance=acceptance)
    result.update(role_task(task, handoff))
    if 'sandbox' in task:
        if not isinstance(task['sandbox'], dict):
            raise ValueError('next_task.sandbox must be an environment record')
        result['sandbox'] = task['sandbox']
    for key in ('references', 'prerequisites'):
        refs = task.get(key, [])
        if not isinstance(refs, list) or any(not isinstance(ref, str) for ref in refs):
            raise ValueError('next_task.' + key + ' must be a list of references')
        result[key] = refs
    if len(json.dumps(result, ensure_ascii=False)) > 5000:
        raise ValueError('next_task exceeds 5000 characters; move details to referenced files')
    return result


def credential():
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if token:
        return token
    try:
        result = subprocess.run(['security', 'find-generic-password', '-s', 'github.com',
                                 '-a', 'kobzevvv', '-w'], capture_output=True, text=True,
                                timeout=5, check=True)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def github_snapshot(refs, checked_at, enabled=True, token=None):
    if not enabled:
        return dict(status='NOT_FETCHED', checked_at=None, reason='offline launch; verify GitHub in session')
    token = token or credential()
    if not token:
        return dict(status='UNAVAILABLE', checked_at=None, reason='no GitHub credential; verify in session')

    def get(path):
        request = urllib.request.Request('https://api.github.com/repos/' + path,
            headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json'})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    def pages(path):
        result = []
        page = 1
        while True:
            data = get(path + ('&' if '?' in path else '?') + f'per_page=100&page={page}')
            values = data['check_runs'] if isinstance(data, dict) else data
            result.extend(values)
            if len(values) < 100:
                return result
            page += 1

    entries = []
    selected = sorted(set(ref for ref in refs if GITHUB_REF.fullmatch(ref)))
    if len(selected) > 12:
        raise ValueError('more than 12 GitHub references; narrow the selected task')
    for ref in selected:
        match = GITHUB_REF.fullmatch(ref)
        repo = match[1] + '/' + match[2]
        kind, number = match[3], match[4]
        try:
            obj = get(repo + ('/pulls/' if kind == 'pull' else '/issues/') + number)
            entry = dict(url=ref, state=obj['state'], updated_at=obj['updated_at'])
            if kind == 'pull':
                sha = obj['head']['sha']
                # Separate merge, reviews and checks; do not infer acceptance/readiness.
                entry.update(merged=obj['merged'], draft=obj['draft'], head_sha=sha)
                checks = {}
                for check in pages(repo + '/commits/' + sha + '/check-runs'):
                    key = (check['app']['id'], check['name'])
                    if key not in checks or check['id'] > checks[key]['id']:
                        checks[key] = check
                entry['checks'] = [dict(name=x['name'], status=x['status'],
                                        conclusion=x['conclusion']) for x in checks.values()]
                statuses = {}
                for status in pages(repo + '/commits/' + sha + '/statuses'):
                    if status['context'] not in statuses:
                        statuses[status['context']] = status['state']
                entry['statuses'] = statuses
                reviews = {}
                for review in pages(repo + '/pulls/' + number + '/reviews'):
                    if review['state'] not in {'COMMENTED', 'PENDING'}:
                        reviews[review['user']['login']] = review['state']
                entry['reviews'] = reviews
            entries.append(entry)
        except (OSError, ValueError, KeyError, urllib.error.HTTPError):
            # Never expose raw exceptions, payloads or headers in the prompt.
            entries.append(dict(url=ref, status='UNAVAILABLE', reason='read failed; verify in session'))
    return dict(status='FETCHED' if all('state' in entry for entry in entries) else 'PARTIAL',
                checked_at=checked_at, entries=entries)


def build_packet(handoff, task, iteration, root, prompt_path, snapshot, execution_cwd=None, limits=None):
    resources = Path(__file__).resolve().parent / 'references'
    packet = dict(iteration_id=iteration, epic=EPIC_URL, task=task,
                  execution_cwd=execution_cwd,
                  limits=limits,
                  previous={key: handoff.get(key) for key in
                            ('iteration_id', 'step', 'state', 'next_action', 'work_issue', 'pr')},
                  sandbox=task.get('sandbox', handoff['sandbox']), opencode=handoff['opencode'],
                  handoff_ref=str(root / 'handoff.json'),
                  checkpoint_ref=str(root / ('checkpoint-' + iteration + '.json')),
                  github=snapshot,
                  resources={name: str(resources / filename) for name, filename in {
                      'handoff_format': 'handoff-format.md',
                      'sandbox_and_integration': 'engineering.md',
                      'opencode_acceptance': 'opencode-probe.md',
                      'github_workflow': 'github-workflow.md',
                      'iteration_results': 'iteration-results.md',
                  }.items()})
    prompt = Path(prompt_path).read_text() + '\n## Роль этой сессии: ' + task['role'] + '\n' + ROLES[task['role']]
    prompt += '\n## Карточка запуска\n' + json.dumps(
        packet, ensure_ascii=False, separators=(',', ':'))
    # Keep task semantics intact: refuse oversized input instead of truncating it.
    if len(prompt) > 12000:
        raise ValueError('launch packet exceeds 12000 characters; narrow metadata/references')
    return prompt, packet
