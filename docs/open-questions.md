# Open questions

Living artifact tracking blindspots and unresolved decisions. Add a row when you hit one; close it with a link to the PR/commit that addresses it. Priority is severity-based: **P0** = ships broken without it, **P1** = expected before public beta, **P2** = nice-to-have or post-MVP.

Status legend: `open`, `in-progress`, `decided`, `done`.

## Product

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-PROD-1 | P0 | done | **Photo delivery.** Gallery model, S3-presigned uploads, delivered-status promotion, public share-link tokens, customer consent toggle for portfolio use. | V1 ships full-res only (no watermark/proof tier); thumbnails + derivatives are a follow-up worker task. |
| Q-PROD-2 | P0 | done | **Pre-booking discovery screen missing.** No portfolio/profile view between Home and Booking. | Resolved by `PhotographerProfileView`. |
| Q-PROD-3 | P0 | in-progress | **Customer↔photographer messaging.** Thread per booking, text + image attachments, ephemeral live-location pin, polling-based delivery; locks 7 days post-completion. | V1 ships polling; WebSocket transport + APNs fan-out + read receipts UI follow up. |
| Q-PROD-11 | P0 | done | **Customer reviews.** `POST /reviews` (1-5 stars + optional body), one per booking, gated to confirmed/completed bookings. Photographer's `avgRating` + `ratingCount` updated inline via a rolling-average fold. `GET /photographers/:id/reviews` lists recent reviews. iOS prompt surfaces on `BookingDetailView` once gallery delivered. | Photographer response is a future addition (schema column not added yet). Two-sided ratings remain Q-PROD-9. |
| Q-PROD-12 | P0 | in-progress | **Photographer onboarding (M3 phase 1).** `POST /me/photographer/onboarding/start` lazily creates the profile + Stripe Connect Express account; `GET /me/photographer` + `PATCH /me/photographer` for self-edits; full CRUD on services + availability slots (`/me/photographer/services`, `/me/photographer/availability/slots`). `account.updated` webhook flips `User.role` via `nextRoleAfterOnboarding`. iOS: Profile entry → `PhotographerOnboardingView` → `PhotographerDashboardView`. `STRIPE_CONNECT_DEV_BYPASS` skips Stripe in dev. | Phase 2: KYC (Stripe Identity + Checkr), earnings dashboard with payout history. Phase 3: calendar sync (EventKit + Google Calendar). |
| Q-PROD-4 | P0 | done | **Cancellation / reschedule flow.** | Refund policy in `services/refunds.ts`: full ≥48h, 50% in 24-48h, none <24h, full when photographer/platform cancels. Reschedule swaps the slot atomically. |
| Q-PROD-5 | P0 | done | **Voucher fraud — anyone could mint free percentage-off codes.** | Vouchers are now gift cards: sender pays via Stripe at send time, voucher status is `pending_payment` until `payment_intent.succeeded` flips it to `active`. Booking redemption only accepts `active`. Promo codes (platform-issued) tracked separately as Q-BIZ-4. |
| Q-PROD-6 | P1 | in-progress | **Tipping post-session.** Customer-only `POST /bookings/:id/tip` creates a Stripe PaymentIntent that routes 100% to the photographer (no platform fee). Suggestions are 10/15/20% of subtotal, rounded to whole dollars, with a custom field. Floor/ceiling are env-tunable to stop typo $0.01 / $5,000 charges. | Push trigger 1h post-session is a follow-up (needs BullMQ). |
| Q-PROD-7 | P1 | open | Customer favorites / "rebook same photographer". | |
| Q-PROD-8 | P1 | open | Group bookings (photo + video same day). | |
| Q-PROD-9 | P1 | open | Two-sided ratings (photographer rates customer). | Helps deter no-shows and harassers. |
| Q-PROD-10 | P2 | open | Tiered pricing per service (1hr / 2hr / 4hr packages). | |

