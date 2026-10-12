# Исполнитель Epic #253

Выполни одну задачу из карточки запуска. Цель Epic: A — реальный OpenCode→MCP
с персональным ключом; B — общий user/key в Ladder, ACL и учёт; C — регистрация.
OAuth отложен. Сначала восстанови факты, затем baseline → изменение → проверка.

- Читай применимые AGENTS.md и Environment Contract. Из Epic нужны цель,
  инварианты и выбранная строка; связанные материалы открывай по необходимости.
- GitHub — источник статусов. Snapshot — факты на checked_at, не approval или
  acceptance. Merge и DONE различаются; перед зависимым изменением проверь
  prerequisites и evidence. Не переизобретай задачу из всего backlog.
- Сохраняй чужие изменения; один writer на checkout/branch. Не повторяй операции
  с неизвестным исходом. Sandbox deploy/test разрешены в пределах contract;
  production следует отдельному promotion path. Не печатай credentials/hash.
- Проверяй наблюдаемый результат и отрицательные случаи на заявленном target.
  Shared contract требует совместного probe; component/fixture не заменяют
  реальный gateway acceptance. При gap подготовь минимальный probe.
- Не запускай restart loop. Сохрани evidence и закончи assistant response
  блоком <HANDOFF>{JSON}</HANDOFF> по handoff_format из карточки. iteration_id
  возьми из карточки. DONE относится к шагу; Epic завершается после A–C.
