# Аудит-отчёт проекта OpenRNA — 12 мая 2026

## 1. Что такое OpenRNA

OpenRNA — это **контрольная плоскость** (control plane) для управления
персонализированными мРНК-вакцинами против рака на основе неоантигенов.

Простыми словами: когда у пациента обнаруживают опухоль, из неё
секвенируют мутации, подбирают уникальные мишени (неоантигены),
проектируют индивидуальную РНК-конструкцию, проводят экспертный review,
одобряют производство и отслеживают клинические результаты. Каждый из
этих шагов порождает данные, решения и аудитные записи, которые должны
быть прослеживаемы, неизменяемы и юридически валидны.

OpenRNA **не предсказывает** неоантигены (это делают внешние инструменты —
pVACtools, Nextflow). OpenRNA **координирует** весь процесс вокруг них:
от забора образца до передачи на производство.

Клинические референсы: NCT05933577 (Merck/Moderna V940), NCT05968326
(BioNTech autogene cevumeran).

---

## 2. Архитектура

### 2.1. Технический стек

| Компонент | Технология |
|-----------|------------|
| Язык | TypeScript 6.0, strict mode |
| Рантайм | Node.js 24+ |
| Фреймворк | Express 5 |
| Валидация | Zod 4 |
| Персистенция | PostgreSQL (pg 8.20) / In-Memory fallback |
| Тестирование | Node.js native test runner (`node --test`) |
| CI | GitHub Actions (SHA-pinned actions) |
| Supply chain | CycloneDX SBOM, CodeQL, Dependency Review, Scorecards |
| Зависимости runtime | **3** (express, pg, zod) — минимальная поверхность атаки |

### 2.2. Hexagonal Architecture (Ports & Adapters)

Проект построен по **гексагональной архитектуре** — бизнес-логика
зависит только от абстрактных портов, а конкретные реализации
подключаются через `AppDependencies`.

**19 портов** (`src/ports/`):

| Порт | Назначение |
|------|-----------|
| `ICaseStore` | Основной агрегат: жизненный цикл кейса |
| `IStateMachineGuard` | Конечный автомат переходов (18 состояний) |
| `IEventStore` | Append-only журнал доменных событий |
| `IConsentTracker` | Журнал согласий (granted/withdrawn/renewed) |
| `IRbacProvider` | RBAC: 5 ролей × 7 действий + case-scoped доступ |
| `ICaseAccessStore` | Per-case ACL (owner, granted access) |
| `IWorkflowRunner` | Запуск/мониторинг пайплайнов |
| `IWorkflowOrchestrator` | Оркестрация dispatch/polling |
| `INextflowClient` | Low-level Nextflow CLI/Tower API |
| `IHlaConsensusProvider` | Multi-tool HLA consensus |
| `IQcGateEvaluator` | QC gate evaluation |
| `INeoantigenRankingEngine` | Ранжирование неоантигенов (внешний) |
| `IConstructDesigner` | Дизайн РНК-конструкции (линкеры, эпитопы) |
| `IModalityRegistry` | Реестр модальностей (mRNA/saRNA) |
| `IReferenceBundleRegistry` | Реестр reference bundles |
| `IOutcomeRegistry` | Outcome timeline |
| `IFhirExporter` | FHIR R4 Genomics Reporting export |
| `IAuditSignatureProvider` | Hash-chain + HMAC seal |
| `IWorkflowDispatchSink` | Persistence workflow dispatches |

**23 адаптера** (`src/adapters/`): 18 in-memory + 5 PostgreSQL-backed.

### 2.3. Конечный автомат жизненного цикла (18 состояний)

```
INTAKING → AWAITING_CONSENT → READY_FOR_WORKFLOW → WORKFLOW_REQUESTED
→ WORKFLOW_RUNNING → WORKFLOW_COMPLETED → QC_PASSED → HLA_REVIEW_REQUIRED
→ AWAITING_REVIEW → AWAITING_FINAL_RELEASE → APPROVED_FOR_HANDOFF
→ HANDOFF_PENDING (terminal)

Боковые ветки:
  WORKFLOW_FAILED/CANCELLED → READY_FOR_WORKFLOW (retry)
  QC_FAILED → READY_FOR_WORKFLOW (retry)
  REVISION_REQUESTED → READY_FOR_WORKFLOW (restart)
  REVIEW_REJECTED (terminal)
  CONSENT_WITHDRAWN (absorbing terminal — ICH E6(R2) §4.8.2)
```

Переходы жёстко зафиксированы в `InMemoryStateMachineGuard`, включая
consent-aware логику: из любого нетерминального состояния можно перейти
в `CONSENT_WITHDRAWN`, но обратно — нельзя.

---

## 3. Регуляторная зрелость

### 3.1. Что уже реализовано

