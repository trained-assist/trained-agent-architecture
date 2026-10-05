# Вывод старой GCP VM: runbook cutoff

Операционный статус и чек-лист — [issue #145](https://github.com/trained-assist/trained-agent-architecture/issues/145). Этот документ фиксирует последовательность и критерии. Он не разрешает немедленно останавливать машину.

## Ресурс и подтверждённая исходная точка

Read-only GCP API 05.10.2026: project `alesa-personal-assistent`, zone `us-central1-a`, instance `alesa-vm`, ID `7077705867419574607`, состояние `RUNNING`, тип `e2-standard-4`. Подключён один `pd-ssd` на 200 ГБ с `autoDelete` **не подтверждён**; перед stop и любым будущим удалением проверить флаг непосредственно в Compute API. В project-wide списках на момент проверки не найдены snapshots и зарезервированные addresses. Это не оценка фактического счёта и не проверка commitments.

Read-only SSH 05.10: работают `assist-agent`, `sar`, `nginx`, `chrome-vova`, `chrome-alesa`, `xvfb-vova`, `xvfb-alesa`, `login-server`, `novnc-browser`, `token-relay`, `zen-relay`, `cloudflared-agent`, `freelance-bot`, `host-monitor`, `xray`, `anydesk` и системные службы. В crontab обнаружены `mainstream-cron.sh`, `disk-guard.sh`, `dead-tenant-sweep.sh`, `bugs-collector-cron.sh`, `issue-fixer-cron.sh`, `claude-token-refresh.sh`; упоминание скрипта не доказывает его полезность. В `~/users` 40 каталогов верхнего уровня, в `~/agent-data` — 50. Эти числа не являются числом пользователей или подтверждением полного экспорта. Имена, содержимое и manifest пользовательских данных в публичный репозиторий не помещаются.

## Инвентарь и целевой путь

| Объект | Источник/потребитель | Предполагаемое место | Проверка перед cutoff | Остаток |
|---|---|---|---|---|
| Пользовательские профили, проекты, dirty/untracked файлы, ветки | `~/users`, Git/worktrees; Agent Run | Приватные profile repos + object storage; secrets через broker | Полный приватный manifest, checksums, binding каждого профиля, Run A → Run B вне GCP VM | Авторитетные пути, исключения и импорт ещё не подтверждены |
| Session/task state, callbacks, outbox, leases | `~/agent-data`, legacy consumers | Durable Task Store/objects либо согласованный временный owner | Drain/reconcile по task/run/operation ID; нет потерянных awaiting/unknown | Инвентарь ещё не завершён |
| Agent Run | `assist-agent`, `sar` и клиенты | Собственный async Agent Run API → ephemeral worker | End-to-end input, result, artifacts, cancel, cleanup и повтор доставки | Интегратор #140 ведёт приёмку; production cutover не разрешён |
| Shared MCP/service capabilities | Legacy MCP, UI, бот | Один canonical serverless handler; VM adapter при необходимости | Настоящий потребитель вызывает тот же handler без постоянного Run | Выбор по каждому методу #2061 |
| Браузер/login/CDP, relays, xray | Локальные процессы и внешние consumers | Только подтверждённая нужда в постоянном процессе → существующая VM Франция | Реальный сценарий, restart, identity, auth, владелец и конфликты с #140 | Не переносить комплект автоматически |
| Cron, webhooks, DNS/CI targets | GCP VM, GitHub Actions и внешние вызовы | Serverless schedule/handler либо Франция при обосновании | Единственный writer/scheduler, нет вызовов старого host | `trained-assist-agent` CI guard — PR #2144; прочие targets ещё сверяются |

VM во Франции установлена по конфигурации legacy repo как `contabo-vm2`; это не подтверждение права менять её сервисы. Любое пересечение с #140/#141 согласуется до изменения.

## Гейты и порядок

1. **До переключения:** read-only инвентарь процессов, consumers и всех профилей. Приватный manifest содержит path, size, SHA-256, тип/версию, profile binding, dirty/untracked и ссылки на внешние объекты. Зафиксировать число профилей и исключения. Архив и журнал миграции с устойчивым ID хранятся вне старой VM, с ограниченным доступом.
2. **Начальный экспорт:** использовать принятый persistent-workspace контракт; ensure repo идемпотентен, импорт возобновляем, секреты не попадают в Git. Тяжёлые бинарные данные идут в object storage. При конфликте сохранить base, старый снимок и новый head; canonical head не перетирать. SQLite копировать согласованным backup или после остановки writers с учётом WAL.
3. **Восстановление:** сверить каждый manifest и доступность objects. На синтетическом профиле Run A читает и сохраняет разрешённое изменение/артефакт, Run B на новой временной среде видит результат. Snapshot диска и одна тестовая сессия не заменяют эту проверку.
4. **Drain/cutoff:** согласовать конкретное окно с интегратором и владельцем. Остановить новые admissions и старые schedulers/writers без двойного выполнения. Дождаться или записать исход каждой active/awaiting/unknown операции; reconcile по ID перед повтором, учесть callbacks/outbox. Зафиксировать границу версии/времени, финальную дельту и отсутствие новых записей.
5. **Приёмка без старого host:** новые UI/TG/API/MCP пути и применимые реальные сценарии проходят с отключённым доступом к GCP VM; результат, артефакт, доставка, awaiting input, controlled failure и cleanup наблюдаемы. Monitoring и logs доступны отдельно. Rollback новых компонентов не должен незаметно возобновлять старых writers.
6. **Stop:** только после опубликованной сводки evidence и согласованного cutoff. Записать pre-stop состояние и оператора. Безопасная команда для *остановки инстанса* после гейта: `gcloud compute instances stop alesa-vm --project=alesa-personal-assistent --zone=us-central1-a`. Затем проверить `TERMINATED` через `gcloud compute instances describe` и повторить критичные сценарии в течение полного цикла самого важного перенесённого расписания.
7. **Расходы и retention:** отдельно проверить persistent disk, snapshots, static IP, commitments, storage и сопутствующие начисления по Billing после stop; предложить срок хранения резервной копии. Удаление VM, диска, backup и других ресурсов — отдельное явное решение после доказанной копии и восстановления. Другие сервисы Google остаются разрешены.

При сбое после cutoff сначала остановить новые admissions/writers, сверить изменения и операции после границы, затем выбрать восстановление. Простое включение старой VM со старым состоянием создаёт конфликт и не является безопасным rollback.
