# Engineering Approach — Sandbox Driven Development

Статус: согласованный подход к разработке · 30.09.2026. Конкретная реализация сред подтверждается отдельными прогонами.

## Концепция

AI-агент должен самостоятельно пройти от требования до проверяемого результата в воспроизводимой среде: развернуть зависимости, выполнить работу, проверить поведение и собрать доказательства. Требование и способ его проверки готовятся вместе. Если необходимый sandbox можно построить, его создание входит в задачу; ручное вмешательство пользователя не должно быть постоянным условием разработки.

Sandbox Driven Development означает проверку полного рабочего пути и контролируемых сбоев до подключения живых пользователей. Эмуляторы дают повторяемые ошибки; настоящие test-account прогоны проверяют свойства провайдера. Каждый результат явно указывает, что проверено, а что ещё неизвестно. Локальный PASS не называется проверкой облачной эксплуатации.

Sandbox — среда разработки. Agent clean room — граница доступа конкретного запуска. Одна sandbox VM может запускать несколько clean rooms. Работающий сервис, его credentials, webhook и пользовательские данные сохраняются отдельно.

## Persistent instructions Codex

Поддерживаемые пользовательские/проектные уровни: `~/.codex/AGENTS.md` (личные постоянные инструкции), `AGENTS.md` от корня репозитория до текущего каталога (более глубокие инструкции уточняют предыдущие), и доверенный проектный `.codex/config.toml` для настройки Codex. Codex config может выбирать approval/sandbox настройки, но проектная конфигурация загружается только для trusted repository. Проверено по [Codex instructions](https://developers.openai.com/codex/guides/agents-md/) и [configuration layers](https://developers.openai.com/codex/config-basic/).

Глобальное правило SDE находится в `~/.codex/AGENTS.md`; конкретные ресурсы и permissions — в repository `AGENTS.md`. Не дублируем операционные контракты в `.codex/config.toml`: config не ограничивает права отдельными облачными ресурсами, а project config не является надёжной заменой repo instructions. Текущий user config уже имеет `approval_policy = "never"` и `sandbox_mode = "danger-full-access"`; это даёт достаточную локальную автономность и не нуждается в расширении. Codex не предоставляет пользователю настраиваемый механизм, чтобы переписать системные/host-managed ограничения; инструкции могут конкретизировать user/project поведение, но не отменяют system policy.

## Sandbox-Driven Engineering: обязательная практика

Останавливаться до безопасного dev/test/staging запуска или отказываться от теста только потому, что он может упасть, — вредно: так незамеченный дефект доходит дальше. В объявленных изолированных средах агент должен активно запускать и развёртывать код, подавать реалистичный input, наблюдать output/logs/state, разбирать реальные ошибки, исправлять их и повторять E2E. Не просить подтверждение для рутинного deploy/restart/test/reset явно disposable sandbox-ресурсов, если Environment Contract это разрешает. Статическая проверка не заменяет доступный runtime evidence.

**Production остаётся отдельной trust boundary.** Свободная работа в dev/test/staging никогда не означает прямой deploy или mutation production. Каждый репозиторий объявляет проверенный Promotion to Production path; если он допускает непреднамеренный переход из PR/staging, это Sandbox Gap, который нужно закрепить issue и устранить.

Для активного репозитория обязателен concise Environment Contract в `AGENTS.md`. Создатель или существенный владелец runtime-компонента поддерживает testability path `deploy/start sandbox → send test input → observe output → inspect logs/state → reset/retry`; изменение этого пути обновляет contract в той же PR. Недостающее свойство — Sandbox Gap: маленький пробел устранить сразу, большой описать с влиянием на evidence и issue owning repository; cross-project gap связать с architecture issue.

## Общие правила

1. Каждый work item имеет воспроизводимый setup/run/evidence/teardown с pinned source/software/config versions и isolated resource namespace. Test fixture означает подготовленный сценарий, а не обязательный mock.
2. Приёмка включает положительный путь и релевантный controlled failure. Затронутый клиентский контракт проверяется снаружи; внутренний вызов не выдаётся за внешний API workflow.
3. Общая схема логов и retention — [Observability](OBSERVABILITY-AND-ERROR-CONTRACT.md); обязательные проверки конкретного этапа — [Sandbox](SANDBOX.md). Evidence содержит sanitized transcript, IDs, версии, manifest/hash и исход recovery/cleanup.
4. Реальные вызовы ограничены по времени, concurrency, диску и бюджету; free-only профиль не означает unlimited runs. Негативные сценарии не зависят от случайной ошибки бесплатной модели.
5. Секреты передаются bindings/refs и не входят в исходники, manifests для публикации или журналы. Недоступная необязательная capability объявляется явно; отсутствие обязательной — даёт диагностируемый readiness outcome.
6. Автономная среда включает bootstrap без ручных исправлений. Config конкретного хоста отделён от общего release; безопасные defaults не включают боевые расписания и доставку на новой VM.
7. Пробел sandbox описывается как construction task с ограничениями fidelity и ожидаемым доказательством. Не обещаем поддержку provider sandbox, если её нет.
8. Promotion — отдельный проверяемый переход: test bindings/data не становятся production. Повтор setup не должен менять личность машины или включать вторую доставку.

### Hygiene открытых PR

Открытые PR, которые устарели, перекрыты более новым изменением или противоречат принятому решению, создают неоднозначность и накапливающийся delivery-риск. Перед новым PR пересчитай открытые PR в текущем task/repository scope. При 3–5 открытых PR используй свободное время на самостоятельную сортировку: обнови статусы/описания, закрой только очевидные дубли и superseded PR с краткой причиной; спорные изменения оставь открытыми и явно свяжи. При 8+ PR очередь красная: сообщи пользователю и спроси, поставить ли очистку первой. Пока ответа нет, продолжай независимую запрошенную работу, но не закрывай спорные PR и не добавляй новые дубли. Историю веток не переписывай и force-push не используй.

## Стадия 0: вход в любой репозиторий

Перед выбором новых зависимостей выполняем [нулевой исследовательский этап R00](TOOLING-RESEARCH-AND-VM-PILOTS.md): вопрос → minimal baseline → VM-пилот → измерения → решение. Обзор покрывает весь план, проверки выполняются партиями; dev/CI tool не переносится в каждый Agent Run. Установка без доказанной пользы, resource budget и заменяемости не считается приёмкой.

Общий development baseline покрывает все участвующие репозитории через тонкие профили: check/fix/verify, context build и logs. Docs-only repo не получает application build.

AutoFix начинает с механических исправлений, затем допускает bounded LLM/OpenCode patch и повторную проверку. Самостоятельные merge/deploy и GTD для контроля самого AutoFix не входят в этот подход.

Context compression — компактная карта repo и task-specific brief со ссылками на полные исходники, pinned revision и invalidation. Исходники не удаляются. Entry points, contracts, команды проверки и ограничения сохраняются; secrets/generated logs исключаются. Недостаточный brief раскрывается до исходного источника.

## Обязательный CI-артефакт во всех репозиториях

Каждый участвующий repo генерирует структурный context pack на каждом PR/revision и после обновления основной ветки. Это детерминированная обработка без LLM: краткая REPO-MAP, language-aware code compression (Tree-sitter или подходящий parser) и manifest с source SHA, версией generator/config, scope/ограничениями и hashes. В docs-only repo краткая карта строится по заголовкам и путям; исходники не заменяются пересказом.

Context-generation — завершающий шаг CI/CD, исполняемый также после failed checks: при интеграции в существующий workflow job зависит от check jobs через `needs`, использует `if: always()` и не требует application build/deploy для анализа. Успех генерации не объявляет неуспешный build успешным. В этом docs repo отдельный workflow Repository context выполняется на каждом PR/push и служит CI baseline.

README и AGENTS.md указывают краткую карту, способ проверить SHA и локальную команду. PR-specific pack публикуется как Actions artifact; main получает постоянную ссылку в отдельной generated ветке `repo-context`. Сгенерированные файлы не коммитятся в main и не содержат новых инструкций для агента. Только trusted main публикует постоянную версию; PR не получает publish credentials. Retention PR artifact — 30 дней; fresh main snapshot хранится в generated branch. Проверять свежесть по manifest обязательно.

Рабочий образец здесь: `.github/workflows/repo-context.yml`, `tools/repo-context/`, `.repo-context/repomix.config.json`. Repomix и зависимости pinned lockfile; код извлекается структурно. PR Fix отдельно сжимает diff/CI logs, это не замена repo-wide pack. Каждый repo адаптирует inclusion profile к своему языку и исключает secrets/generated/binary/runtime data; security scan сохраняется. Rollout в остальные live repo — задача Z03 через отдельные installation PR, не молчаливое изменение всех deployments.

## Где практика и план

- [Sandbox](SANDBOX.md) — методы, bindings/credentials, controlled failures, stage-specific logs checks и уроки VM2.
- [Implementation and Integration Plan](IMPLEMENTATION-AND-INTEGRATION-PLAN.md) — зависимости и порядок работ; этот документ не содержит второй календарь реализации.
- [ARCHITECTURE](ARCHITECTURE.md) — ownership, связь Workflow/Runner/диска и критерии перехода.
- Runnable setup/teardown и fixtures — в соответствующем implementation repo.

Статус карточек и их чек-листы — в issues и [Project «Trained Assist — Migration»](https://github.com/orgs/trained-assist/projects/1); общий гейт Done и типы доказательств — [Acceptance](ACCEPTANCE-CHECKLIST.md). GitHub Project/issues не являются runtime Task Store или GTD. Общие правила находятся здесь; issues карточек содержат специфическую приёмку и ссылки, а не копии этих правил.
