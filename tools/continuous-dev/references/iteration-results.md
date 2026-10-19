# Результат итерации, checkpoint и доставка

Этот contract применяет [уроки #153](https://github.com/trained-assist/software-engineering-playbooks/issues/153)
к локальному controller. Он не заменяет существующий epic-delivery runtime и не является
его production rollout. Одна сессия — одна выбранная роль; researcher/integrator нужны
только для конкретной гипотезы/межрепозиторного среза. Role label не доказывает независимость.

## Задача и роли

next_task задаёт role=builder|verifier|reviewer|researcher|integrator и requirements_revision.
По умолчанию builder. Reviewer/verifier получают frozen={requirements_revision, source_shas,
evidence}; checkout HEAD должен соответствовать frozen source_shas своего repo. Reviewer
использует отдельный checkout; frozen.builder_checkout называет рабочее место builder.
execution.model — явный утверждённый provider/model профиль для CLI, не actual model evidence.
Вердикт без подтверждённого actual model family — INCONCLUSIVE для независимой приёмки.

После no-progress следующая задача — diagnostic=true, конкретная hypothesis и другая goal/step
в роли researcher/verifier. Один такой срез допускается; два no-progress останавливают цикл.
Не обходить session budget сменой роли, новой веткой, импортом handoff или process restart.

## Classified result

При --loop HANDOFF содержит result; при одиночном запуске это необязательно, кроме доставки.

```json
{
  "result": {
    "kind": "progress",
    "requirements_revision": "<accepted revision>",
    "source_shas": {"owner/repo": "<full SHA>"},
    "harness": "valid",
    "evidence": [{
      "kind": "artifact",
      "criterion": "<одна точная acceptance assertion из task packet>",
      "ref": "<absolute private artifact path>",
      "sha256": "<64 hex digest>"
    }]
  }
}
```

kind: progress, harness_failed, product_failed, inconclusive, verified, delivered.
Evidence kind: artifact, criterion, negative_experiment. Сохраняй raw результат в private
artifact, redacted remote refs — внутри него. Controller проверяет digest локального artifact;
тот же digest под другим именем/iteration ID не даёт нового прогресса. Новый source commit
считается только при проверенном локальном HEAD и реальном diff. Независимый reviewer
оценивает содержательность evidence: timestamp-only report не является accepted результатом,
даже если имеет новый digest. Digest проверяет сохранность, а не истинность результата.

Harness failure не даёт quality/cost metrics и не позволяет verified/delivered. Реальный
CLI/UI replay обязателен для client behavior: внутренний green test не закрывает внешний
путь. Сохраняй expected/actual client outcome и tested binary/service revisions.

## Delivery gate

delivered содержит delivery.versions для каждого result.source_shas:
{repo:{source:<SHA>,tested:<SHA>,installed:<SHA>}}. Любой mismatch удерживает delivery;
artifact/build identifiers и promotion receipts сохраняются внутри evidence.
delivery.client={interface:CLI|UI,result:PASS,evidence:<receipt>} фиксирует пользовательский
результат; health endpoint или успешно завершившийся внутренний worker не заменяет его.

delivery.review содержит verdict=PASS, requirements_revision, те же source_shas, отдельный
iteration_id, builder_model_family/reviewer_model_family разных реально наблюдавшихся семей,
model_metadata=<receipt> и evidence=<receipt>. Model metadata artifact — JSON:
{mode:actual,builder:{model_family,session_id,source},reviewer:{model_family,session_id,source}}.
source указывает наблюдение runtime/provider (например, trace), а не requested profile.
Controller сверяет идентичность/ссылки/digests; доверие содержимому проверяет независимый
acceptance operator. Он не умеет сам доказать произвольную provider telemetry.
Отсутствие metadata/reviewer/клиентского evidence = inconclusive, не фиктивный PASS.
epic_complete дополнительно требует существующую A/B/C acceptance; DONE остаётся статусом шага.

## Checkpoint в ходе сессии

После значимого среза и перед долгим ожиданием атомарно замени checkpoint_ref из task packet
JSON объектом {iteration_id,requirements_revision,phase,next_event,retry_at,evidence:[receipts]}.
phase: WORKING, WAITING_PROVIDER, WAITING_TOOL, WAITING_CI, RETRY_AT.
Пиши через private temporary file + os.replace; не включай credentials или полный transcript.
Heartbeat обновляет supervisor; last_progress_at обновляется только при новых digest receipts.
Checkpoint — recovery evidence, не терминальный HANDOFF и не подтверждение доставки.
