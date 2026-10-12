"""Role contracts and bounded continuation for the existing controller state-dir."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

SHA = re.compile(r'[0-9a-f]{40}$')
ROLES = {
    'builder': 'Внеси минимальное изменение и сохрани recoverable evidence. Не принимай собственную работу как независимый reviewer.',
    'verifier': 'Проверь frozen revisions через настоящий пользовательский CLI/UI. Различай harness failure, product failure и inconclusive; не исправляй продукт в этой сессии.',
    'reviewer': 'Read-only review exact requirements/SHA/evidence в отдельной свежей сессии и checkout. Вердикт PASS/FAIL/INCONCLUSIVE; роль не доказывает другую model family.',
    'researcher': 'Проверь одну гипотезу или альтернативу. Сохрани эксперимент/отрицательный результат и решение, связанное с критерием; не создавай общий обзор ради очередной итерации.',
    'integrator': 'Сверь participating repos, schema/API owners и exact source/tested/installed revisions. Проверь сквозной контракт; merge/health endpoint не означает доставку.',
}


def role_task(task, handoff):
    role = task.get('role', 'builder')
    if role not in ROLES:
        raise ValueError('unknown task role')
    revision = task.get('requirements_revision', handoff.get('requirements_revision'))
    if not isinstance(revision, str) or not revision.strip():
        raise ValueError('requirements_revision is required for a role task')
    if handoff.get('requirements_revision') != revision:
        raise ValueError('next_task cannot silently rewrite accepted requirements revision')
    result = dict(role=role, requirements_revision=revision)
    if role in {'reviewer', 'verifier'}:
        frozen = task.get('frozen')
        if not isinstance(frozen, dict) or frozen.get('requirements_revision') != revision:
            raise ValueError('review/verifier requires frozen requirements and source_shas')
        sources = frozen.get('source_shas', {})
        if not sources or any(not isinstance(sha, str) or not SHA.fullmatch(sha) for sha in sources.values()):
            raise ValueError('frozen source_shas must pin every participating repo')
        if sources.get(task.get('repo', handoff['repo'])) != task.get('head_sha', handoff['head_sha']):
            raise ValueError('task target SHA differs from frozen revision')
        if not frozen.get('evidence'):
            raise ValueError('review/verifier requires frozen evidence references')
        if role == 'reviewer' and (
            not frozen.get('builder_checkout') or
            Path(task.get('checkout', handoff['checkout'])).resolve() == Path(frozen['builder_checkout']).resolve()
        ):
            raise ValueError('reviewer requires a checkout separate from builder')
        result['frozen'] = frozen
    execution = task.get('execution', {})
    if execution:
        if not isinstance(execution, dict) or not isinstance(execution.get('model'), str):
            raise ValueError('execution requires an approved provider/model profile')
        result['execution'] = execution  # Requested profile is not actual model evidence.
    if task.get('diagnostic'):
        if role not in {'researcher', 'verifier'} or not task.get('hypothesis'):
            raise ValueError('diagnostic requires researcher/verifier and a concrete hypothesis')
        result.update(diagnostic=True, hypothesis=task['hypothesis'])
    return result


def slice_key(task):
    values = {key: task[key] for key in ('step', 'repo', 'requirements_revision', 'goal', 'acceptance')}
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()


def preflight(ledger, task, max_sessions):
    if ledger.get('sessions_started', 0) >= max_sessions:
        raise ValueError('session budget exhausted; spent count survives restart/import')
    if ledger.get('decision') == 'STAGNATED':
        raise ValueError('two iterations without meaningful progress; operator replan required')
    if ledger.get('decision') == 'REPLAN_REQUIRED' and (
        not task.get('diagnostic') or slice_key(task) == ledger.get('last_slice')
    ):
        raise ValueError('no progress: same slice cannot repeat; select one bounded diagnostic')


def receipt(item):
    if not isinstance(item, dict) or item.get('kind') not in {'artifact', 'criterion', 'negative_experiment'}:
        raise ValueError('evidence receipt requires artifact/criterion/negative_experiment')
    digest = item.get('sha256')
    if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest):
        raise ValueError('evidence receipt requires sha256')
    ref = item.get('ref')
    if not isinstance(ref, str) or not Path(ref).is_absolute() or not Path(ref).is_file():
        raise ValueError('progress evidence must be a recoverable local artifact; remote refs belong inside it')
    measured = hashlib.sha256(Path(ref).read_bytes()).hexdigest()
    if measured != digest:
        raise ValueError('evidence artifact digest mismatch')
    if not item.get('criterion'):
        raise ValueError('evidence receipt requires a criterion')
    # A copied path, renamed report or new iteration ID is not a new result.
    return item['kind'] + ':' + item['criterion'] + ':' + digest


def delivery_gate(result, task, current_iteration):
    if result.get('harness') != 'valid':
        raise ValueError('delivery requires a valid harness')
    delivery = result.get('delivery', {})
    versions = delivery.get('versions', {})
    sources = result.get('source_shas', {})
    if not versions or set(versions) != set(sources):
        raise ValueError('delivery must pin every participating repo')
    for repo, version in versions.items():
        if not isinstance(version, dict) or any(version.get(key) != sources[repo] for key in ('source', 'tested', 'installed')):
            raise ValueError('source/tested/installed version drift holds delivery')
    client = delivery.get('client', {})
    if client.get('interface') not in {'CLI', 'UI'} or client.get('result') != 'PASS':
        raise ValueError('delivery requires real client acceptance, not internal PASS')
    receipt(client.get('evidence'))
    review = delivery.get('review', {})
    if (review.get('verdict') != 'PASS' or review.get('requirements_revision') != task['requirements_revision'] or
        review.get('source_shas') != sources or not review.get('iteration_id') or
        review['iteration_id'] == current_iteration):
        raise ValueError('delivery requires independent review of exact requirements/revisions')
    builder = review.get('builder_model_family')
    reviewer = review.get('reviewer_model_family')
    if not builder or not reviewer or 'UNKNOWN' in (str(builder).upper(), str(reviewer).upper()) or builder == reviewer:
        raise ValueError('model-family independence is unknown; acceptance is inconclusive')
    receipt(review.get('model_metadata'))
    metadata = json.loads(Path(review['model_metadata']['ref']).read_text())
    if (metadata.get('mode') != 'actual' or
        metadata.get('builder', {}).get('model_family') != builder or
        metadata.get('reviewer', {}).get('model_family') != reviewer or
        not metadata['builder'].get('session_id') or not metadata['reviewer'].get('session_id') or
        metadata['builder']['session_id'] == metadata['reviewer']['session_id'] or
        not metadata['builder'].get('source') or not metadata['reviewer'].get('source')):
        raise ValueError('requested role/model labels do not prove actual independent execution')
    receipt(review.get('evidence'))


def assess(ledger, handoff, task, require_result):
    result = handoff.get('result')
    if not result:
        if handoff.get('epic_complete'):
            raise ValueError('epic completion requires delivered client/review/version evidence')
        if handoff['state'] in {'IN_REVIEW', 'WAITING_CI', 'WAITING_REVIEW', 'BLOCKED'}:
            return dict(ledger, last_result='awaiting_condition'), False
        if require_result:
            raise ValueError('loop continuation requires classified result and evidence receipts')
        return dict(ledger), True
    if result.get('kind') not in {'progress', 'harness_failed', 'product_failed', 'inconclusive', 'verified', 'delivered'}:
        raise ValueError('result must distinguish harness/product failure and incomplete acceptance')
    if result.get('requirements_revision') != task['requirements_revision']:
        raise ValueError('result changed accepted requirements revision')
    sources = result.get('source_shas', {})
    if not isinstance(sources, dict):
        raise ValueError('result source_shas must be a map')
    if any(not isinstance(sha, str) or not SHA.fullmatch(sha) for sha in sources.values()):
        raise ValueError('invalid result source_shas')
    if result['kind'] in {'verified', 'delivered'}:
        if not sources or result.get('harness') != 'valid' or not result.get('evidence'):
            raise ValueError('invalid harness or absent evidence cannot verify product')
    if result['kind'] == 'harness_failed' and result.get('metrics'):
        raise ValueError('failed harness cannot supply quality/cost metrics')
    if result['kind'] == 'delivered':
        delivery_gate(result, task, handoff['iteration_id'])
    if handoff.get('epic_complete') and result['kind'] != 'delivered':
        raise ValueError('epic completion requires delivered client/review/version evidence')
    signatures = {receipt(item) for item in result.get('evidence', [])}
    if any(item['criterion'] not in task['acceptance'] for item in result.get('evidence', [])):
        raise ValueError('progress receipt is unrelated to the selected acceptance criterion')
    previous = set(ledger.get('seen_evidence', []))
    delta = signatures - previous
    # A new source commit counts only when the actual local target contains a diff.
    local_sha = sources.get(handoff['repo'])
    baseline_sha = ledger.get('source_shas', {}).get(handoff['repo'], task['head_sha'])
    if local_sha and local_sha != baseline_sha:
        actual = subprocess.run(['git', '-C', handoff['checkout'], 'rev-parse', 'HEAD'],
                                capture_output=True, text=True)
        if actual.returncode == 0 and actual.stdout.strip() == local_sha:
            diff = subprocess.run(['git', '-C', handoff['checkout'], 'diff', '--quiet',
                                   baseline_sha, local_sha], capture_output=True)
            if diff.returncode == 1:
                delta.add('source:' + handoff['repo'] + ':' + local_sha)
    waiting = handoff['state'] in {'IN_REVIEW', 'WAITING_CI', 'WAITING_REVIEW', 'BLOCKED'}
    updated = dict(ledger, seen_evidence=sorted(previous | signatures), source_shas=sources,
                   last_slice=slice_key(task), last_result=result['kind'])
    if handoff.get('epic_complete'):
        updated.update(no_progress=0, decision='SCOPE_COMPLETE')
        return updated, False
    if delta:
        updated.update(no_progress=0, decision='CONTINUE', last_progress=handoff['iteration_id'])
    elif not waiting:
        count = ledger.get('no_progress', 0) + 1
        updated.update(no_progress=count, decision='STAGNATED' if count >= 2 else 'REPLAN_REQUIRED')
    return updated, updated.get('decision') == 'CONTINUE' and not waiting
