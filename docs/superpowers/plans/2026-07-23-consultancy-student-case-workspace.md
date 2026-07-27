# Consultancy Student Case Workspace Plan

**Date:** 2026-07-23  
**Status:** Product and technical planning  
**Working name:** MeroVisa Consultancy Workspace

**Revised:** 2026-07-25 — incorporated review findings: enforcement boundary, known schema obstacles, lawful basis and privacy gating, thesis alignment, pilot signals and kill criteria, new decisions 13–15.

## Executive summary

MeroVisa can credibly expand from a student-facing product into a SaaS workspace for education consultancies. The strongest version of the idea is not a generic CRM. It is a **student case workspace** that helps a consultancy see each student’s readiness, assessment, matches, plan, documents, owner, and next action in one place.

The existing product already contains much of the useful student journey: profile, assessment, program matching, planning, application evidence, and document storage. The new work is primarily a platform change around that experience:

- introduce consultancy organizations, team memberships, roles, and case assignments;
- separate the authenticated person performing an action from the student whose case is being managed;
- move existing student-owned data to case-scoped data;
- add secure collaboration around documents;
- allow a student case to exist before the student creates an account;
- add auditable invitations, access history, export, archive, and deletion.

### Feasibility verdict

**Proceed, subject to a controlled pilot and a tenancy-security gate.**

Product fit is high and the current Next.js, Supabase, and Vercel stack is suitable. The application does not need a separate backend or a second product. The main technical risk is authorization: today, MeroVisa generally assumes that the signed-in user is also the student and the data owner. A consultancy workspace requires explicit organization and case authorization on every read, mutation, document download, export, and administrative operation.

This is feasible as an additive platform refactor. It should not be treated as a set of dashboard screens placed on top of the current owner-based model.

## Product position

### Core promise

> See every student, what they are missing, who is responsible, and what needs to happen next.

### Why MeroVisa can be differentiated

Consultancies already have access to generic CRMs, spreadsheets, cloud drives, and messaging tools. MeroVisa should win by connecting operational case management to the actual student journey:

- structured student profile and readiness;
- sourced assessment and risk indicators;
- relevant program matches;
- a practical plan and next actions;
- document requests, versions, and review;
- a shared view for counsellor and student.

The consultancy workspace should deepen the existing MeroVisa experience rather than becoming an unrelated sales CRM.

### Alignment with the founding thesis

MeroVisa began as a student-protection product: help students understand their real chances before engaging consultancies. Selling a workspace to consultancies is coherent only if the product preserves that promise rather than trading it away. The workspace therefore commits to three principles:

- the student sees the same readiness, assessment, and match information the counsellor sees; the workspace must never become a tool for information asymmetry;
- consultancies win on operational excellence — faster document turnaround, clearer next actions, honest readiness conversations — not on hiding or reframing the student’s data;
- consultancy-only content is limited to internal operational notes, and its visibility classification exists to protect frank internal coordination, not to conceal assessment substance from the student.

These commitments belong in the consultancy agreement and in student-facing notice text, because they are the reason a trust-first student brand can credibly operate a consultancy product.

### Initial customer and operating scope

The first controlled pilot should focus on:

- Nepal-to-Australia education cases;
- adult students;
- one consultancy responsible for each consultancy case;
- manually onboarded consultancy organizations;
- a limited set of real student cases;
- owner, admin, and counsellor roles;
- document review performed by counsellors initially.

## Users and responsibilities

### Consultancy owner

- manages the organization and team;
- can access all organization cases;
- can export, archive, and delete cases;
- controls organization-level settings.

### Consultancy admin

- manages team access;
- can access and manage all organization cases;
- oversees assignments and case operations.

### Counsellor

- accesses assigned cases by default;
- manages the student profile, assessment, matches, plan, and documents;
- requests documents and records review decisions;
- invites the student to collaborate.

### Student

- accesses only the case linked to their account;
- views permitted case information;
- updates permitted profile fields;
- uploads documents and responds to requests;
- cannot see consultancy-only notes, audit data, or other students.

The database membership and assignment records must be the authorization source of truth. Roles must never be trusted from browser state or authentication metadata alone.

## MVP

The consultancy MVP contains:

