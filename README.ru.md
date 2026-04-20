# OpenRNA

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Русский · [English](README.md)

**Контур управления для персонализированных РНК-вакцин по неоантигенам.**

Перепроверено 2026-04-17: 461 тест (22 набора), 94.92% покрытия по строкам (83.30% по ветвлениям, 94.33% по функциям), 17 порт-интерфейсов, `npm audit` по зависимостям рантайма чистый.
Формальный базовый снимок (2026-04-05): [`docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md`](docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md).

## Что это

Этот репозиторий — фрагмент контура управления для фаз 1–2 процесса персонализированной РНК-вакцины по неоантигенам:
ввод клинического случая → оркестрация молекулярного профилирования → ранжирование неоантигенов → дизайн конструкта → экспертный разбор → передача в производство → фиксация исходов.

Клинические программы в этой области (например, Moderna/Merck V940 / INTerpath-001, NCT05933577 и BioNTech autogene cevumeran / IMCODE003, NCT05968326) хорошо иллюстрируют, где именно возникает «операционная сложность на пациента»: согласия, происхождение образцов, версии референсных бандлов, пакеты для комиссии, трассируемость передачи и привязка исходов.
Первичные якоря и ссылки собраны в [`docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md`](docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md) и в разделе внешних якорей в [`docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md`](docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md).

**Чем это не является:** это не био-информатический пайплайн, не дизайнер РНК-последовательностей и не клиническая система принятия решений. Все вычислительные/предиктивные компоненты остаются внешними и подключаются через порт-интерфейсы.

Полная архитектура и модель доказательности — в [`design.md`](design.md).

## С чего начать

- [`docs/PUBLIC_ARCHITECTURE_INDEX.md`](docs/PUBLIC_ARCHITECTURE_INDEX.md) — роутер по активным документам и слою доказательности.
- [`design.md`](design.md) — основной архитектурный документ + модель доказательности (T1–T4).
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) — публичная HTTP-поверхность, заголовки, конвенции ответов.
- [`docs/OPERATIONS_AND_FAILURE_MODES.md`](docs/OPERATIONS_AND_FAILURE_MODES.md) — режимы запуска, пробы, метрики, типовые классы отказов.
- [`docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md`](docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md) — границы публичной публикации и текущий статус технической проверки.
- [`docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md`](docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md) — формальный базовый снимок по метрикам верификации и внешним якорям.

## Что реализовано

- Реестр клинических случаев с 15-состояниями жизненного цикла (`INTAKING` → `HANDOFF_PENDING`)
- Происхождение образцов и артефактов (ДНК/РНК опухоли, ДНК нормы, производные артефакты)
- Оркестрация вычислительных пайплайнов (workflow) с идемпотентной подачей (`x-idempotency-key`)
- Порт интеграции с Nextflow для запуска внешних пайплайнов
- Супервизор периодического опроса для мониторинга выполнения пайплайнов
- Реестр референсных наборов, привязанных к запускам
- Консенсус HLA на нескольких инструментах с настраиваемыми порогами расхождения
- Проверка QC-гейтов по завершённым прогонам
- Порт хранения результатов ранжирования неоантигенов
- Дизайн конструкта по модальностям (mRNA, saRNA, circRNA) + модальность как объект управления
- Генерация пакетов для экспертного разбора / консилиума
- Генерация пакета передачи в производство из утверждённого решения комиссии
- Таймлайн исходов (введение, иммуномониторинг, клиническое наблюдение)
- Полная трассируемость через машинно-читаемые события аудита
- Хуки аутентификации и авторизации (опционально: API-ключ или JWT bearer; проверки RBAC; middleware проверки согласия)
- Операционные маршруты: `/healthz`, `/readyz`, `/metrics`, `/api/operations/summary`

## Чего здесь сознательно нет

- Предсказание неоантигенов (делегируется внешним инструментам через `INeoantigenRankingEngine`)
- Алгоритмы агрегации рангов
- Координация outbox между разными ресурсами как транзакционный слой

