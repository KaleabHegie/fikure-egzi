# Fikure Egzi Sunday School Management System

ፍቁረ እግዚእ ሰንበት ትምህርት ቤት — member registration first, with room to add attendance,
education, HR, finance, inventory, assets and events later.

| Layer    | Stack |
|----------|-------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router, TanStack Query, Axios, React Hook Form + Zod, Lucide |
| Backend  | NestJS 12 (ESM), TypeScript, class-validator/class-transformer, Swagger, JWT + RBAC |
| Database | MySQL / MariaDB with Prisma 7 (MariaDB driver adapter, no native query engine) |
| Tests    | Jest (backend unit + e2e), Vitest + Testing Library (frontend) |

## Repository layout

```
backend/                     NestJS API (modular monolith)
  prisma/schema.prisma       Database schema, grouped by module
  prisma/migrations/         SQL migrations (commit these)
  prisma/seed.ts             Syncs permissions + roles, creates first admin (idempotent)
  prisma/seed-demo.ts        DEV ONLY: 2,000 realistic demo members
  src/config/                Validated env config (AppConfigService)
  src/common/                Cross-cutting: auth guards/decorators, permissions catalog,
                             error filter, response envelope, validation pipe, rate limit
  src/prisma/                PrismaService
  src/modules/<domain>/      One folder per business module (auth, audit, members, health)
  test/                      e2e tests (separate *_test database)
  app.cjs                    cPanel/Passenger startup file
frontend/                    React SPA
  src/app/                   Providers, router (lazy, permission-gated routes), query client
  src/config/env.ts          Validated VITE_* config
  src/lib/api/               Axios client (token refresh), error normalization, types
  src/lib/auth/              In-memory session store
  src/components/ui/         shadcn/ui primitives (generated — edit sparingly)
  src/components/{layout,form,common}/  App shell, RHF field bindings, shared states
  src/features/<domain>/     api.ts (queries) · schema.ts (zod) · components/ · pages/
docker-compose.yml           Local MariaDB (port 3307)
dev.sh                       Starts DB + API + web together
scripts/build-release.sh     Builds upload-ready cPanel bundles
```

## Local development

Prerequisites: Node 22+ (npm 10+), Docker.

```bash
docker compose up -d                       # MariaDB on localhost:3307
cd backend
cp .env.example .env                       # then set JWT_ACCESS_SECRET
npm install
npm run prisma:migrate                     # apply migrations
npm run db:seed                            # permissions, roles, first admin
npm run db:seed:demo                       # optional: 2,000 demo members
cd ../frontend
cp .env.example .env
npm install
cd .. && ./dev.sh                          # API :4100, web :5180
```

- Web app: http://localhost:5180 — sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `backend/.env`.
- API docs (Swagger): http://localhost:4100/api/docs
- In dev the SPA calls `/api/v1` on its own origin and Vite proxies it to the API.

### Checks

```bash
cd backend  && npm run typecheck && npm run lint && npm test
cd backend  && npm run test:e2e:prepare && npm run test:e2e   # uses .env.test → fikure_egzi_test
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
```

### Testing QR scanning on a phone

Browsers only open the camera on secure pages, so a phone needs HTTPS. With the normal stack running
(`./dev.sh`), start `npm --prefix frontend run dev:phone` (or the `fikure-egzi-phone` launch config):
it serves the app over HTTPS with a self-signed certificate at `https://<this computer's Wi-Fi IP>:5181`.
Open that on a phone on the same Wi-Fi, accept the certificate warning once, sign in, open a session
and tap *Start camera*. If the phone can't connect, allow the port: `sudo ufw allow 5181/tcp`.

### Member names

A member's full name (first + father's + grandfather's) is unique among current members (case- and
spacing-insensitive): the form, the API and both Excel imports refuse a duplicate and name the
existing member's ID.

## API conventions

