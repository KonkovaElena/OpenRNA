# OpenRNA

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Русский · [English](README.md)

OpenRNA — это операционный контур управления для персонализированных РНК-вакцин по неоантигенам.

Проект не заявляет замену вычислительных движков, клинических систем принятия решений или завершенных процедур квалификации. Его задача — дать воспроизводимый и аудируемый слой координации между происхождением образцов, запуском workflow, экспертным разбором, релиз-авторизацией и учетом исходов.

## Доказательный срез (2026-04-20)

- Полный локальный контур (`npm run ci`) пройден: 494 теста, 22 набора, 0 падений.
- Контур покрытия (`npm run test:coverage`) пройден: 94.43% покрытия строк, 82.91% ветвей, 94.03% функций.
- Security gate (`npm audit --omit=dev --audit-level=high`) вернул 0 уязвимостей.
- CycloneDX runtime SBOM пересобран через `npm run sbom:cyclonedx:file`.
- Модель жизненного цикла кейса содержит 16 явных состояний.
- Контур релиз-авторизации включает board review, независимый QA release и manufacturing handoff.
- Для критических действий поддерживаются step-up подписи (`totp`, `webauthn`) при approved review и QA release.
- Целостность аудита усилена хеш-цепочкой (`previousEventHash`, `eventHash`) с сохранением в durable storage.
- В пакет валидационной документации добавлены Intended Use, IQ/OQ/PQ план и URS traceability matrix.
- В активный контур governance добавлены политика PHI minimization/crypto-shredding и versioned FHIR capability baseline.

Формальный базовый реестр: [docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-20.md](docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-20.md).

## Зачем нужен этот слой

В персонализированных онкологических РНК-программах узкое место обычно не в одном предсказателе. Узкое место — операционная связность на уровне кейса:

- состояние согласия и контур доступа
- происхождение образцов и артефактов
- фиксация версий референсных наборов
- воспроизводимый запуск и завершение workflow
- экспертный разбор и релиз-контроль
- передача в производство
- продольная трассируемость исходов

OpenRNA решает именно эту координационную задачу.

Клинические якоря, используемые в проекте: NCT05933577 и NCT05968326. Подробные заметки собраны в [docs/archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md](docs/archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md).

## Реализованный функциональный контур

- Управление жизненным циклом кейса с явной моделью переходов.
- Регистрация provenance для образцов и исходных артефактов.
- Оркестрация запросов и прогонов workflow с поддержкой идемпотентности (`x-idempotency-key`).
- Интеграция HLA consensus и сохранение QC gate.
- Сохранение neoantigen ranking и construct design через явные порты.
- Формирование board packet и запись review outcome.
- Независимый маршрут QA release с проверкой maker-checker.
- Формирование manufacturing handoff только при approved review и связанном QA release.
- Ведение outcome timeline (введение, иммуномониторинг, клиническое наблюдение).
- Сквозная traceability-проекция по review, release, handoff и outcomes.

## Контроли безопасности, авторизации и соответствия

| Контроль | Направление реализации |
|---|---|
| Аутентификация | API key или JWT с разрешением principal-контекста запроса |
| Авторизация | RBAC-защита маршрутов с deny-by-default |
| Consent interlock | Case-scoped write-маршруты защищены consent-gate |
| Step-up подписи | Обязательны для approved review outcome и QA release |
| Maker-checker разделение | QA reviewer должен отличаться от board reviewer |
| Dual-authorization handoff guard | Идентичность handoff requestor проверяется относительно reviewer |
| Целостность аудита | Хеш-цепочка audit events с детерминированной связностью |

Границы текущей реализации и non-claims: [docs/REGULATORY_CONTEXT.md](docs/REGULATORY_CONTEXT.md).

## Кратко об архитектуре

- Бизнес-логика построена вокруг явных портов в [src/ports](src/ports).
- Адаптеры подключаются через dependency injection (`AppDependencies`).
- In-memory режим поддерживается для локального и CI-контуров.
- PostgreSQL режим поддерживается для durable persistence и reload-проверок.
- Входные контракты валидируются на API-границе через Zod.
- Переходы статусов контролируются `IStateMachineGuard`.

Архитектурный источник истины: [docs/design.md](docs/design.md).

## Явные ограничения

OpenRNA не является:

- заменой внешних workflow-движков (например, экосистемы Nextflow)
- самостоятельным предсказателем неоантигенов
- клинической системой поддержки принятия решений
- заявлением о завершенной квалификации 21 CFR Part 11