## Архитектура

- **17 порт-интерфейсов** для всех внешних зависимостей
- **Две стратегии адаптеров**: в памяти (по умолчанию) + PostgreSQL для устойчивого хранения
- **Внедрение зависимостей** через фабрику `AppDependencies` — без жёсткой связки с реализациями
- **Zod-валидация** входов API в рантайме
- **Единый контракт ошибок** (`ApiError` с операторскими кодами и маппингом на HTTP)

Список портов и схема слоёв — в [`design.md`](design.md).

## Технологический стек

| Компонент | Версия | Примечание |
|-----------|--------|------------|
| Node.js | 24.x Active LTS | Базовая версия для публичного репозитория |
| TypeScript | 6.0.2 | Strict mode, `module: "nodenext"`, рантайм CommonJS через `package.json` |
| Express | 5.x | Нативная async-обработка ошибок |
| Zod | 4.x | Валидация в рантайме |
| pg | 8.x | Клиент PostgreSQL |
| node:test | built-in | Тестовый раннер (без Jest/Vitest) |

## Переменные окружения

Источник истины: [`src/config.ts`](src/config.ts) (Zod-валидация; ошибка конфигурации = остановка на старте).

| Переменная | Значение по умолчанию | Назначение |
|----------|---------|---------|
| `PORT` | `4010` | Порт HTTP-сервера |
| `CASE_STORE_DATABASE_URL` | unset | PostgreSQL для устойчивого хранения кейсов. Пусто → хранение в памяти |
| `CASE_STORE_TABLE_NAME` | `case_records` | Имя таблицы для кейсов |
| `WORKFLOW_DISPATCH_DATABASE_URL` | unset | PostgreSQL для фиксации отправок workflow. Пусто → хранение в памяти |
| `WORKFLOW_DISPATCH_TABLE_NAME` | `workflow_dispatches` | Имя таблицы отправок |
| `API_KEY` | unset | Аутентификация по API-ключу через `x-api-key` (сравнение в константное время) |
| `API_KEY_PRINCIPAL_ID` | `api-key-client` | Идентификатор субъекта (principal) для API-ключа (опциональная замена) |
| `RBAC_ALLOW_ALL` | `false` | Если `true`, RBAC всегда разрешает (локальная разработка / совместимость) |
| `JWT_SHARED_SECRET` | unset | JWT bearer (HS256). Минимум 32 байта |
| `JWT_PUBLIC_KEY_PEM` | unset | JWT bearer (RS256) по PEM-публичному ключу |
| `JWT_EXPECTED_ISSUER` | unset | Опциональная проверка `iss` |
| `JWT_EXPECTED_AUDIENCE` | unset | Опциональная проверка `aud` |
| `JWT_PRINCIPAL_CLAIM` | `sub` | Имя claim (поле токена) для идентификатора субъекта |
| `JWT_ROLE_CLAIM` | `roles` | Имя claim (поле токена) для ролей |

## Быстрый старт

```bash
npm ci
npm run build
npm test
npm run test:coverage
npm run sbom:cyclonedx:file
npm run dev
```

Одна команда для верификации (сборка + тесты + аудит зависимостей рантайма): `npm run ci`.

Оставьте URL БД пустыми для режима «в памяти». Укажите `CASE_STORE_DATABASE_URL` и/или `WORKFLOW_DISPATCH_DATABASE_URL`, если нужен PostgreSQL.