- Base path `/api/v1`; resources are plural nouns (`/members`, `/members/:id`).
- Success: `{ "data": … }`; lists: `{ "data": [...], "meta": { page, pageSize, total, totalPages } }`.
- Errors (every endpoint): `{ statusCode, error, message, details?, path, timestamp }`. Validation
  failures are `422` with `details: [{ field, messages[] }]`, which the frontend maps onto form fields.
- List query params: `page`, `pageSize` (≤ 100), `sortBy`, `sortOrder`, plus module filters
  (`search`, `status`, `gender` for members).
- Deletes are soft (`deleted_at`); every create/update/delete writes an `audit_logs` row.
- Refresh tokens rotate on use; a just-rotated token stays valid for 60 s so two tabs (or a reload
  mid-refresh) don't log the user out. Reuse after that revokes all of the user's sessions.

## Languages, theme and dates

- **Amharic + English.** All UI text lives in `frontend/src/i18n/locales/en.ts` (source of truth) and
  `am.ts`; TypeScript fails the build if a key is missing from either. Use `useTranslation()` → `t('…')`;
  never hard-code user-facing text. Zod messages are keys built with `msg()` and translated at render
  time, so they follow the language switch. Default language: Amharic (`DEFAULT_LANGUAGE` in `src/i18n`).
- **Light / dark / system theme** via `src/lib/theme.tsx`; colours are CSS tokens in `src/index.css`
  (`:root` and `.dark`). Use token classes (`bg-card`, `text-muted-foreground`…), not raw colours.
- **Ethiopian calendar everywhere** (same rule as DPMES). The API and database store Gregorian ISO dates;
  every date shown or picked is E.C.: display with `formatDate` / `formatDateTime` (`src/lib/format.ts`),
  input with `<DateField>` / `<EthDatePicker>`. `npm run lint` rejects ±7/8 year arithmetic, browser
  locale date formatting and native date inputs.

## Classes

Class types (seeded: **Mezmur Class** with grades Ge'ez ሐ / Ezel ለ / Araray ሀ, and **Course Class**
with grades 1–12) are data, not code: admins with `classes.manage` add, rename (English + Amharic),
reorder, deactivate or delete types and grades on the **Classes** page. A member holds at most one grade
per class type (`member_class_enrollments`), set from the member form via `classGradeIds`.

- Deleting is blocked while a grade still has members (or a type still has grades) — deactivate instead.
  Deactivated grades disappear from forms but members already in them keep them.
- `npm run db:seed` only creates the default types when their code is missing, so admin edits survive.
- API: `GET/POST /class-types`, `PATCH/DELETE /class-types/:id`, `PUT /class-types/order`,
  `POST /class-types/:id/grades`, `PUT /class-types/:id/grades/order`, `PATCH/DELETE /class-grades/:id`;
  `GET /members?classGradeId=…` filters members.

## Departments

Departments are an admin-managed **tree**: **ፅህፈት ቤት** (Secretariat Office, code `OFFICE`) is the top and
administers the departments under it. Seeded with 8 typical departments (Education, Mezmur, Arts &
Literature, Member Affairs, Development & Fundraising, Charity, Property, Finance) — rename, add, move,
reorder, deactivate or delete them on the **Departments** page (`departments.manage`).

- Members serve in any number of departments, each with a role: Head, Deputy head, Secretary or Member
  (at most one Head and one Deputy per department).
- A department with sub-departments or members can't be deleted; a department can't be moved under its
  own sub-department.
- API: `GET/POST /departments`, `GET/PATCH/DELETE /departments/:id`, `PUT /departments/order`,
  `GET/POST /departments/:id/members`, `PATCH/DELETE /department-memberships/:id`;
  `GET /members?departmentId=…` filters members.

## History

Current state lives in `member_class_enrollments` / `department_memberships`; every change is also
recorded as a **period** in the append-only `class_placement_history` and `department_service_history`
tables (`ended_at = NULL` means current). Promotions (Grade 1 → 2 → 3), moving between departments, role
changes (Member → Head) and leaving all close the old period and open a new one, in the same transaction
as the change itself. Removing a member closes their open periods.

