# OpenRNA

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Русский | [English](README.md)

Контур управления для персонализированных РНК-вакцин на основе неоантигенов.

## Кратко

- Повторно проверено 2026-04-21: 504 теста, 22 набора тестов, 94.49% покрытия по строкам, 82.88% по ветвлениям и 94.11% по функциям; `npm audit --omit=dev --audit-level=high` проходит без high-уязвимостей; `npm run sbom:cyclonedx:file` обновлён.
- Архитектурный базис: 18 портов, 23 адаптера, 17 состояний жизненного цикла кейса.
- Репозиторий готов к инженерной и исследовательской проверке, но не заявляет клиническую эксплуатацию и не заявляет полное соответствие 21 CFR Part 11.

Формальный срез доказательной базы: [docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-21.md](docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-21.md).

Разбор изменений контрольного контура от 2026-04-21: [docs/archive/reports/BREAKING_CHANGES_2026-04-21.md](docs/archive/reports/BREAKING_CHANGES_2026-04-21.md).

## Зачем нужен этот проект

Персонализированная противоопухолевая РНК-терапия уже вышла за рамки ранних экспериментов. В открытых реестрах и рецензируемых публикациях видно движение к более крупным и многоцентровым программам.

В такой среде ключевым ограничением становится не отдельный алгоритм, а управляемость процесса на уровне конкретного пациента: согласия, происхождение образцов, версии референсных наборов, воспроизводимый запуск вычислительных цепочек, экспертный разбор, передача в производство и последующее наблюдение.

`OpenRNA` покрывает именно этот слой. Это не «ещё один предсказатель», а контур координации между биоинформатическими инструментами, клиническими ограничениями и операционными процедурами.

Клинические ориентиры проекта: NCT05933577 (V940/INTerpath-001) и NCT05968326 (autogene cevumeran/IMCODE003). Подробный контекст собран в [docs/archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md](docs/archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md).

## Что делает OpenRNA

- ведёт кейс пациента через управляемый жизненный цикл из 17 состояний;
- фиксирует происхождение образцов и производных артефактов;
- оркестрирует запуск вычислительных процессов с идемпотентностью через `x-idempotency-key`;
- поддерживает консенсус HLA из нескольких инструментов с операторским разбором конфликтов;
- выполняет контроль качества и сохраняет решения по QC;
- хранит результаты ранжирования неоантигенов и параметры дизайна конструкта, включая стратегии линкеров;
- формирует материалы для экспертного разбора, финального разрешения на выпуск и передачи в производство;
- ведёт временную шкалу исходов: введение, иммуномониторинг, клиническое наблюдение;
- обеспечивает сквозную трассируемость через журнал доменных событий;
- экспортирует операционные и FHIR-ориентированные представления через явные порты.

## Чего OpenRNA сознательно не делает

- не выполняет предсказание неоантигенов внутри себя, а делегирует его внешним движкам через `INeoantigenRankingEngine`;
- не заменяет Nextflow, sarek или pVACtools как вычислительный конвейер;
- не является клинической системой поддержки принятия решений;
- не заявляет завершённую валидацию для 21 CFR Part 11 и не позиционируется как готовый медицинский продукт.

## Архитектурная модель

- бизнес-логика построена вокруг портов `src/ports/*` и не зависит от конкретных реализаций;
- адаптеры подключаются через `AppDependencies`; по умолчанию используется хранение в памяти, для устойчивого режима предусмотрен PostgreSQL;
- входные контракты валидируются через Zod на границе API;
- переходы состояний контролируются через `IStateMachineGuard`;
- аудитные события и корреляционные идентификаторы образуют трассируемый контур;
- доступ построен вокруг API key, JWT и RBAC с запретом по умолчанию и отдельными правами для review и release.

Основной архитектурный документ: [docs/design.md](docs/design.md).

## Честная оценка зрелости

| Слой | Текущее состояние |
|---|---|
| Техническая реализация контура управления | Реализована и покрыта тестами |
| Инженерный контур репозитория (CI, SAST, SBOM, provenance) | Реализован |
| Клиническая эксплуатация | Не заявляется |
| Электронные подписи и независимая финальная release-процедура | Реализованы частично, но не доведены до уровня identity-bound Part 11 |
| Ресурсно-ограниченная авторизация и часть регуляторных ограничений | Находятся в активном плане усиления |

