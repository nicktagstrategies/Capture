# Open questions

Living artifact tracking blindspots and unresolved decisions. Add a row when you hit one; close it with a link to the PR/commit that addresses it. Priority is severity-based: **P0** = ships broken without it, **P1** = expected before public beta, **P2** = nice-to-have or post-MVP.

Status legend: `open`, `in-progress`, `decided`, `done`.

## Product

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-PROD-1 | P0 | open | **Photo delivery is THE product and isn't designed.** Where do customers receive their photos? Watermarked previews? Full-res unlock after rating? Print orders? Permalinks? | Without this, Capture is just a scheduler. Affects data model (deliverable assets, expiration, sharing), CDN choice, watermarking pipeline. |
| Q-PROD-2 | P0 | open | **Pre-booking discovery screen missing.** No portfolio/profile view between Home and Booking. | Tackled in M1.5 with `PhotographerProfileView`. |
| Q-PROD-3 | P0 | open | **No customer↔photographer messaging.** | Need thread + message models, push targets, attachment support, read receipts. |
| Q-PROD-4 | P0 | open | **Cancellation / reschedule flow doesn't exist.** | Needs policy decision: refund window, photographer-side commission recovery, timing. |
| Q-PROD-5 | P0 | decided | **Voucher fraud vector — anyone can mint free percentage-off codes.** | Decision: split concept into (a) gift cards (sender pays), (b) promo codes (platform-issued). User-issued discounts will pay through Stripe at send time. |
| Q-PROD-6 | P1 | open | Tipping post-session. | |
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
| Q-OPS-2 | P0 | open | Refund policy + automatic-refund rules for no-shows / weather. | |
| Q-OPS-3 | P0 | open | Privacy policy, ToS, photographer agreement, model release. | App Store submission gate. |
| Q-OPS-4 | P0 | open | Customer support channel + tooling (Frontapp / Intercom). | "Help" button in design routes nowhere. |
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
| Q-BIZ-3 | P1 | open | Referral program (sender/recipient credit). | Vouchers screen is the visual hook. |
| Q-BIZ-4 | P1 | open | Promo codes (platform-issued, distinct from gift cards). | See Q-PROD-5. |
| Q-BIZ-5 | P1 | open | ASO + App Store screenshots + press kit. | |

## Analytics / observability

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-OBS-1 | P0 | open | Analytics SDK (Mixpanel / PostHog / Amplitude) for funnel tracking. | |
| Q-OBS-2 | P0 | open | Crash reporting (Sentry on iOS + server). | |
| Q-OBS-3 | P1 | open | Request ID correlation between iOS and server. | |
| Q-OBS-4 | P1 | open | Webhook dead-letter queue + alerting. | |

## Security

| ID | Priority | Status | Question / blindspot | Notes |
|----|----------|--------|----------------------|-------|
| Q-SEC-1 | P0 | open | Email verification before checkout. | See Q-ENG-9. |
| Q-SEC-2 | P1 | open | 2FA for photographer accounts. | Payouts attached. |
| Q-SEC-3 | P1 | open | Account-takeover hardening on email change. | |
| Q-SEC-4 | P1 | open | EXIF strip on uploaded photos to drop GPS. | |
| Q-SEC-5 | P2 | open | Brute-force lockout (sliding window) on login. | |
