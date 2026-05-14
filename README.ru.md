# OpenRNA

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Русский | [English](README.md)

Контур управления для персонализированных РНК-вакцин на основе неоантигенов.

## Кратко

- Повторно проверено 2026-05-14: **555 тестов**, 23 набора тестов, все проходят; `npm audit --omit=dev --audit-level=high` чисто; lint и format gates проходят с **0 ошибок / 0 предупреждений**.
- Архитектурный базис: **22 порта**, 24 адаптера, 18 состояний жизненного цикла кейса.
- v0.1.3 hardening: запись и проверка audit hash-chain, identity-bound signatures через JWT `sub` и HMAC seal, поддержка OIDC JWKS URI, пакет IQ/OQ/PQ validation (`docs/VALIDATION_PACKAGE.md`).
- Репозиторий готов к инженерной и исследовательской проверке, но не заявляет клиническую эксплуатацию и не заявляет завершённое IQ/OQ/PQ execution на целевой регулируемой среде.

Формальный срез доказательной базы: [docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-21.md](docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-21.md).

Разбор изменений контрольного контура от 2026-04-21: [docs/archive/reports/BREAKING_CHANGES_2026-04-21.md](docs/archive/reports/BREAKING_CHANGES_2026-04-21.md).

## Зачем нужен этот проект

Персонализированная противоопухолевая РНК-терапия уже вышла за рамки ранних экспериментов. В открытых реестрах и рецензируемых публикациях видно движение к более крупным и многоцентровым программам.

В такой среде ключевым ограничением становится не отдельный алгоритм, а управляемость процесса на уровне конкретного пациента: согласия, происхождение образцов, версии референсных наборов, воспроизводимый запуск вычислительных цепочек, экспертный разбор, передача в производство и последующее наблюдение.

`OpenRNA` покрывает именно этот слой. Это не «ещё один предсказатель», а контур координации между биоинформатическими инструментами, клиническими ограничениями и операционными процедурами.

Клинические ориентиры проекта: NCT05933577 (V940/INTerpath-001) и NCT05968326 (autogene cevumeran/IMCODE003). Подробный контекст собран в [docs/archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md](docs/archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md).

## Что делает OpenRNA

- ведёт кейс пациента через управляемый жизненный цикл из 18 состояний, включая терминальное `CONSENT_WITHDRAWN`;
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
| Audit hash-chain (schema + write wiring + verify endpoint) | ✅ Реализован (v0.1.3) |
| Электронные подписи — identity-bound через JWT `sub` + HMAC seal | ✅ Реализованы (v0.1.3) |
| Per-user OIDC / JWKS URI | ✅ Поддерживается (v0.1.3); требуется настройка IdP |
| Ресурсно-ограниченная авторизация | ✅ Реализована для case-scoped routes; legacy records без ACL остаются переходным режимом |
| Prometheus-метрики (кейсы, HTTP-запросы, длительности) | ✅ Реализовано (v0.1.5) |
| `IPlatformAdapter` + `IToolExecutionPolicy` порты | ✅ Реализовано (v0.1.5) |
| Ограниченный rate-limiter + вытеснение JWKS-кэша | ✅ Реализовано (v0.1.5) |
| Express `trust proxy` + graceful shutdown с таймаутами | ✅ Реализовано (v0.1.5) |
| IQ/OQ/PQ validation package | ✅ Документ создан; исполнение протокола pending |

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
| `JWT_JWKS_URI` | unset | OIDC JWKS endpoint для удалённой проверки ключей |
| `JWT_EXPECTED_ISSUER` | unset | Ограничение по `iss` |
| `JWT_EXPECTED_AUDIENCE` | unset | Ограничение по `aud` |
| `JWT_PRINCIPAL_CLAIM` | `sub` | Имя claim с идентификатором субъекта |
| `JWT_ROLE_CLAIM` | `roles` | Имя claim с ролями |
| `SIGNATURE_SEAL_KEY` | unset | HMAC-SHA256 seal key ≥32 байта для identity-bound signature flows |
| `TRUST_PROXY` | `false` | Настройка Express `trust proxy` (`true` или число хопов за load balancer) |

## Качество и безопасность цепочки поставок

Локальная проверка:

```bash
npm run build
npm test
npm run test:coverage
npm audit --omit=dev --audit-level=high
npm run sbom:cyclonedx:file
```

Docker:

```bash
docker build -t openrna .
docker run -p 3000:3000 -e API_KEY=dev-key openrna
```

Локальный стек разработки с PostgreSQL 16 и pgAdmin (см. `docker-compose.dev.yml`):

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Контроль на GitHub:

- [.github/workflows/ci.yml](.github/workflows/ci.yml) — сборка, тесты, lint, проверка форматирования, аудит зависимостей и проверка health endpoints;
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