| Требование | Стандарт | Реализация |
|------------|----------|------------|
| Append-only audit trail | 21 CFR Part 11 §11.10(e) | SHA-256 hash-chain (`record_hash`, `prev_hash`), verify endpoint |
| Electronic signatures | 21 CFR Part 11 §§11.50, 11.70 | JWT `sub` → identity-bound signer, HMAC-SHA256 server seal |
| Dual authorization | 21 CFR Part 11 §11.10(g) | Reviewer ≠ releaser enforcement |
| OIDC/JWKS | 21 CFR Part 11 §§11.100, 11.300 | RS256 key discovery без ручной ротации PEM |
| Consent governance | ICH E6(R2) §4.8.2 | `CONSENT_WITHDRAWN` absorbing state; mutations blocked |
| Input validation | FDA Data Integrity (ALCOA+) | Zod schemas at API boundary |
| RBAC deny-by-default | 21 CFR Part 11 §11.10(d) | 5 ролей, 7 действий, resource-scoped ACL |
| FHIR export | HL7 FHIR R4 Genomics Reporting | `IFhirExporter` port |
| Supply chain | NIST SSDF / SLSA | CycloneDX SBOM, SHA-pinned CI actions |

### 3.2. Что НЕ реализовано (честно заявлено)

- Full 21 CFR Part 11 validation — IQ/OQ/PQ документ написан как шаблон, исполнение pending
- Клиническое развёртывание — не заявлено
- Identity proofing на уровне площадки — требует IdP
- Back-fill hash-chain для legacy записей без хешей
- Multi-instance rate limiting (текущий — in-process token bucket)

---

## 4. Тестовое покрытие

| Метрика | Значение |
|---------|----------|
| Версия | v0.1.4 |
| Тестов | **546** (22 suite) |
| Падений | 0 |
| Line coverage | 94.49% |
| Branch coverage | 82.88% |
| Function coverage | 94.11% |

### Ключевые тестовые файлы

| Файл | Тестов (approx) | Покрытие |
|------|-----------------|----------|
| `phase2.test.ts` | ~150 | Core lifecycle, workflow, review, handoff |
| `outcomes.test.ts` | ~80 | Outcome timeline, traceability |
| `wave6-bundle-hla.test.ts` | ~60 | HLA consensus, disagreement thresholds |
| `wave7-orchestration.test.ts` | ~50 | Nextflow orchestration, polling |
| `compliance-controls.test.ts` | ~30 | Part 11 signatures, dual auth |
| `audit-chain.test.ts` | 19 | Hash-chain integrity |
| `signature-integrity.test.ts` | 15 | JWKS, HMAC seal, identity |
| `consent-gate.test.ts` | ~20 | Consent governance |
| `ranking.test.ts` | ~30 | Neoantigen ranking |

---

## 5. Сильные стороны

1. **Минимальный dependency footprint** — 3 runtime зависимости.
   Это исключительно редко для Node.js проекта и радикально снижает
   supply-chain risk. Нет Helmet (заменён ручными security headers),
   нет Redis (token bucket in-process), нет ORM (raw pg).

2. **Честная позиция по regulatory scope** — проект явно заявляет,
   что он *не* является клиническим продуктом, *не* заменяет
   биоинформатические пайплайны, *не* принимает автономных решений.
   Это правильная стратегия для pre-IND стадии.

3. **Hash-chain audit** — SHA-256 цепочка с `prev_hash` позволяет
   математически обнаружить вставку, удаление или подмену любой
   аудитной записи. Это выходит за минимальные требования 21 CFR Part 11.

4. **Consent-as-FSM-state** — `CONSENT_WITHDRAWN` как absorbing state
   гарантирует, что отзыв согласия блокирует *все* мутации на уровне
   модели данных, а не только на уровне middleware.

5. **Dual authorization** — reviewer и releaser должны быть разными
   лицами. Это стандартное требование GxP, и оно реализовано на уровне
   domain logic, а не просто UI.

6. **IQ/OQ/PQ validation package** — 16 URS entries, 12 IQ checklist
   items, 17 OQ test-suite mappings, 8 PQ scenarios. Даже в draft-форме
   это показывает зрелость мышления о validation lifecycle.

7. **FHIR R4 export seam** — готовая интеграционная точка для
   downstream систем (EHR, clinical trial management).

---

## 6. Найденные проблемы и рекомендации

### 6.1. Критические (блокеры для production)

| # | Проблема | Рекомендация |
|---|----------|--------------|
| 1 | **`store.ts` = 51 KB** — гигантский файл с inline бизнес-логикой. | Разбить на domain-модули: `CaseAggregate`, `WorkflowAggregate`, `ReviewAggregate`. Порт `ICaseStore` уже вынесен — это правильное направление. |
| 2 | **Нет миграционного тулинга** — 4 SQL-файла без runner. | Добавить migration runner (node-pg-migrate или ручной ordered-apply). Сейчас оператор должен вручную выполнять SQL. |
| 3 | **In-process rate limiter** не масштабируется на >1 инстанс. | Для multi-instance deployments нужен Redis или shared-state backend. Документировать ограничение. |

