# Durable handoff

Перед любым выходом сохрани следующий JSON в progress/handoff (реальные значения, без secrets):

```json
{
  "epic": "trained-assist/trained-agent-architecture#253",
  "revision": "v3",
  "iteration_id": "<unique>",
  "step": "<atomic ID>",
  "state": "IN_PROGRESS",
  "work_issue": "<URL>",
  "repo": "<owner/name>",
  "checkout": "<absolute path>",
  "branch": "<branch>",
  "head_sha": "<SHA>",
  "pr": "<URL or null>",
  "sandbox": {"lane": "<verified>", "contract": "<ref>", "claim": "<ref>", "deployed_sha": "<SHA or null>"},
  "tests": [{"command": "<command>", "result": "PASS|FAIL|NOT_RUN", "evidence": "<ref>"}],
  "opencode": {"test_run_id": "<id or null>", "launch_state": "NOT_STARTED|STARTING|OBSERVING|COMPLETE|UNKNOWN", "session_id": "<id or null>", "evidence": "<ref or null>"},
  "next_action": "<one concrete command/action>",
  "waiting_for": null,
  "next_check_at": null
}
```

Если GitHub недоступен, сохрани приватный локальный spool/handoff вне исходников, укажи путь контроллеру; в следующей сессии reconcile один раз. Не утверждай, что remote status обновлён, если запись не подтверждена. Не публикуй raw transcript с секретами.

head_sha — полный SHA (40 символов), iteration_id — из карточки контроллера.
READY означает готовую reconciled задачу. Для отсутствующего probe допустим
NOT_APPLICABLE с причиной. Для waiting state обязателен waiting_for.
DONE завершает текущий step; epic_complete=true требует A/B/C PASS evidence.

Для следующего запуска добавить next_task. Это задача следующего исполнителя,
а не прежний completed step. Для продолжения может сохраняться тот же step.

```json
{
  "next_task": {
    "step": "<atomic ID>",
    "goal": "<одно наблюдаемое изменение>",
    "acceptance": ["<проверка и ожидаемый результат>"],
    "references": ["<issue/PR/contract URL или абсолютный путь>"],
    "prerequisites": ["<PR URL>"],
    "repo": "<owner/name>",
    "checkout": "<absolute path>",
    "branch": "<branch>",
    "head_sha": "<full SHA>"
  }
}
```

repo/checkout/branch/head_sha можно опустить, если target не изменился:
контроллер использует значения основного handoff. Для другого repo обязательны
все четыре значения. После DONE next_task.step должен отличаться от завершённого.
Для BLOCKED/waiting/epic_complete next_task необязателен; launcher не запускается.
acceptance формируется по выбранной строке Epic, не выводится из факта merge.
