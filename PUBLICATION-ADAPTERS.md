# Publication adapters: Workspace Views → hosting

## Boundary

Предлагаемый контракт. Реализация адаптеров и live-приёмка не заявлены. Git и существующий WorkspaceService остаются единственными владельцами исходников и CAS/conflict flow. Workspace View выдаёт разрешённую папку на immutable revision; публикация создаёт производный deployment, не новый пользовательский репозиторий.

Источник: [Workspace Views](WORKSPACE-VIEWS-AND-CONSUMER-ACCESS.md). Планы миграций и evidence ведутся в issues.

## Общая модель

PublicationTarget связывает tenant/profile/view с provider, credentialBindingRef, region, project/site/resource identity, runtimeKind и route policy. identity берётся из host-owned binding, не из текста модели. RouteBinding сохраняет пользовательский URL: host + path prefix → publicationId/channel. Эта таблица маршрутизации не хранит версии исходников и не делает merge.

PublicationIntent содержит operationId, targetId, viewRevision, sourceCommit, manifestDigest, selectionDigest, channel, expectedDeploymentId и buildSpecRef. Вызов закрепляет SHA. main/dev разрешаются по Workspace Views; dev-preview может быть закрытым и не становится production автоматически. Чтение новой Git revision не равно разрешению выложить её.

RuntimeKind: static-assets, serverless-http, container-http. Статический экспорт — default. Нельзя считать функции, Worker JS и контейнеры взаимозаменяемыми: адаптер объявляет supported runtimes, limits, regions, auth, preview, rollback и route capabilities. Несовместимый runtime возвращает unsupported_runtime; код не переписывается молча.

DeploymentReceipt: publicationId, operationId, providerDeploymentId, viewRevision, digest, immutableUrl, previewUrl, stableUrl, state, evidenceRef. Состояния: accepted → preparing → deploying → verifying → ready; также failed, uncertain, rolled_back. ready только после проверки HTTP/ассетов/auth, а не только ответа deploy API.

## Порты и методы

- describeCapabilities(targetId): проверяемая матрица возможностей.
- validate(intent): scope, runtime, build inputs, лимиты, регион и credentials.
- deploy(intent): идемпотентное создание immutable deployment.
- getOperation(operationId): восстановление после потери ответа без слепого повторного создания.
- verify(deploymentId, verificationSpec): страницы, assets, MIME, redirects, auth.
- activateRoute(routeId, deploymentId, expectedPreviousDeploymentId): CAS переключения stable URL после verify.
- rollback(routeId, previousDeploymentId, expectedCurrentDeploymentId): обратное переключение.
- retire(deploymentId): отдельное удаление только неиспользуемого deployment по retention policy.

Если провайдер не поддерживает атомарное переключение, адаптер сообщает ограничение; сначала проверяется промежуточный route/proxy, затем применяется соответствующая стратегия. Stable URL и immutable URL различаются. Callback подписан, дедуплицируется по operationId и проверяется на устаревший deployment. Потеря ответа означает uncertain + reconcile, не failed с немедленным повтором.

## Провайдеры

| Provider adapter | Статика | Серверная логика | Условия |
|---|---|---|---|
| Cloudflare | Pages Direct Upload либо Workers Static Assets | Workers | Для существующего Pages сохранять project identity; новый backend выбирать отдельно. Не требовать полного GitHub repo |
| Yandex Cloud | Object Storage; API Gateway как HTTP/auth routing при необходимости | Cloud Functions; отдельно Serverless Containers | Функции — не хранилище сайта. Private buckets + gateway для protected контента; public website только для явно публичного экспорта |
| Google | Firebase Hosting; Cloud Storage только с явной HTTPS/domain схемой | Cloud Run / Cloud Run functions | Firebase live/preview сопоставляются main/dev только на уровне deployment; preview TTL учитывается. GCP VM не требуется |
| Другие | S3-compatible static adapter, затем provider-specific routing | По capabilities | S3 API не гарантирует одинаковые TLS, domains, CDN, auth и atomic release |

Одинаковы intent, receipt и проверка, а не упаковка исполняемого кода. Наличие адаптера в таблице не означает готовый live backend. Первый вертикальный срез — текущий Cloudflare static сайт; Яндекс и Google проверяются отдельными sandbox canary без блокировки первого пилота.

## Credentials и публичность

Consumer получает только grant на нужный View. Provider credentials разрешаются host-side по target binding; не передаются в Git URL, RunSpec, браузер, bundle или модель. Federation/short-lived identity предпочтительны при поддержке провайдера; scoped credential resolver остаётся общим контрактом. Общий аккаунт и личный аккаунт — разные targets; владение project/domain проверяется перед записью.

Private source не означает public preview. Экспорт публикует лишь явно выбранные файлы; документы рекрутинга и данные кандидатов не считаются публичными по умолчанию. Парольные страницы сохраняют защиту HTML, raw, assets и caches. User HTML/JS не должен получить cookies/storage продуктового UI: отдельный origin либо доказанная sandbox policy. Tokens и query secrets исключаются из логов.

## Совместимость старых URL

Сохранять hostname, /p/slug, /s/project/, trailing slash, относительные assets, MIME, redirects и privacy. Сначала принять текущую публикацию как baseline deployment; потом связать её с проверенной папкой/revision. Если исходник не найден, записать source_unresolved и сохранить last-good serving. Не утверждать, что зеркало совпадает с исходником.

Provider-native pages.dev/web.app URL может требовать сохранения старого project/site. Нельзя обещать перенести чужой hostname на иной provider. Branded route может сменить backend при сохранении URL. DNS переключается только после route/HTTPS canary; старые ресурсы не удаляются одновременно.

## Sandbox contract

Общий adapter conformance suite: повтор operationId без второго deployment; restart/потеря receipt; stale callback; digest mismatch; concurrent route activation; rollback; folder scope; secret leakage; protected raw/assets; relative paths; missing source; превышение лимитов; credential revoke. Реальные sandbox пробы отдельно проверяют TLS/domain/auth, доступность из регионов и provider-specific limitations.

Логи связывают tenant/profile, userTaskId/runId при наличии, viewId/viewRevision, publicationId/operationId/providerDeploymentId; содержат typed error, timings, bytes/files и rollback evidence без контента/секретов. TTL — общий Observability contract; исходники и last-good deployment не удаляются по TTL диагностического лога.

## Источники

- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://developers.cloudflare.com/workers/static-assets/direct-upload/
- https://yandex.cloud/en/docs/storage/concepts/hosting
- https://yandex.cloud/en/docs/api-gateway/concepts/extensions/cloud-functions
- https://firebase.google.com/docs/hosting/
- https://firebase.google.com/docs/hosting/manage-hosting-resources
- https://docs.cloud.google.com/architecture/web-serving-overview