## UX / UI

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-UX-1 | P0 | open | First-run onboarding (location, event type, payment) is missing. | |
| Q-UX-2 | P0 | open | Permissions asked too aggressively at launch — should be in-context. | Move location prompt to first search action. |
| Q-UX-3 | P1 | open | Empty states + skeleton loading across Home / Bookings / Vouchers. | |
| Q-UX-4 | P1 | open | Error states need retry, offline indicator, friendlier copy. | |
| Q-UX-5 | P1 | open | Calendar UI is one-week only; add month view + "next available" hint. | |
| Q-UX-6 | P1 | open | Trust signals on photographer profile (verified badge, reply time, completed bookings). | |
| Q-UX-7 | P1 | open | Pricing transparency on services (deliverables, travel fees, edited photo count). | |
| Q-UX-8 | P1 | open | Accessibility audit: VoiceOver, Dynamic Type, contrast. | Muted-grey on white may fail WCAG. Price chip orange-on-cream definitely fails. |
| Q-UX-9 | P1 | open | Dark mode color tokens. | All colors currently hardcoded for light. |
| Q-UX-10 | P2 | open | Localization (currency, date format, copy). | |
| Q-UX-11 | P2 | open | iPad / landscape support. | Currently iPhone-only. |

## Engineering

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-ENG-1 | P0 | done | Slot booking race condition. | Atomic `updateMany({ where: { id, status: 'open' } })`; throws 409 when count = 0. |
| Q-ENG-2 | P0 | done | Held slots never expire. | Background sweeper releases `held` slots whose `heldUntil < now()`. |
| Q-ENG-3 | P0 | done | `POST /bookings` not idempotent — double-tap = double charge. | `Idempotency-Key` header + persisted response cache. |
| Q-ENG-4 | P0 | done | Stripe webhook events not deduped. | Persist event IDs in `WebhookEvent` table; ignore replays. |
| Q-ENG-5 | P0 | open | Time-zone storage / display. | First pass: photographer carries an IANA tz; iOS renders slots in that tz. Need timezone picker on photographer onboarding. |
| Q-ENG-6 | P0 | done | Rate limiting on auth + bookings endpoints. | `express-rate-limit` with in-memory store (swap to Redis store later). |
| Q-ENG-7 | P0 | open | OpenAPI codegen for iOS (replace hand-written `APITypes.swift`). | Run `swift-openapi-generator` in `ios/scripts/codegen.sh`. |
| Q-ENG-8 | P1 | open | JWT key rotation strategy. | Support active+previous keys, rotate without invalidating sessions. |
| Q-ENG-9 | P1 | open | Email verification before checkout. | Needs transactional email provider (Postmark / Resend). |
| Q-ENG-10 | P1 | open | Photo upload pipeline (M3): presigned S3, virus scan, EXIF strip, derivatives. | |
| Q-ENG-11 | P1 | open | Calendar sync (Google / iCal) for photographers. | Two-way required to prevent double-bookings. |
| Q-ENG-12 | P1 | open | Buffer time between shoots in slot generation. | |
| Q-ENG-13 | P1 | open | Search ranking beyond distance (popularity, availability, price). | |
| Q-ENG-14 | P1 | open | Account deletion flow. | App Store requirement. |
| Q-ENG-15 | P2 | open | Migrate from flat photographer profiles to Studio→Photographer hierarchy. | Plan migration before too much data accumulates. |
| Q-ENG-16 | P2 | open | Caching layer (config, photographer cards). | |
| Q-ENG-17 | P2 | open | Background job runner (BullMQ on Redis) for emails, sweepers, derivatives. | |

