# Family & Lifecycle Feature Specification

## Overview

The family feature enables users (creators) to register family members who can access their ending notes after death. The lifecycle system manages the state transitions from active use through death reporting, consent gathering, and note opening.

## Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| **Creator** | The user who creates ending notes | Full note access (always), manage family members, set access presets |
| **Representative** | Trusted family member(s) designated by creator | Report death, initiate consent, manage category access after opening, cancel death report, reset consent |
| **Member** | Regular family member | Submit consent, view granted categories after opening |

- Up to **3 representatives** per creator (`MAX_REPRESENTATIVES = 3`)
- Users can simultaneously be a **creator** (for their own notes) and a **member/representative** (for another creator's notes)

## Lifecycle State Machine

```
  ┌─────────┐
  │  active  │ ← Normal state; creator uses the app
  └────┬─────┘
       │ Representative reports death
       ▼
  ┌──────────────┐
  │death_reported│ ← Any representative can cancel (→ active)
  └──────┬───────┘
         │ Representative initiates consent
         ▼
  ┌──────────────────┐
  │consent_gathering │ ← All family members must consent
  └──────┬───────────┘   Representative can reset (→ death_reported)
         │ All members consent (auto-transition)
         ▼
  ┌────────┐
  │ opened │ ← Notes accessible; representative manages category access
  └────────┘
```

### State Transition Details

| Transition | Trigger | Actor | Guard |
|-----------|---------|-------|-------|
| active → death_reported | `POST /lifecycle/:id/report-death` | Representative | Idempotent: 2nd report returns existing data |
| death_reported → active | `POST /lifecycle/:id/cancel-death-report` | Representative | Any representative can cancel |
| death_reported → consent_gathering | `POST /lifecycle/:id/initiate-consent` | Representative | Requires ≥1 family member; first-actor-wins |
| consent_gathering → death_reported | `POST /lifecycle/:id/reset-consent` | Representative | Deletes all consent records |
| consent_gathering → opened | Automatic | System | When all members consent (within DB transaction) |

### Conflict Resolution: First-Actor-Wins

When multiple representatives exist, conflicts are resolved as follows:

| Operation | Strategy | Reason |
|-----------|----------|--------|
| Death report | First-actor-wins (status guard) | 2nd reporter gets `ALREADY_REPORTED` |
| Consent initiation | First-actor-wins (status guard) | 2nd initiator gets `CONSENT_ALREADY_INITIATED` |
| Category access grant/revoke | Last-write-wins | Reversible operations |
| Death report cancel | Any-rep-can-cancel | Any representative can correct a false report |
| Consent reset | First-actor-wins (status guard) | Status transition provides natural exclusivity |

## Consent Flow

1. Representative initiates consent gathering
2. System creates consent records for all active family members
3. System sends notifications to all members
4. Each member submits consent (agree/decline)
5. When all members agree → note auto-opens (within a DB transaction to prevent race conditions)
6. If any member declines → representative can reset consent to try again

**Safeguards:**
- Cannot initiate consent with 0 family members
- Cannot delete family members during consent gathering
- Consent changes are blocked after note is opened
- Opening transition uses DB transaction with status guard to prevent double-opening

## Access Presets (Creator's Pre-mortem Wishes)

Creators can configure which categories each family member should be able to see, while their note is in `active` status. These settings are stored as **recommendations** — not enforced.

### How it works:
1. **Creator sets presets** (active status only): Select family members → check categories
2. **After note opens**: Representative sees preset recommendations in the access manager
3. **Representative decides**: Can apply all recommendations at once or make independent choices

### API:
- `GET /api/access-presets` — Creator's preset list
- `POST /api/access-presets` — Add preset (active status only)
- `DELETE /api/access-presets/:id` — Remove preset (active status only)
- `GET /api/access-presets/:creatorId/recommendations` — Representative: get recommendations

## Category Access (Post-Opening)

After a note is opened, representatives manage which categories each member can access.

| Actor | Access Level |
|-------|-------------|
| Creator | All categories (always) |
| Representative | All categories |
| Member | Only granted categories |

### API:
- `GET /api/access/:creatorId/categories` — List accessible categories
- `POST /api/access/:creatorId/grant` — Grant access (representative only)
- `DELETE /api/access/:creatorId/revoke` — Revoke access (representative only)
- `GET /api/access/:creatorId/matrix` — Full access matrix (representative only)

## Audit Logging

All lifecycle state changes are logged in the `lifecycle_action_log` table:
- `death_reported` / `death_report_cancelled`
- `consent_initiated` / `consent_reset`
- `consent_submitted` (with consented: true/false metadata)
- `note_opened`

Each log entry records: lifecycle ID, action, performer, metadata, timestamp.

## Database Tables

| Table | Purpose |
|-------|---------|
| `family_invitations` | Invitation links (token, relationship, role, expiry) |
| `family_members` | Creator-member relationships (role, isActive) |
| `note_lifecycle` | Lifecycle state per creator (status, timestamps) |
| `consent_records` | Per-member consent (consented, timestamp) |
| `access_presets` | Creator's pre-mortem access wishes |
| `category_access` | Post-opening access grants per member per category |
| `lifecycle_action_log` | Audit trail for all lifecycle changes |
| `notifications` | In-app notifications for lifecycle events |

## Ending Note Categories

11 categories available for access control:

1. `memories` — Thoughts and memories
2. `people` — Important people and pets
3. `house` — Living arrangements
4. `medical` — Medical and care preferences
5. `funeral` — Funeral and memorial wishes
6. `money` — Financial assets
7. `work` — Work and business
8. `digital` — Digital accounts
9. `legal` — Inheritance and wills
10. `trust` — Trusts and power of attorney
11. `support` — Public support systems