### 6.2. Важные (требуют внимания)

| # | Проблема | Рекомендация |
|---|----------|--------------|
| 4 | **Branch coverage 82.88%** — есть непокрытые ветки. | Идентифицировать error paths в PostgreSQL adapters и edge cases в consent logic. Цель: ≥90%. |
| 5 | **Corrupted files** в другой копии (`c:\plans\OpenRNA`) — `store.ts`, `validation.ts`, `store-review.ts`, `design.md`, `IWorkflowOrchestrator.ts` содержат null bytes. | Это копия повреждена (VS Code cache leakage). `portfolio-live` — чистая версия. Удалить повреждённую копию. |
| 6 | **Нет linting** в CI — ни ESLint, ни Biome. | Добавить `biome check` или `eslint` в CI pipeline. |
| 7 | **`validation.ts` = 31 KB** — также очень крупный файл. | Разделить по доменным группам: workflow validation, review validation, outcome validation. |
| 8 | **Нет OpenAPI/Swagger spec** — API документирован в Markdown. | Сгенерировать OpenAPI 3.1 из Zod schemas (zod-to-openapi). Это ускорит интеграцию и SDK-генерацию. |

### 6.3. Желательные (polish)

| # | Проблема | Рекомендация |
|---|----------|--------------|
| 9 | **Нет structured logging** — `process.stdout.write` / `process.stderr.write`. | Добавить JSON logging (pino) для production observability. |
| 10 | **Нет Prometheus metrics** — `/metrics` endpoint существует, но содержание не проверено. | Добавить request duration histogram, error rate counter, case count gauge. |
| 11 | **Нет integration tests с реальным PostgreSQL** — `pg-mem` используется как substitute. | `pg-mem` не покрывает все edge cases (transaction isolation, concurrent writes). Добавить CI job с Postgres service container. |
| 12 | **Нет Dockerfile** в публичной версии. | Добавить multi-stage Dockerfile для production deployment. |

---

## 7. Сравнение версий

| Параметр | `c:\plans\OpenRNA` (v0.1.0) | `portfolio-live\OpenRNA` (v0.1.4) |
|----------|------------------------------|-------------------------------------|
| Тестов | 504 | **546** |
| Портов | 18 | **19** (`ICaseStore` extracted) |
| Состояний FSM | 17 | **18** (`CONSENT_WITHDRAWN`) |
| Audit hash-chain | ❌ | ✅ SHA-256 + verify endpoint |
| Identity-bound signatures | ❌ | ✅ JWT sub + HMAC seal |
| OIDC JWKS | ❌ | ✅ |
| Resource-scoped RBAC | ❌ | ✅ `canAccessCase()` |
| IQ/OQ/PQ package | ❌ | ✅ Draft |
| SQL migrations | 3 | **4** (audit hardening) |

**Рекомендация**: работать только с `portfolio-live` версией; копия в
`c:\plans\OpenRNA` устарела и частично повреждена.

---

## 8. Рекомендуемый план дальнейших действий

### Фаза 1 — Структурная гигиена (1–3 дня)

- Разбить `store.ts` на 3–4 domain-модуля
- Разбить `validation.ts` на domain-группы
- Добавить linting (Biome или ESLint) в CI
- Добавить migration runner

### Фаза 2 — Production readiness (1–2 недели)

- Structured JSON logging (pino)
- Prometheus metrics на `/metrics`
- Dockerfile + docker-compose
- OpenAPI 3.1 spec generation
- CI job с реальным PostgreSQL

### Фаза 3 — Regulatory closure (2–4 недели)

- Исполнение IQ/OQ/PQ на target environment
- Back-fill hash-chain для legacy audit records
- Branch coverage → 90%+
- External penetration test
- Independent security review

---

## 9. Итоговая оценка

OpenRNA — это **архитектурно зрелый, тщательно продуманный проект**
с редкой для стартапа дисциплиной в области регуляторной готовности.

**Ключевые достоинства**:
- 3 runtime dependency — минимальная поверхность атаки
- 546 тестов, 94.5% line coverage — высокая уверенность в корректности
- Hash-chain audit + identity-bound signatures — превышает базовые
  требования Part 11
- Честная позиция: проект знает, чем он *не* является

**Ключевые риски**:
- `store.ts` (51 KB) — архитектурный долг, усложняющий review и
  onboarding
- Нет реального PostgreSQL в CI — `pg-mem` может маскировать баги
- IQ/OQ/PQ execution pending — шаблон есть, но исполнение не начато

**Общая оценка**: проект находится в состоянии **engineering-ready
prototype**, готового к technical due diligence и инвесторскому
review. До clinical deployment остаётся работа по validation execution
и infrastructure hardening, но архитектурный фундамент для этого
уже заложен корректно.