## Trust & safety / operations

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-OPS-1 | P0 | open | Photographer KYC + portfolio review queue. | Stripe Identity for ID; humans for portfolio + insurance check. |
| Q-OPS-2 | P0 | done | Refund policy + automatic-refund rules. | V1 policy: tunable via env (`HOURS_FOR_FULL_REFUND`, `HOURS_FOR_PARTIAL_REFUND`, `PARTIAL_REFUND_RATE`). No-show / weather adjudication still TBD. |
| Q-OPS-3 | P0 | open | Privacy policy, ToS, photographer agreement, model release. | App Store submission gate. |
| Q-OPS-4 | P0 | done | Customer support channel + tooling. | Help button is wired to a sheet that POSTs to `/support/tickets`; tickets persist server-side. Outbound email to `SUPPORT_INBOX_EMAIL` is a TODO once we pick a transactional email provider. |
| Q-OPS-5 | P1 | open | Background checks for photographers (Checkr or equivalent). | |
| Q-OPS-6 | P1 | open | Sales tax (Stripe Tax integration; merchant-of-record decision). | Photography taxable in CA, NY, TX, etc. |
| Q-OPS-7 | P1 | open | Disputes / chargeback ops. | |
| Q-OPS-8 | P1 | open | Photographer no-show + customer no-show handling (geofence check-in?). | |
| Q-OPS-9 | P1 | open | Liability insurance — gate listing on proof of insurance? | |

## Photographer side

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-PHOTO-1 | P1 | open | Earnings dashboard with payout schedule + holds. | |
| Q-PHOTO-2 | P1 | open | Travel range + travel fee per photographer. | |
| Q-PHOTO-3 | P1 | open | Inquiry / quote request flow before booking. | |
| Q-PHOTO-4 | P1 | open | Block list (both directions). | |
| Q-PHOTO-5 | P2 | open | Photographer marketing tools (featured listings, referral codes). | |
| Q-PHOTO-6 | P2 | open | Multi-photographer studios (Studio→Photographer model). | See Q-ENG-15. |

## Growth / business

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-BIZ-1 | P0 | open | Cold-start liquidity plan (city, # seed photographers, acquisition lever). | San Diego is the seed assumption. |
| Q-BIZ-2 | P0 | open | Take-rate sanity check at low ticket sizes (Stripe fee ~$0.90 on $20). | Consider minimum booking value or tiered fee. |
| Q-BIZ-3 | P1 | in-progress | **Referral program** ($10 give / $10 get). Each user gets a 6-char code (32-char alphabet, no I/O/0/1) minted on first session. `POST /referrals/claim` awards credit to both sides; booking checkout auto-applies available credit, capped at the booking's platform application fee so Capture never goes negative on a single booking. iOS Profile section shows code + balance + share sheet. | Universal-link `/r/[code]` and email-referral flows wait for the marketing site (M7). |
| Q-BIZ-4 | P1 | open | Promo codes (platform-issued, distinct from gift cards). | See Q-PROD-5. |
| Q-BIZ-5 | P1 | open | ASO + App Store screenshots + press kit. | |

## Analytics / observability

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-OBS-1 | P0 | done | Analytics SDK (PostHog) wired on iOS with funnel events: `app_opened`, `auth_completed`, `photographer_opened`, `booking_started`, `booking_payment_sheet_presented`, `booking_completed`, `booking_cancelled`, `gallery_opened`, `shared_gallery_link`, `support_ticket_submitted`, `message_sent`. Server-side captures TBD. | |
| Q-OBS-2 | P0 | done | Crash reporting via Sentry on both iOS (sentry-cocoa) and server (`@sentry/node`). Env-keyed; no-op without DSN. | |
| Q-OBS-3 | P1 | open | Request ID correlation between iOS and server. | |
| Q-OBS-4 | P1 | open | Webhook dead-letter queue + alerting. | |
| Q-OBS-5 | P0 | in-progress | **Push notification dispatcher.** `Notification` audit table + provider abstraction (no-op when APNs env keys absent). Hooked into booking-confirmed (Stripe webhook), message-received (POST /messages), gallery-delivered (finalize). | Real APNs HTTP/2 + ES256 transport is the next step — provider stub currently logs and marks rows `sent`. |

## Security

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-SEC-1 | P0 | open | Email verification before checkout. | See Q-ENG-9. |
| Q-SEC-2 | P1 | open | 2FA for photographer accounts. | Payouts attached. |
| Q-SEC-3 | P1 | open | Account-takeover hardening on email change. | |
| Q-SEC-4 | P1 | open | EXIF strip on uploaded photos to drop GPS. | |
| Q-SEC-5 | P2 | open | Brute-force lockout (sliding window) on login. | |