- `GET /members/:id/history` → class and department periods, newest first (shown on the member page).
- `GET /departments/:id/history` → ended periods in a department ("Former members" on its page).
- A grade or department that appears in anyone's history can't be deleted — deactivate it instead.
- Dates use Addis Ababa time (`src/common/utils/dates.ts`), so a change at 01:00 local isn't dated yesterday.

## Attendance

Sessions (`attendance_sessions`) are one of three kinds:

- **Class** — pick the class type, then its grade (Mezmur → Ge'ez / Ezel / Araray, Course → 1–12, or any
  class added later); roster = members in that grade.
- **Service group** — roster = the members of one service group (see below).
- **Other** — gatherings, meetings, events: everyone, or narrowed by grade and/or department.

Times are Addis Ababa local (UTC+3), stored as 24-hour `HH:mm` but shown and picked on the
**Ethiopian clock** (`formatTime` / `<TimeField>`): two halves each counted 1–12 — ቀን 1 = 07:00 … ቀን 12 = 18:00,
ማታ 1 = 19:00 … ማታ 12 = 06:00 (so 08:00 → ቀን 2:00); dates are Ethiopian calendar.
The lint script rejects native `type="time"` inputs.

- **QR codes:** Members → *Print QR codes* (`/members/cards`, same filters as the list) prints A4 sheets of
  4 × 5 QR tiles (QR of the member ID + name + ID), dashed borders as cutting guides.
- **Recording:** scan members' QR codes with the camera (`qr-scanner`), or type / USB-scan the member ID.
  Check-ins after start + `lateAfterMinutes` (default 15) are **Late**. The roster checklist marks
  Present / Late / Absent / Excused (with a reason). Members not on the roster can still be recorded
  (flagged as visitors).
- **Regular sessions (Class, Service group):** a scan is **Present**, or **Late** after start +
  `lateAfterMinutes`. They **close themselves at their end time** (a server timer every minute, and on
  every read), recording every unmarked roster member as **Absent**. A session entered after it ended,
  or reopened for corrections (`autoClose = false`), is closed by hand.
- **Other sessions** (gatherings, events): only **Present** — no Late, no Absent on close; they're left out
  of the low-attendance report.
- **Scanning someone outside the session's class/group** only reports it — nothing is recorded.
- **No overlapping sessions** for the same class or group (or two gatherings with the same title).
- **Excel, one session** (session page → *Excel*): download the roster with a status dropdown, mark
  it (e.g. from paper) and upload it; checked first, all-or-nothing (`/attendance/sessions/:id/sheet`).
- **Excel, session list** (Attendance → *Import*, admins): one row per session with the same fields as
  the New session form — type, class/group, title, date (E.C., future allowed), Ethiopian-clock times,
  late threshold, place. No member rows: attendance is recorded by scanning or the session sheet.
  Identical existing sessions are skipped; overlaps (with the system or within the file) are errors
  (`/attendance/import`).
- **Attendance takers are scanners:** no roster list, totals or low-attendance report (those need
  `members.read`); they scan, and can create/close/delete today's sessions.
- **Reports:** per session counts + % present; per member (`GET /members/:id/attendance`) rate, counts,
  **total time attended** (late arrivals count from check-in) and recent sessions; **low attendance**
  (`GET /attendance/reports/low-attendance`) over closed sessions in a period.
- **Rate** = (present + late) ÷ (present + late + absent); excused sessions are not counted.
- Permissions: `attendance.read`, `attendance.take` (scan/mark), `attendance.manage` (create/edit/
  close/reopen), `attendance.delete`. Department-scoped users only see and act on sessions their
  department runs (see *Users & departments*).

## Excel import

**Members → Import from Excel** (`members.create`):

