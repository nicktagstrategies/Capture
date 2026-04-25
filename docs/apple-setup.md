# Apple setup — Capture (new app)

You already have an Apple Developer account (from the Apex app). This checklist is only the **Capture-specific** resources you need to create in the developer portal before shipping M1 to TestFlight. Everything here is tied to the new app, not the team account itself.

## 1. App ID

- **Portal:** Certificates, Identifiers & Profiles → Identifiers → +
- **Bundle ID:** `com.capture.app` (matches `ios/project.yml`).
- **Capabilities to enable:**
  - Sign in with Apple
  - Push Notifications
  - Apple Pay Payment Processing
  - Associated Domains (later, for universal links)

## 2. Apple Pay merchant ID

- **Portal:** Identifiers → Merchant IDs → +
- **Identifier:** `merchant.com.capture.app` (matches the value in `BookingView.swift`).
- In the App ID above, check "Apple Pay Payment Processing" → Edit → assign this merchant ID.
- Complete merchant ID verification in Xcode (Signing & Capabilities → Apple Pay → add merchant ID).

## 3. Sign in with Apple — Services ID (for backend verification)

- **Portal:** Identifiers → Services IDs → +
- **Identifier:** `com.capture.app.signin`
- Configure "Sign in with Apple" → pick the primary App ID (`com.capture.app`).
- Generate a **Sign in with Apple key** (Keys → + → "Sign in with Apple"). Download the `.p8` once and store it safely. The server reads this via `APPLE_PRIVATE_KEY_PATH` — needed when we add a server-side nonce validation flow (not required for iOS-side token verification, which uses Apple's JWKS endpoint).

Populate in `server/.env`:
```
APPLE_CLIENT_ID=com.capture.app         # Bundle ID for iOS-issued tokens
APPLE_TEAM_ID=<your 10-char team id>
APPLE_KEY_ID=<the 10-char key id you generated>
APPLE_PRIVATE_KEY_PATH=./keys/AuthKey_XXXXXXXXXX.p8
```

## 4. APNs (push) key

- **Portal:** Keys → + → "Apple Push Notifications service (APNs)"
- Scope: all apps (or just `com.capture.app`).
- Download the `.p8` and note the Key ID + Team ID.
- Used by the server to send push via the `apn` package (M2).

## 5. Google Sign-In OAuth client

Not Apple, but on the same setup checklist:
- **Google Cloud Console** → APIs & Services → Credentials → Create OAuth 2.0 Client ID → iOS application.
- Bundle ID: `com.capture.app`.
- Paste the resulting client ID into `ios/project.yml` (`GOOGLE_IOS_CLIENT_ID`) and `server/.env` (`GOOGLE_IOS_CLIENT_ID` — the server verifies tokens against this audience).

## 6. Stripe Connect

- **Stripe Dashboard** → Connect → Settings → enable Platform.
- Use test keys in `server/.env` (`STRIPE_*`).
- Webhook endpoint (during dev): `stripe listen --forward-to localhost:3000/webhooks/stripe` — copy the signing secret it prints into `STRIPE_WEBHOOK_SECRET`.

## 7. App Store Connect listing (closer to TestFlight)

When you're ready to ship M6:
- Create the app record in App Store Connect using the `com.capture.app` identifier.
- Add TestFlight testers (your team + designers + pilot photographers).
- Fill in the privacy manifest: Capture collects email, name, location, payment tokenization (via Stripe), photo uploads. All go in `PrivacyInfo.xcprivacy`.

## Quick recap — env values we'll need

```
# iOS (Capture target build settings or .xcconfig)
PRODUCT_BUNDLE_IDENTIFIER = com.capture.app
DEVELOPMENT_TEAM          = <team id>
GOOGLE_IOS_CLIENT_ID      = <from Google Cloud Console>
REVERSED_GOOGLE_IOS_CLIENT_ID = <reversed form>

# server/.env
APPLE_CLIENT_ID=com.capture.app
GOOGLE_IOS_CLIENT_ID=<same as iOS>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```