1. **Consultancy organization and team accounts**
   - create and configure an organization;
   - invite team members;
   - assign owner, admin, or counsellor access;
   - deactivate access immediately when a staff member leaves.

2. **Student list**
   - search by student name or email;
   - filter by operational status and assigned counsellor;
   - show current owner, pending document work, and next action.

3. **Student case creation without registration**
   - allow staff to create a case using the minimum required student details;
   - do not create a placeholder authentication account;
   - link an authentication account only when the student accepts an invitation.

4. **Counsellor assignment**
   - assign or reassign a primary counsellor;
   - retain assignment changes in case activity and the security audit.

5. **Case-aware MeroVisa experience**
   - open the existing profile, assessment, matches, plan, and documents in the selected case context;
   - show the student name and case context persistently;
   - place the case identifier explicitly in the URL;
   - avoid a global “impersonating student” state.

6. **Document collaboration**
   - request a document;
   - upload one or more versions;
   - review the latest version;
   - approve it or request changes with a note;
   - retain who uploaded and reviewed each version.

7. **Student invitation**
   - invite the student to claim and enter their case;
   - support both existing and new MeroVisa users;
   - prevent duplicate student accounts and duplicate claims.

8. **Activity and audit history**
   - show useful case activity to authorized collaborators;
   - retain a separate append-only security audit for access-sensitive actions.

9. **Export, archive, and delete**
   - export the student case and its documents;
   - archive a closed case without deleting it;
   - delete a consultancy case without automatically deleting the student’s authentication account or unrelated data.

### Pilot case statuses

- New
- In progress
- Waiting on student
- Ready for review
- Closed

These are operational statuses. University application stages should remain a separate concept.

## Explicitly outside the MVP

- commission and agent accounting;
- subscription billing automation;
- integrated email, SMS, WhatsApp, or social inbox;
- marketing automation and lead pipelines;
- university or government system integrations;
- full white-label mobile applications;
- a general-purpose CRM;
- multi-consultancy sharing of the same case;
- automated migration between consultancies;
- AI document decisions, OCR automation, or autonomous recommendations.

These capabilities can be reconsidered after the pilot establishes that consultancies consistently use the case workspace.

## Core domain model

### The case becomes the unit of the MeroVisa experience

A `case` represents one student journey. It can be:

- a **personal case**, owned and used directly by a student; or
- a **consultancy case**, managed inside an organization and optionally linked to a student account.

This separates:

- **actor** — the authenticated person performing an action; and
- **subject** — the student case being viewed or changed.

The distinction must be present in the database, server data-access layer, URLs, audit events, and tests.

### Proposed routes

```text
/workspace
/workspace/[orgSlug]/students
/workspace/[orgSlug]/students/[caseId]
/workspace/[orgSlug]/students/[caseId]/profile
/workspace/[orgSlug]/students/[caseId]/assessment
/workspace/[orgSlug]/students/[caseId]/matches
/workspace/[orgSlug]/students/[caseId]/plan
/workspace/[orgSlug]/students/[caseId]/documents
/workspace/[orgSlug]/students/[caseId]/activity
/workspace/[orgSlug]/team
/invite/[token]
```

The existing student routes can remain. They should resolve the student’s personal or linked case and render the same case-aware product components.

### New core tables

#### `organizations`

- `id`
- `name`
- `slug`
- `status`
- `created_by`
- timestamps

#### `organization_memberships`

- `organization_id`
- `user_id`
- `role`
- `status`
- timestamps

#### `cases`

- `id`
- `organization_id`, nullable for a personal case
- `student_user_id`, nullable until claimed
- `display_name`
- `email`
- `operational_status`
- `created_by`
- `archived_at`
- timestamps

#### `case_assignments`

- `case_id`
- `user_id`
- `assignment_role`
- timestamps

#### `invitations`

- `organization_id`
- `case_id`, when inviting a student
- `email`
- `role`
- `token_hash`
- `expires_at`
- `accepted_at`
- `revoked_at`
- `invited_by`
- timestamps

#### `audit_events`