1. **Download the template** (`GET /members/import/template?lang=am|en`). It is generated live, so its
   dropdowns always list the current class grades (one column per class type), departments, roles,
   gender, status, marital status and education. Date and phone columns are formatted as text.
2. **Fill it in.** Dates are **Ethiopian calendar, `dd/mm/yyyy`**; the server converts them
   (`src/common/utils/ethiopian-calendar.ts`, same golden vectors as the web app and DPMES).
3. **Upload → preview** (`POST /members/import/preview`): every row is checked — required fields, dropdown
   values (either language), real E.C. dates, phone format, Head/Deputy seats — with possible duplicates
   flagged as warnings. Problems come back as codes the UI translates.
4. **Import** (`POST /members/import`): all rows in one transaction; if any row has an error, nothing is
   saved. Imported members get class/department history like hand-entered ones. Max 3,000 rows / 5 MB.

## Member photos

`PUT /members/:id/photo` (multipart field `photo`), `GET /members/:id/photo`, `DELETE /members/:id/photo`.
Only JPEG/PNG/WebP up to 2 MB, checked by file signature; the web app shrinks photos to ~640 px first.
Files live under `UPLOAD_DIR` and are **never served statically** — only to signed-in users with
`members.read` — because they include children's photos.

## Auth & RBAC

- `POST /auth/login` returns a short-lived access JWT (15 min) plus an opaque refresh token
  (stored hashed, rotated on every `POST /auth/refresh`; replaying a used token revokes all sessions).
- The SPA keeps the access token in memory only; the refresh token persists to restore sessions.
- **Authorize by permission code, never by role name.** Codes live in
  `backend/src/common/auth/permissions.ts` (mirrored in `frontend/src/lib/permissions.ts`).
  Seeded roles — see *Users & departments* below.
- Backend: `@RequirePermissions(PERMISSIONS.MEMBERS_CREATE)`; routes are authenticated by default,
  `@Public()` opts out. Frontend: `<RequirePermission>` on routes, `<Can>` around actions.

## Member portal