Детали по ограничениям и плану усиления: [docs/archive/reports/OPENRNA_HARDENING_ROADMAP_2026.md](docs/archive/reports/OPENRNA_HARDENING_ROADMAP_2026.md).

## Быстрый старт

```bash
npm ci
npm run build
npm test
npm run test:coverage
npm run sbom:cyclonedx:file
npm run dev
```

Интегральная проверка одной командой:

```bash
npm run ci
```

## Переменные окружения

Источник истины: [src/config.ts](src/config.ts).

| Переменная | Значение по умолчанию | Назначение |
|---|---|---|
| `PORT` | `4010` | Порт HTTP-сервера |
| `CASE_STORE_DATABASE_URL` | unset | PostgreSQL для кейсов; пустое значение означает хранение в памяти |
| `CASE_STORE_TABLE_NAME` | `case_records` | Имя таблицы кейсов |
| `WORKFLOW_DISPATCH_DATABASE_URL` | unset | PostgreSQL для диспетчеризации; пустое значение означает хранение в памяти |
| `WORKFLOW_DISPATCH_TABLE_NAME` | `workflow_dispatches` | Имя таблицы диспетчеризации |
| `API_KEY` | unset | Аутентификация по API key через `x-api-key` |
| `API_KEY_PRINCIPAL_ID` | `api-key-client` | Идентификатор субъекта для API key |
| `RBAC_ALLOW_ALL` | `false` | Аварийный разрешающий режим, не для production |
| `JWT_SHARED_SECRET` | unset | JWT HS256, минимум 32 байта |
| `JWT_PUBLIC_KEY_PEM` | unset | JWT RS256 public key |
| `JWT_EXPECTED_ISSUER` | unset | Ограничение по `iss` |
| `JWT_EXPECTED_AUDIENCE` | unset | Ограничение по `aud` |
| `JWT_PRINCIPAL_CLAIM` | `sub` | Имя claim с идентификатором субъекта |
| `JWT_ROLE_CLAIM` | `roles` | Имя claim с ролями |

## Качество и безопасность цепочки поставок

Локальная проверка:

```bash
npm run build
npm test
npm run test:coverage
npm audit --omit=dev --audit-level=high
npm run sbom:cyclonedx:file
```

Контроль на GitHub:

- [.github/workflows/ci.yml](.github/workflows/ci.yml) — сборка, тесты, покрытие, аудит зависимостей и проверка health endpoints;
- [.github/workflows/codeql.yml](.github/workflows/codeql.yml) — статический анализ безопасности;
- [.github/workflows/dependency-review.yml](.github/workflows/dependency-review.yml) — проверка риска зависимостей в pull request;
- [.github/workflows/supply-chain-provenance.yml](.github/workflows/supply-chain-provenance.yml) — SBOM, контрольные суммы, attestations и release assets.

## Документация и отчёты

| Источник | Назначение |
|---|---|
| [docs/PUBLIC_ARCHITECTURE_INDEX.md](docs/PUBLIC_ARCHITECTURE_INDEX.md) | Главный указатель по активной документации |
| [docs/INTENDED_USE.md](docs/INTENDED_USE.md) | Формализованная область применения |
| [docs/design.md](docs/design.md) | Основной архитектурный документ |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Карта HTTP-контрактов |
| [docs/CONSENT_ACCESS_POLICY_2026.md](docs/CONSENT_ACCESS_POLICY_2026.md) | Матрица согласий и доступа |
| [docs/OPERATIONS_AND_FAILURE_MODES.md](docs/OPERATIONS_AND_FAILURE_MODES.md) | Операционная модель и классы отказов |
| [docs/REGULATORY_CONTEXT.md](docs/REGULATORY_CONTEXT.md) | Регуляторный контекст и текущие ограничения |
| [docs/archive/](docs/archive/) | Архив доказательной базы, публикационных пакетов и исторических аудитов |

## Как участвовать

- Правила вкладов: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
- Политика безопасности: [docs/SECURITY.md](docs/SECURITY.md)
- Поддержка: [docs/SUPPORT.md](docs/SUPPORT.md)
- Кодекс поведения: [docs/CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md)

## Лицензия

Apache-2.0. См. [LICENSE](LICENSE).