## Быстрый старт

```bash
npm ci
npm run build
npm test
npm run test:coverage
npm run sbom:cyclonedx:file
npm run dev
```

Интегральный контур проверки:

```bash
npm run ci
```

## Ключевые переменные окружения

Источник конфигурации: [src/config.ts](src/config.ts).

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `4010` | Порт HTTP-сервера |
| `CASE_STORE_DATABASE_URL` | unset | PostgreSQL для кейсов; пусто означает in-memory |
| `WORKFLOW_DISPATCH_DATABASE_URL` | unset | PostgreSQL для dispatch; пусто означает in-memory |
| `API_KEY` | unset | Аутентификация по API-ключу (`x-api-key`) |
| `API_KEY_PRINCIPAL_ID` | unset | Опциональный стабильный principal identifier для API-key auth |
| `REQUIRE_AUTH` | `false` | При `true` запуск завершится ошибкой, если не настроены API key или JWT |
| `JWT_SHARED_SECRET` / `JWT_PUBLIC_KEY_PEM` | unset | Конфигурация валидации JWT |
| `RBAC_ALLOW_ALL` | `false` | Аварийный permissive-режим; несовместим с `REQUIRE_AUTH=true` |

## Профили безопасного запуска

- Локальный профиль разработки (open): оставьте `REQUIRE_AUTH=false` и запускайте без auth-учетных данных.
- Production-профиль (strict): установите `REQUIRE_AUTH=true` и настройте минимум один метод аутентификации (`API_KEY` или JWT).

Рекомендуемый strict-базис:

```bash
REQUIRE_AUTH=true
API_KEY=<strong-random-secret>
RBAC_ALLOW_ALL=false
```

JWT strict-базис (альтернатива):

```bash
REQUIRE_AUTH=true
JWT_SHARED_SECRET=<32+ bytes>
RBAC_ALLOW_ALL=false
```

Если `REQUIRE_AUTH=true`, но auth-метод не настроен, приложение завершит запуск с ошибкой (fail-fast).
Если `REQUIRE_AUTH=true` и `RBAC_ALLOW_ALL=true`, запуск также завершится fail-fast-ошибкой.

## Карта документации

| Документ | Роль |
|---|---|
| [docs/PUBLIC_ARCHITECTURE_INDEX.md](docs/PUBLIC_ARCHITECTURE_INDEX.md) | Главный роутер по активной документации |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | HTTP-контракт и группы маршрутов |
| [docs/OPERATIONS_AND_FAILURE_MODES.md](docs/OPERATIONS_AND_FAILURE_MODES.md) | Runtime-модель и классы отказов |
| [docs/CONSENT_ACCESS_POLICY_2026.md](docs/CONSENT_ACCESS_POLICY_2026.md) | Матрица consent-gating политики |
| [docs/INTENDED_USE_STATEMENT_2026.md](docs/INTENDED_USE_STATEMENT_2026.md) | Intended-use и границы применения |
| [docs/security/PHI_MINIMIZATION_AND_CRYPTO_SHREDDING_2026.md](docs/security/PHI_MINIMIZATION_AND_CRYPTO_SHREDDING_2026.md) | Базовая политика PHI minimization и crypto-shredding |
| [docs/fhir/FHIR_CONFORMANCE_BASELINE_2026.md](docs/fhir/FHIR_CONFORMANCE_BASELINE_2026.md) | Граница FHIR R4 conformance и capability baseline |
| [docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md](docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md) | Каркас квалификационного плана |
| [docs/validation/URS_TRACEABILITY_MATRIX_2026.md](docs/validation/URS_TRACEABILITY_MATRIX_2026.md) | Трассируемость требований к доказательствам |
| [docs/RUSSIAN_OMS_POLICY_SIGNAL_2026-04.md](docs/RUSSIAN_OMS_POLICY_SIGNAL_2026-04.md) | Аналитическая записка по payer-policy (апрель 2026) |
| [docs/archive](docs/archive) | Архив аудитов, публикационных пакетов и исторической доказательной базы |

## Вклад и governance

- Правила вкладов: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
- Политика безопасности: [docs/SECURITY.md](docs/SECURITY.md)
- Каналы поддержки: [docs/SUPPORT.md](docs/SUPPORT.md)
- Кодекс поведения: [docs/CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md)

## Лицензия

Apache-2.0. См. [LICENSE](LICENSE).