`/portal` (linked from the staff sign-in page): a member enters their **member ID** (typed, or scanned
from their QR code with the phone camera) and the **phone number on their record** (main or alternate),
and sees their own profile, classes, departments, service group, attendance (with date filter) and
their QR code. Wrong ID or phone get the same message; 8 tries per 10 minutes per IP. The member token
lasts 2 hours, lives only in that browser tab, and is signed with a separate key (`<JWT secret>:member-portal`)
so it can never act as a staff token (and staff tokens don't open the portal). Internal notes and
"edited by" are not shown. Sign-ins appear in the Audit log as *Member portal sign-in*.

## Assets

Sidebar → **ንብረት**. Each asset has an automatic code (AS-00001), name, category, quantity, condition,
status (in use / in store / under repair / lost / disposed), place, serial number, how and when it was
acquired (E.C. date, price in birr, donor), notes, a **photo** (JPEG/PNG/WebP ≤ 3 MB, streamed only to
signed-in users) and a **responsible department** (required). The list shows totals of what is owned
(disposed assets left out). Permissions `assets.read` / `assets.manage`: office admins manage all;
department admins only their departments' assets; a department responsible for assets can't be deleted.

## Courses

Sidebar → **ኮርሶች**. Run by the ትምህርት department administrator (any department admin, scoped to their
departments; office admins see all):

- **Course** — automatic code (CRS-00001), Amharic/English name, **duration** (3 months / 6 months / 1 year),
  pass mark (out of 100), department. Courses that ran can't be deleted, only made inactive.
- **Run** — the course given to one **class grade** for a period (start date; the end date defaults to
  start + duration, Ethiopian months = 30 days) with one or more **teachers**. Teachers and periods change
  from run to run; the same course can't run twice for a grade at overlapping dates. Its students are the
  members currently in that grade (former students keep their marks).
- **Teachers** — users with the `TEACHER` role, created on the Users page by the department admin, each
  linked to their **member record** (one login per member). A teacher's sidebar shows only *My courses*.
- **Assessments & marks** — on a run, the teacher sets the assessments (e.g. Quiz 20 · Mid 30 · Final 50,
  at most 100 in total) and fills the mark sheet; totals and pass/fail appear once the assessments add
  up to 100 and every mark is in. Member detail shows a *Courses* panel with the member's results.

Permissions: `courses.read`, `courses.manage` (courses, runs, teachers), `courses.teach` (assessments and
marks of the runs one teaches; managers can also mark). API: `/courses`, `/courses/teachers`,
`/courses/member/:memberId`, `/course-runs`, `/course-runs/:id/assessments`, `/course-runs/:id/marks`.

## Telegram bot

A read-only self-service bot for members, branded with the seal, in Amharic and English
(`backend/src/modules/telegram`). A chat is let in only after tapping **📱 Share my phone
number**: the contact must be the chat's own (Telegram verifies it) and the number must be a
member's phone or alternate phone. Several members on one number (siblings) can switch between
them. It shows **details**, **attendance** (last 90 days), **courses** (marks, results, and what a
teacher is teaching) and the member's **QR code**. Access is re-checked on every message, so
removing the number from the record ends it; group chats are ignored.

Setup:

1. Create the bot with **@BotFather** (`/newbot`), and set its picture with `/setuserpic`
   using `frontend/public/icons/icon-512.png`.
2. On the cPanel Node.js app add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
   (`openssl rand -hex 24`) and `API_PUBLIC_URL=https://api.fikureegzi4.com`, then save.
3. Deploy (or re-run the workflow). Each deploy runs `node dist/scripts/telegram-setup.js`, which
   sets the webhook (`/api/v1/telegram/webhook`, secret-checked) and the bot's name, description
   and command menu in both languages.

Local testing: create a separate test bot, put its token in `backend/.env` with
`TELEGRAM_POLLING=true`, and run the API — it long-polls Telegram, no public URL needed.

## Users & departments

Three kinds of user (system roles, synced by the seed; retired roles are removed if unused):

| Role | Scope | Can |
|---|---|---|
| `SUPER_ADMIN` — ፅህፈት ቤት admin | everything | every module, every department, all users |
| `DEPARTMENT_ADMIN` | their departments | roster of their departments (`departments.roster`), **their classes** (create/edit/delete types and grades their department runs), their attendance incl. delete, service groups of their classes, create/edit **attendance takers** of their departments |
| `ATTENDANCE_TAKER` | their departments | **only the attendance page**, **today's sessions only** (Addis date; other days need `attendance.any_day`, which department and office admins have): full create/record/close/delete of their departments' attendance (they can load class/department/group lists for the session form via `anyOf(..., attendance.manage)`, but not open those pages) |

- A scoped user is linked to one or more departments (`user_departments`); `AuthenticatedUser.departmentIds`
  is that list, or `null` when unrestricted. Services enforce it with `assertInScope()`
  (`common/auth/department-scope.ts`) — out-of-scope work is **403**.
- **Everything is scoped for department users** (all departments, not just Mezmur): the dashboard
  numbers, የአገልግሎት ክፍሎች (only theirs), አባላት (members placed in a class their department runs, or
  serving in it — others are 404), ክፍሎች (classes their department runs), service groups of those
  classes, and attendance they run. Adding someone to a roster searches all members
  (`GET /departments/:id/candidates`).
- **Every class belongs to a department** (`class_types.department_id` is required; a department that
  runs classes can't be deleted).
- **Who runs a session:** a class type's department (set on the
  Classes page; Mezmur → መዝሙር ክፍል, Course → ትምህርት ክፍል by default). CLASS and SERVICE_GROUP sessions
  belong to their class's department; OTHER sessions to their *organiser* (`organiser_id`, null = office).
- **Demo accounts (dev):** `npm run db:seed:demo -- 0` creates `mezmur-admin@fikureegzi.local` and
  `mezmur-attendance@fikureegzi.local` (መዝሙር ክፍል) with the password in `DEMO_USER_PASSWORD` (backend/.env).
- **Audit log** (`/audit`, `GET /api/v1/audit`, permission `audit.read`): office admins see every entry;
  a department admin sees their own actions and those of the attendance takers under them. Filters:
  user, record type, action, E.C. date range. (Individual scans/marks aren't audited — the attendance
  record itself keeps who recorded it.)
- `/users` (permission `users.manage`): list, create, edit, activate/deactivate, set a new password
  (signs the user out everywhere). You can't change your own role or deactivate yourself, and the last
  active office admin can't be demoted.

## Service groups

Mezmur students serve in **service groups**, mostly drawn from one class (usually Araray). Groups belong
to a **term** (`service_terms`, normally one E.C. year; one term is *current*), so they can be
reorganised every year — or at any interval — while earlier terms stay as history.

- A member is in at most one group per term (`service_group_members`, unique on term + member);
  adding them to another group moves them.
- **New term** can start from a previous term's groups (names + class) and optionally their members.
- **Distribute a class:** spreads a grade's active members evenly across chosen groups (smallest group
  first, alphabetical), either only those without a group or reshuffling everyone.