## Публичные поверхности репозитория

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — порядок изменений и проверочные дорожки
- [`SECURITY.md`](SECURITY.md) — политика безопасности и приватное сообщение об уязвимостях
- [`SUPPORT.md`](SUPPORT.md) — поддержка и то, что не входит в область ответственности
- [`RELEASE.md`](RELEASE.md) — контракт релиза и проверка артефактов
- [`CHANGELOG.md`](CHANGELOG.md) — изменения, важные для потребителей и технической проверки
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — нормы участия
- [`CITATION.cff`](CITATION.cff) — метаданные для цитирования
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — сборка, тесты, покрытие, `npm audit`, smoke-check `/healthz` (Node 24)
- [`.github/workflows/node-ci.yml`](.github/workflows/node-ci.yml) — минимальный конвейер сборки и тестов (Node 24)
- [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) — GitHub CodeQL (SAST)
- [`.github/workflows/dependency-review.yml`](.github/workflows/dependency-review.yml) — проверка рисков зависимостей в pull request
- [`.github/workflows/supply-chain-provenance.yml`](.github/workflows/supply-chain-provenance.yml) — CycloneDX SBOM, контрольные суммы и аттестации для semver-тегов

## Документация

| Документ | Назначение |
|----------|---------|
| [`docs/PUBLIC_ARCHITECTURE_INDEX.md`](docs/PUBLIC_ARCHITECTURE_INDEX.md) | Роутер по активным документам, пакетам доказательности и историческим аудитам |
| [`design.md`](design.md) | Архитектура OpenRNA + модель доказательности (4 уровня) |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) | Карта HTTP-роутов, auth-заголовки, конвенции ответов |
| [`docs/OPERATIONS_AND_FAILURE_MODES.md`](docs/OPERATIONS_AND_FAILURE_MODES.md) | Режимы запуска, пробы, метрики и классы отказов |
| [`docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md`](docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md) | Перепроверенные метрики, инструментальный стек и внешние якоря |
| [`docs/REGULATORY_CONTEXT.md`](docs/REGULATORY_CONTEXT.md) | FDA/EMA/Part 11/GMP: рамка и gap analysis |
| [`docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md`](docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md) | Клиническая база, конкуренты, каталог инструментов |
| [`docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md`](docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md) | Базовые решения по зависимости/версии/инструментальному стеку |
| [`docs/GITHUB_MAINTAINER_BASELINE_2026-04.md`](docs/GITHUB_MAINTAINER_BASELINE_2026-04.md) | Базовая конфигурация GitHub (branch protection/security) |
| [`docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md`](docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md) | Граница публичной публикации и готовность к технической проверке |
| [`docs/INVESTOR_ONE_PAGER_2026-04.md`](docs/INVESTOR_ONE_PAGER_2026-04.md) | Короткое техническое резюме для инвестора |
| [`docs/reports/OPENRNA_HYPER_AUDIT_2026.md`](docs/reports/OPENRNA_HYPER_AUDIT_2026.md) | Глубокий аудит архитектуры и безопасности |
| [`docs/reports/OPENRNA_HARDENING_ROADMAP_2026.md`](docs/reports/OPENRNA_HARDENING_ROADMAP_2026.md) | Последовательная программа укрепления (hardening) |
| [`docs/reports/OPENRNA_IDENTITY_AND_CANONICALIZATION_AUDIT_2026-04-05.md`](docs/reports/OPENRNA_IDENTITY_AND_CANONICALIZATION_AUDIT_2026-04-05.md) | Аудит именования и границы публичной публикации |

## Исторические артефакты доказательности

Эти файлы сохранены для технической проверки и «археологии», но они не являются текущей точкой входа:

- [`ISOLATION_CERTIFICATION_2026-03-30.md`](ISOLATION_CERTIFICATION_2026-03-30.md)
- [`DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md`](DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md)
- [`DOCUMENTATION_RECONCILIATION_AUDIT_2026-04-02.md`](DOCUMENTATION_RECONCILIATION_AUDIT_2026-04-02.md)

## API

Полная карта и конвенции ошибок — в [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md).
На верхнем уровне публичная поверхность делится на:

- кейсы и происхождение артефактов
- исполнение пайплайнов и QC
- ранжирование и дизайн конструкта
- экспертный разбор, передача в производство и исходы
- регламенты, согласия, аудит и экспорт FHIR
- модальности, сводка операций и системные пробы
