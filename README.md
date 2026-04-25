# Capture

A two-sided photography marketplace. Customers book nearby photographers (scheduled today, on-demand later), send each other percentage-off gift cards, and check out with Apple Pay. Photographers onboard via Stripe Connect and manage availability.

## Monorepo layout

```
Capture/
├── ios/           SwiftUI app (iOS 17+), generated via XcodeGen
├── server/        Node 20 + Express + Prisma + Postgres (PostGIS)
├── shared/        OpenAPI contract shared by client and server
├── docker-compose.yml
└── .github/
```

## Prerequisites

- **Node** 20.x
- **Docker** + Docker Compose
- **Xcode** 15+ (for iOS; macOS only)
- **XcodeGen** (`brew install xcodegen`) to generate the `.xcodeproj`
- **Stripe CLI** (`brew install stripe/stripe-cli/stripe`) for webhook forwarding

## Getting started

```sh
# 1. Local database
docker compose up -d

# 2. Server
cd server
cp .env.example .env            # fill in Stripe test keys
npm install
npm run db:migrate              # Prisma migrations (tables + enums)
psql $DATABASE_URL -f prisma/migrations/manual_postgis.sql  # PostGIS column/index
npm run db:seed                 # ~10 San Diego photographers + demo vouchers
npm run dev                     # http://localhost:3000

# 3. Stripe webhooks (separate terminal)
stripe listen --forward-to localhost:3000/webhooks/stripe

# 4. iOS (macOS only)
cd ios
xcodegen generate
open Capture.xcodeproj
# Run on an iOS 17 simulator
```

## Revenue model

Per booking, Capture charges:
- **$1.50** flat customer service fee (configurable in `server/src/services/payments.ts`)
- **10%** commission on the photographer's price

Example: a $18 Family Portrait → customer pays $20.50, Capture keeps $3.30, photographer receives $16.20 (before Stripe fees).

Apple **does not** take a cut — photography sessions are physical services delivered in the real world (App Store Guideline 3.1.3(e)). Apple Pay is offered as a payment method via Stripe, not as an In-App Purchase.

## Roadmap

See `/root/.claude/plans/steady-sprouting-octopus.md` for the full milestone plan.

- **M1** Foundation + scheduled booking flow end-to-end
- **M2** Vouchers + bookings management
- **M3** Photographer side (onboarding, availability, earnings)
- **M4** Reviews + polish
- **M5** On-demand mode
- **M6** Launch prep (live Stripe, TestFlight)