- Groups with attendance sessions can't be deleted; a member's page lists their group per term
  (`GET /members/:id/service-groups`).
- API: `/service-terms` (+ `/:id/groups`, `/:id/distribute`, `/:id/candidates`), `/service-groups/:id`
  (+ `/members`). Reading needs `classes.read`; organising needs `service_groups.manage` — office
  admins, and department admins for groups of classes their department runs (Mezmur admins → Mezmur groups).

## Adding a module (e.g. attendance)

1. **Schema:** add models under a new banner in `schema.prisma` → `npm run prisma:migrate -- --name attendance`.
2. **Permissions:** add `attendance.*` codes + role grants in `permissions.ts` (both copies) → `npm run db:seed`.
3. **API:** `src/modules/attendance/` with module, controller, service, `dto/`, `*.spec.ts`; register it in `app.module.ts`.
4. **Web:** `src/features/attendance/` (`api.ts`, `schema.ts`, `pages/`); add lazy routes in `app/router.tsx`
   and give its sidebar entry in `components/layout/navigation.ts` a `to` and `permission`.

## Deploying to cPanel

Requires cPanel's **Setup Node.js App** (CloudLinux Passenger) with Node **22.12+** and a MySQL/MariaDB database.

```bash
VITE_API_BASE_URL=https://api.example.org/api/v1 scripts/build-release.sh
```

**API** (`deploy/build/api/`):
1. cPanel → MySQL Databases: create the database + user (all privileges on that database only).
2. Setup Node.js App → Node 22, *Application root* e.g. `fikure-api`, *Application URL* e.g. `api.example.org`,
   *Application startup file* `app.cjs`.
3. Upload the contents of `deploy/build/api/` to the application root.
4. Create `.env` there from `.env.example`: `NODE_ENV=production`, the cPanel `DATABASE_URL`, a fresh
   `JWT_ACCESS_SECRET`, `CORS_ORIGINS=https://<frontend domain>`, `SWAGGER_ENABLED=false` (optional), and
   `UPLOAD_DIR` pointing **outside** the app root (e.g. `/home/<user>/fikure-uploads`) so redeploys never
   delete member photos. Include that folder in backups.
5. In the app's terminal (enter the virtualenv command cPanel shows):
   `npm ci --omit=dev && npx prisma migrate deploy && npm run db:seed`, then **Restart** the app.
6. Check `https://api.example.org/api/v1/health`.

**Web** (`deploy/build/web/`): upload its contents to the frontend domain's document root. The included
`.htaccess` handles client-side routes and caching. Change the API URL → rebuild and re-upload.

Never apply `docker/mariadb/init/01-dev-grants.sql` in production; it exists only so `prisma migrate dev`
can create its shadow database locally.