- `organization_id`
- `case_id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- safe metadata
- `created_at`

Sensitive document content, passport numbers, and raw student details must not be copied into audit metadata.

## Moving existing data to cases

The current application largely keys student data by `owner`, which references an Auth user. Consultancy-created students may not have Auth users, so case-scoped ownership is required.

The following domains should move to `case_id`:

- profiles;
- assessments;
- plan items;
- saved or tracked programs;
- program predictions;
- application attempts;
- outcome events;
- document status, requests, records, and versions.

Representative uniqueness rules change from:

```text
profile per owner                -> profile per case
primary assessment per owner     -> primary assessment per case
open plan item per owner/kind     -> open plan item per case/kind
program state per owner/program   -> program state per case/program
document per owner/kind           -> document and version rules per case
```

### Additive migration sequence

1. Create organization, membership, case, assignment, invitation, and audit tables.
2. Decide whether every existing Auth user receives a personal case during migration or on first use.
3. Create a personal case for each existing data owner.
4. Add nullable `case_id` columns to existing student-owned tables.
5. Backfill `case_id` using the current `owner` relationship, routing tables with immutability triggers through an approved path rather than a plain update.
6. Keep anonymous assessments case-less until they are claimed or removed under the purge policy.
7. Add case indexes and consistency constraints.
8. Relax `owner` to nullable on the tables that must hold consultancy-created rows, before the consultancy workspace writes real data.
9. Temporarily write both the legacy owner field and `case_id` for rows that have an owning Auth user; consultancy-created rows carry `case_id` only.
10. Move server repositories and routes to case authorization and `case_id`.
11. Enable and verify case-aware Row Level Security policies.
12. Make `case_id` mandatory where the domain requires it.
13. Remove legacy owner assumptions after regression and migration verification.

The migration should preserve current Storage objects initially. Existing object paths can remain valid while database rows gain a `case_id`. New uploads should use the case-aware path convention. Moving old objects can be a separate, verified operation if it later provides material value.

### Known schema obstacles

The additive sequence must be planned against the real schema, which imposes several changes that go beyond simple column additions. Before the case-aware core work begins, expand this section into a per-table migration matrix that addresses at least the following:

- **`owner` is `NOT NULL` on eight tables** (profiles, plan items, user-program state, documents, document status, program predictions, application attempts, and outcome events). A consultancy case has no Auth user, so dual-writing `owner` is impossible for consultancy-created data, and no row can exist for such cases while the constraint stands. Relaxing `owner` to nullable is therefore a prerequisite for the consultancy workspace stage, which is why step 8 of the sequence places it before any consultancy data is written.
- **`program_predictions` rejects updates through an immutability trigger.** A plain `UPDATE … SET case_id` backfill will fail. The migration must either adjust the trigger to permit the `case_id`-only backfill or route the backfill through an approved path, and the chosen approach must be rehearsed on a copy of live data.
- **The predictions → attempts → outcomes chain enforces ownership through composite foreign keys** built on `unique (id, owner)` targets. Re-basing on the case requires new `unique (id, case_id)` targets and re-pointed child keys — a coordinated multi-table constraint swap. While `case_id` is nullable, a composite key that includes it is unenforced for null rows, so the nullable window must be kept short for these three tables and covered by a compensating check until `case_id` becomes mandatory.
- **The document model change is a replacement, not a column add.** Existing document rows — one row per owner and kind with inline file metadata — must be explicitly migrated into the header-plus-versions shape, document status must be mapped into request or review state, and the plan must state whether the old tables are dual-read, renamed, or dropped, and when.
- **Existing `storage.objects` policies encode the one-folder-per-user model.** They must be retired or re-scoped once case-aware paths and metadata-based authorization are in place, so that two authorization conventions never coexist silently in one bucket.
- **The anonymous-claim flow is the hardest dual-write site.** Claiming an assessment currently bootstraps ownership; during the transition it must correctly create or resolve a personal case, set both `owner` and `case_id`, and respect the primary-assessment uniqueness rules. It needs dedicated tests in every migration stage.

## Authorization and tenant isolation

This is the most important implementation area.

### Enforcement boundary

Row Level Security, evaluated as the authenticated user, is the load-bearing tenant-isolation layer. The server-only data-access layer expresses permission semantics and provides defense in depth, but a bug in it must not be sufficient to cross a tenant boundary.

This inverts the current codebase default, where the most sensitive reads and writes go through the service-role client and rely on hand-written owner checks. During the tenancy work:

- the authenticated user client becomes the default for every tenant read and write;
- the service-role client is reduced to a short, enumerated exception list — for example invitation acceptance, account linking, storage administration, and deletion jobs — where every entry is named, justified, preceded by an explicit case authorization check, and audited;
- new consultancy features must not add service-role paths outside that list.

RLS policies should not embed recursive membership subqueries directly. Use a small set of `SECURITY DEFINER`, `STABLE` helper functions with a pinned `search_path` — for example `is_org_member(org_id)` and `can_access_case(case_id)` — so policies stay non-recursive, plan efficiently, and can be tested in isolation. The columns those helpers read must be indexed.

### Authorization rules

- organization owners and admins can access all cases in their organization;
- counsellors can access assigned cases by default;
- students can access only cases linked to their Auth user;
- inactive memberships have no access;
- every organization and case resource is re-authorized on the server;
- knowing a case ID or Storage path grants no access;
- the service-role key never reaches the browser;
- service-role operations require a completed case authorization check first.

### Enforcement layers

The layers below are listed in the order a request meets them, not by primacy; the enforcement boundary above defines which one is load-bearing.

1. **Server-only data-access layer**
   - centralize case context and permissions;
   - use functions such as `getCaseContext(actorUserId, caseId)` and `requireCasePermission(actorUserId, caseId, permission)`;
   - verify access inside every Server Component, Route Handler, Server Action, and mutation;
   - do not treat routing middleware as the authorization boundary.

2. **Supabase Row Level Security**
   - enable and force RLS on all exposed tenant tables;
   - scope policies to authenticated users and add actual membership, assignment, or student predicates;
   - provide both `USING` and `WITH CHECK` conditions for updates;
   - explicitly review table and function grants;
   - use security-invoker views when views are exposed;
   - index membership, assignment, organization, case, and student-link columns used by policies.

3. **Storage authorization**
   - keep the bucket private;
   - authorize against case and document metadata before issuing a short-lived signed URL;
   - pin the signed-URL lifetime — on the order of one minute for inline viewing and no more than a few minutes for downloads — and treat the TTL as a reviewed security parameter;
   - treat a minted signed URL as a bearer credential: revoking access stops new URLs from being minted, but an already-issued URL remains valid until it expires, so “immediate revocation” is a statement about minting and the TTL bounds the residual exposure;
   - never infer complete authorization from a path prefix;
   - record sensitive document view and download events at mint time.

### Caching rules

Personalized case data must not be placed in a shared application cache. Concretely, for the Next.js application:

- every organization- and case-scoped route renders dynamically; full route caching and static generation are prohibited on these paths;
- any deliberate cache entry containing tenant data must include both the actor and the case in its key; a cache key that omits either is a defect;
- fetch-level and `unstable_cache`-style caching of personalized reads is banned by default and allowed only with an explicit, reviewed justification;
- an integration test must prove that two users in different organizations can never observe each other’s cached payloads on the same route.

### Required negative security tests

Real database integration tests must prove that:

- one organization cannot list, read, change, delete, export, or download another organization’s case;
- an unassigned counsellor cannot access an assigned-only case;
- a student cannot access another student’s case;
- a revoked team member immediately loses access;
- a guessed Storage path cannot produce a usable download;
- an expired, replayed, revoked, or email-mismatched invitation cannot be accepted;
- role changes cannot be forged from browser input or user metadata;
- service-role routes reject case IDs that were not explicitly authorized;
- repeated invalid invitation-token attempts are rate limited, logged, and alerted rather than allowing unlimited probing.

## Document request and review model

The current private Storage foundation is useful, but the present one-file-per-kind model is not enough for consultancy collaboration.

### Proposed tables

#### `document_requests`

- `case_id`
- `kind`
- `requested_by`
- `assigned_to`
- `due_at`
- `status`
- `instructions`
- timestamps

#### `documents`

- `case_id`
- `kind`
- optional `application_attempt_id`
- `current_version_id`
- `review_status`
- timestamps

#### `document_versions`

- `document_id`
- `storage_path`
- `original_name`
- `mime_type`
- `size`
- `checksum`
- `uploaded_by`
- `uploaded_as`
- `created_at`

#### `document_reviews`

- `version_id`
- `reviewed_by`
- `decision`
- `note`
- `reviewed_at`

### Workflow

```text
Requested -> Uploaded -> In review -> Approved
                              |
                              -> Changes requested -> New version
```

### Storage convention

```text
organizations/{organizationId}/cases/{caseId}/documents/{documentId}/{versionId}
personal/{caseId}/documents/{documentId}/{versionId}
```

Database metadata remains the source of truth; object prefixes are an organization convention, not the security model.

Uploads should retain current magic-byte validation and size controls. Before broader release, add malware scanning, quarantine unscanned files, checksum verification, safe content disposition, and an independent backup and recovery plan for Storage objects. Database backups alone do not restore stored document files.

## Invitations and account linking

There are two invitation types:

- a team invitation that creates an organization membership; and
- a student invitation that links an Auth account to an existing case.

The application should generate a strong opaque token, store only its hash, bind it to an email address and intended role or case, expire it, permit revocation, and allow only one successful acceptance. Acceptance must be a server-side transaction.

Single acceptance must be enforced as an atomic compare-and-swap, not a check followed by an update: one statement that sets `accepted_at` only where the token hash matches, `accepted_at` is null, `revoked_at` is null, and `expires_at` is in the future, with the affected row count deciding success. Two concurrent acceptances of the same token must be impossible at the database level.

Invitation email matching must use normalized addresses and must bind only to a verified email on the accepting Auth account. The acceptance endpoint needs rate limiting, abuse logging, and alerting on repeated invalid tokens, because it is the one surface where an outsider holds a credential-shaped input.

The flow must handle:

- a person who already has a MeroVisa account;
- a person creating a new account;
- resending without creating duplicate memberships;
- a student already linked to another personal experience;
- an authenticated account whose email does not match the invitation.

Google-only authentication can support a small internal trial, but dependable consultancy and student onboarding should support email magic link or OTP as well. Production invitations also require reliable custom email delivery.

## Activity history and security audit

These should be related but distinct:

- **case activity** is understandable product history, such as “document requested,” “counsellor assigned,” or “changes requested”;
- **security audit** is append-only evidence of who accessed or changed sensitive resources, permissions, exports, downloads, and deletion operations.

Case activity can be visible to collaborators according to policy. The security audit should be limited to appropriate organization administrators and trusted internal support. Internal consultancy notes must have an explicit visibility classification so they are never accidentally shown to the student.

Append-only must be a database property, not a convention: no client-facing role holds `UPDATE` or `DELETE` on the audit table, and writes flow through a single server choke point — or a `SECURITY DEFINER` writer — so an application bug cannot silently skip or rewrite history. Sensitive reads, including document views and downloads, exports, and audit queries themselves, are recorded at the same choke point that authorizes them, which guarantees that an authorized sensitive read and its audit row cannot be separated.

## Export, archive, deletion, and retention

The product should distinguish:

1. archiving a closed consultancy case;
2. deleting a consultancy case and its organization-controlled data;
3. deleting a MeroVisa Auth account.

Deleting a consultancy case must not automatically delete a student’s Auth account, personal case, or data belonging to another valid relationship.

### Case export

An export should include, as applicable:

- profile data;
- assessments and outcomes;
- matches, program state, and plan;
- application history;
- a document index and authorized original files;
- appropriate case activity.

### Case deletion

Deletion must:

- verify the actor’s permission;
- apply the agreed retention policy;
- remove Storage objects through the Storage API;
- remove or anonymize database records in the correct dependency order;
- verify that cleanup completed;
- retain only the legally and operationally permitted audit tombstone.

Retention, legal-hold, backup expiry, and recovery behavior must be documented before real student documents are accepted.

## Current-state feasibility evidence

A read-only inspection of the current database and repository found:

- 9 Auth users and 7 profiles;
- 76 assessments, including 40 anonymous or unclaimed assessments;
- 15 universities and 83 programs;
- 12 user-program state rows and 74 plan items;
- 6 documents across 3 users, stored in one private bucket;
- 10 program predictions, 10 application attempts, and 19 outcome events;
- live application table columns aligned with the generated Supabase types;
- dozens of application and schema files that currently encode direct user ownership;
- broad unit and application test coverage, but very limited real Supabase integration coverage.

The small current data set makes an additive backfill practical. The anonymous assessments require special treatment: they should stay outside consultancy cases until claimed, or be removed according to the anonymous-data purge policy.

Before implementation, the team must capture and review the exact live policies, grants, indexes, constraints, functions, triggers, and Storage rules. Generated types confirm shape, but they do not prove production authorization behavior.

### Feasibility by area

| Area | Verdict | Main condition |
|---|---|---|
| Product fit | High | Validate daily workflow with real consultancies |
| Reuse of current student experience | High | Refactor components and data access to accept case context |
| Organization and case schema | Feasible | Use additive migration and preserve existing personal cases |
| Tenant isolation | Feasible, highest risk | RLS, server authorization, and real negative integration tests |
| Document collaboration | High | Replace one-file-per-kind with requests and versions |
| Student invitations | High | Add app-level invitation state and email authentication |
| Export and deletion | Feasible | Define controller, retention, Storage cleanup, and audit rules |
| Current infrastructure | Suitable | Monitor Storage, egress, email, background work, and backups |
| Privacy and compliance | Feasible with governance | Complete legal and operational review before production use |

## Privacy and operational governance

Student cases may contain passports, identity records, finances, academic history, immigration history, and other high-risk personal information. The product needs:

- clear notice and consent appropriate to each party’s role;
- a documented data-controller and data-processor model;
- purpose limitation and least-privilege access;
- student access and correction processes;
- retention and deletion rules;
- staff offboarding and periodic access review;
- breach response and notification procedures;
- consultancy agreements covering security and acceptable use;
- vendor and future AI data-handling rules;
- a separate policy decision before supporting minors or guardians.

### Lawful basis for staff-entered data

The consultancy model inverts the product’s existing consent posture. Today, sensitive information enters the system when the data subject uploads it and consents at that moment. In the workspace, staff create a case and may enter or upload a student’s identity, financial, academic, and immigration information before the student has an account, has consented in the product, or has necessarily been told the case exists.

This is the hardest privacy question the plan creates, and it must be answered before real student details are accepted:

- the consultancy must obtain the student’s consent, or another recognized lawful basis, through its own engagement process before entering personal information, and the consultancy agreement must make that an explicit, warranted obligation;
- MeroVisa must define what it independently requires: at minimum, notice to the student at invitation time, and full visibility of the held data when the student claims the case;
- the invitation email is the first moment MeroVisa itself touches the student; its content doubles as a privacy notice and must be reviewed as one;
- a case the student never claims must have a defined fate — a retention limit, deletion, or anonymization — because the data subject in that case has never interacted with the product.

The privacy gate is therefore broader than documents: **no real student personal data of any kind — structured fields or files — enters the system before the lawful-basis design, the controller model, and the consultancy agreement are resolved.** Anchoring the gate to document uploads at a later stage would leave equally sensitive structured data ungoverned from case creation onward.

Two further points sharpen the governance list above:

- the adults-only scope needs an enforcement mechanism — date-of-birth capture with a hard block, or an explicit guardian model — and must be reconciled with the product’s existing student-age posture rather than assumed;
- the cross-border review must name the processing legs that exist today, including hosting regions, analytics, and any model providers, and breach-response procedures must reflect the controller-processor split and the multi-tenant blast radius, since one incident may obligate notifications through several consultancies at once.

The production design should be reviewed against the [Australian Privacy Principles security guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information) and Nepal’s [Privacy Act, 2075 (2018)](https://hmis.gov.np/posts/single/the-privacy-act-2075-2018), with qualified legal advice for the actual operating arrangement.

## Work sequence and release gates

### Stage 0 — Product and policy decisions

- secure a named pilot consultancy that commits real counsellor time and a batch of real cases;
- observe that consultancy’s current workflow directly — spreadsheets, messaging, and drives — and map the real case workflow from first contact to application;
- agree role boundaries, assigned-only access, student editing, internal notes, retention, and deletion;
- decide the controller model and draft the consultancy agreement, including the staff-entered-data consent obligation;
- define the controlled pilot, its exit criteria, and its kill criteria;
- resolve the legal and privacy blocker before real student personal data of any kind is collected.

**Exit gate:** the team has one agreed workflow, one role matrix, one visibility matrix, one retention model, an agreed controller model with a drafted consultancy agreement, and a named consultancy committed to the pilot.

### Stage 1 — Tenancy foundation

- add organizations, memberships, cases, assignments, invitations, and audit events;
- write case permission helpers and the server-only data-access boundary;
- implement and test case-aware RLS;
- add a real Supabase integration test harness for cross-tenant denial.

**Exit gate:** the authorization matrix passes positive and negative database tests.

### Stage 2 — Case-aware core

- create or resolve personal cases for existing users;
- add and backfill `case_id`;
- migrate profile, assessment, matches, plan, and application data access;
- retain the existing personal student experience;
- preserve anonymous claim behavior.

**Exit gate:** existing students see the same correct data, while case-scoped repositories no longer depend on actor equals student.

### Stage 3 — Consultancy workspace

- build organization selection and team management;
- build student list, search, filters, statuses, case creation, and assignment;
- render the existing MeroVisa experience inside an explicit case route;
- add clear case-context indicators.

**Exit gate:** an authorized counsellor can create, find, assign, and manage a case without a student account. Real student personal data may enter only if the Stage 0 legal gate has been passed; otherwise Stage 3 runs on test data.

### Stage 4 — Document collaboration

- add requests, document records, versions, reviews, and case activity;
- add case-aware Storage paths and signed downloads;
- add document access audit events;
- add scanning, quarantine, backup, and recovery controls required for pilot documents.

**Exit gate:** an unauthorized actor cannot upload, view, download, review, or enumerate a document, and the authorized request-to-approval flow works.

### Stage 5 — Invitations and student portal

- confirm email-based sign-in, delivered earlier as an enabling backlog item, supports the invitation flows;
- implement team and student invitation acceptance;
- link the student account to an existing case without duplication;
- enforce student-visible versus consultancy-only fields.

**Exit gate:** both existing and new users can accept a valid invitation, while replay, mismatch, expiry, and revocation tests pass.

### Stage 6 — Audit, export, archive, and delete

- finish append-only security audit coverage;
- provide case export;
- add archive and policy-aware deletion;
- verify database and Storage cleanup behavior.

**Exit gate:** authorized administrators can complete and verify each lifecycle operation without affecting unrelated student data.

### Stage 7 — Hardening and controlled pilot

- run full regression, integration, security, and accessibility checks;
- run Supabase security and performance advisors;
- rehearse backup and recovery;
- onboard a small consultancy cohort manually;
- observe real workflows and support issues;
- review metrics and incidents before expanding access.

**Exit gate:** pilot users complete the core workflow with no cross-tenant exposure and with acceptable operational support.

## Backlog sequencing

Do not wait for every existing backlog item. Finish the small group that directly protects or enables the consultancy foundation, then begin the tenancy work. Product discovery and policy decisions can proceed alongside that enabling work, while engineering keeps one active implementation slice at a time.

### Complete or resolve first

- accept the item currently in review;
- email authentication;
- anonymous assessment purge policy and implementation;
- database read-error handling;
- OAuth claim recovery;
- exchange-rate source and guard;
- the legal and privacy blocker for real student personal data of any kind.

### Absorb into the consultancy work

- document-status improvements should become part of the request, version, and review model rather than extending the current single-owner document design.

### Defer

- cosmetic work that does not affect pilot trust or usability;
- broad marketing expansion;
- generic CRM functions;
- automation unrelated to case readiness and documents.

### Consultancy epic slices

1. pilot decisions and policy model;
2. organization and case schema;
3. RLS and cross-tenant integration tests;
4. backfill and case-aware data access;
5. student list and assignment;
6. selected-case MeroVisa experience;
7. document collaboration;
8. team and student invitations;
9. activity and security audit;
10. export, archive, and delete;
11. hardening and controlled pilot.

## Validation plan

### Product validation

- observe how consultancies currently use spreadsheets, messaging, and drives;
- verify that the workspace replaces a repeated daily coordination problem;
- test case creation, assignment, document chasing, review, and student handoff;
- track points where staff leave MeroVisa to complete the workflow elsewhere.

### Technical validation

- type checking, linting, and automated tests;
- real local Supabase RLS integration tests;
- cross-organization API and Storage penetration scenarios;
- invitation abuse and account-linking tests;
- migration rehearsal on a copy of current data, including a rehearsed rollback and a post-cutover reconciliation check;
- export and deletion verification;
- backup and restore rehearsal;
- personal-student journey regression tests.

### Pilot success signals

- a consultancy creates and actively manages real cases;
- counsellors can identify the next action without a separate spreadsheet;
- students successfully accept invitations and upload requested documents;
- document requests move to an approved or changes-requested outcome;
- staff access is revoked correctly during offboarding;
- exports and deletion operations complete correctly;
- there are no cross-tenant authorization incidents;
- case updates continue after hands-on onboarding support ends, with weeks four to eight mattering more than week one;
- the workspace displaces the consultancy’s spreadsheet or drive for piloted cases instead of becoming a third place staff must also update;
- the consultancy states it would be significantly disappointed to lose the workspace and engages seriously with a pricing conversation.

### Pilot kill criteria

Write these down before the pilot starts. If piloted cases stop being updated once hands-on support fades, if staff keep the spreadsheet as the primary record, or if the consultancy will not engage on price after sustained use, the pilot has failed; the response is to revisit the expansion decision, not to explain the result away.

## Primary risks and mitigations

| Risk | Mitigation |
|---|---|
| Cross-tenant data exposure | Layered server authorization, RLS, Storage controls, and mandatory negative integration tests |
| Service-role bypass | Centralize privileged operations and require case authorization before every use |
| Confusion between account ownership and case control | Model actor, student, organization, and case as separate concepts |
| Malicious or unsafe documents | Validate, scan, quarantine, checksum, restrict rendering, and audit downloads |
| Failed invitation delivery or duplicate accounts | Email authentication, custom delivery, idempotent acceptance, and account-linking tests |
| Departed staff retaining access | Membership status enforcement, immediate revocation, and periodic access review |
| Accidental student visibility of internal notes | Explicit visibility classification and student-role tests |
| Deletion affecting unrelated data | Separate case, organization relationship, and Auth-account lifecycle operations |
| Unclear data-controller responsibilities | Consultancy agreement, privacy review, and an explicit decision register |
| Student data collected before the student consents | Consultancy-obtained consent as a warranted obligation, invitation-time notice, and a defined fate for unclaimed cases |
| Scope expanding into a generic CRM | Keep the pilot centered on readiness, plan, documents, ownership, and next action |

## Decisions required before implementation

1. Is a consultancy the controller of all data in its cases, or are responsibilities shared with MeroVisa?
2. Are counsellors assigned-only by default?
3. Which student profile fields can the student change after consultancy review?
4. Which notes and assessments are visible to the student?
5. Can a student have a personal case and a consultancy case simultaneously?
6. Can a document be reused across cases, or is every upload case-specific?
7. What is the retention policy after a case closes or a consultancy leaves?
8. What happens when a student changes consultancy?
9. Will the pilot accept adults only?
10. Which email sign-in and delivery providers will be used?
11. Which exports are available to the consultancy and to the student?
12. What evidence must remain after deletion, and for how long?
13. What is the lawful basis for staff entering a student’s personal information before the student has consented in the product, and who obtains that consent?
14. Which hosting regions, analytics services, and model providers process student data today, and under what cross-border terms?
15. What is the pricing and packaging hypothesis the pilot should test?

## Future AI opportunities

AI should assist counsellors and students without making unsupervised immigration or admissions decisions. After the case foundation and consent model are reliable, useful stages include:

- extracting structured fields from uploaded documents for human confirmation;
- checking document completeness, consistency, and expiry;
- summarizing a case with citations to its source records;
- drafting document request messages and follow-ups;
- explaining why a program match or readiness warning appeared;
- finding contradictions across profile, assessment, application, and evidence;
- recommending the next operational action for counsellor approval;
- producing a handover summary when a case is reassigned.

Every AI output should show its sources, distinguish extracted facts from generated suggestions, support correction, and retain the model, prompt version, actor, consent basis, and approval outcome where appropriate. Sensitive student data must not be sent to a model until vendor terms, regional handling, retention, access, and deletion have been approved.

## Final recommendation

Build the consultancy offering as a case-management layer around the existing MeroVisa student journey. Begin with product and privacy decisions plus the enabling backlog, then establish the organization, case, and authorization foundation before exposing consultancy screens to real student data.

The concept is technically and commercially plausible. Its success depends less on adding many features and more on getting three things right: a clear case workflow, strict tenant isolation, and a document collaboration experience that is measurably better than spreadsheets, chat, and shared drives.
