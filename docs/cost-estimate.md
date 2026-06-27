# Cost Estimate And Recommendations

Last updated: 2026-06-27

This document estimates the expected costs for `圈內 / InCircle`.

Planning exchange rate:

- Use `US$1 ~= NT$32` for rough planning only.
- Real invoices should use the card issuer or vendor exchange rate at the payment date.

## Executive Recommendation

The recommended cost strategy is:

1. Keep the current website/database prototype local while product scope is still changing.
2. Ship a private Web MVP before building the full native app.
3. Use manual payment tracking first. Do not collect or hold money for users in the first release.
4. Use Expo / React Native + Supabase when moving toward iPhone, Android, and iPad.
5. Avoid public marketplace features and heavy seller backend costs.
6. Budget real money first for product validation, UX, backend correctness, notification reliability, privacy policy, and QA.

The first 3 to 6 months should optimize for learning, not scale.

## Cost Summary

| Stage | One-Time Cost | Monthly Cost | Recommended Use |
|---|---:|---:|---|
| Current local prototype | NT$0 to 10,000 | NT$0 | Keep iterating product and workflow locally |
| Private Web MVP | NT$20,000 to 100,000 | NT$1,000 to 5,000 | Real tests with 5 to 30 circles |
| Native App MVP | NT$80,000 to 250,000 non-dev setup | NT$3,000 to 15,000 | TestFlight, Google internal testing, push notifications |
| Public launch | NT$150,000 to 500,000 non-dev setup | NT$10,000 to 50,000+ | App Store / Google Play, support, monitoring, legal/compliance |
| Growth phase | Depends on team | NT$50,000 to 300,000+ | Paid support, marketing, payment integration, analytics, ops |

Development labor is separate and usually the largest cost.

## Development Cost Scenarios

### Scenario A: Founder + Codex / AI-Assisted Build

Best when the goal is to validate the idea before fundraising or hiring.

Estimated cash cost:

- Current to Web MVP: NT$0 to 80,000, mostly tools, accounts, design/legal help, and QA devices.
- Native app MVP: NT$50,000 to 250,000 if most coding is done internally and outside help is limited.

Hidden cost:

- Founder time.
- Slower QA.
- Higher risk of missing production edge cases.

Recommendation:

Use this path now. It matches the current project state.

### Scenario B: Small Freelance Team

Likely team:

- 1 product/UX designer.
- 1 full-stack developer.
- 1 React Native developer, sometimes same person.
- Part-time QA.

Estimated build cost:

| Scope | Estimate |
|---|---:|
| Web MVP only | NT$300,000 to 900,000 |
| Web MVP + backend hardening | NT$600,000 to 1,500,000 |
| iOS / Android / iPad App MVP with Expo | NT$900,000 to 2,500,000 |
| App + production backend + notifications + QA + store launch | NT$1,500,000 to 4,000,000 |

Recommendation:

Only use this path after the current Web MVP has been tested by real organizers.

### Scenario C: Agency / Product Studio

Estimated build cost:

| Scope | Estimate |
|---|---:|
| UX research + MVP design | NT$300,000 to 1,000,000 |
| Full Web + App MVP | NT$2,500,000 to 8,000,000 |
| Launch + support contract | NT$100,000 to 500,000+ per month |

Recommendation:

Avoid this until the product has clear traction, retention, and revenue logic.

## Platform And Infrastructure Costs

### App Store Accounts

| Item | Cost | Notes |
|---|---:|---|
| Apple Developer Program | US$99/year, about NT$3,200/year | Needed for TestFlight and App Store distribution |
| Google Play Console | US$25 one-time, about NT$800 | Needed for Google Play distribution |

Recommendation:

Do not pay these until native app testing is close. The Web MVP does not need them.

### Expo / EAS

| Plan | Cost | Recommended Timing |
|---|---:|---|
| Free | US$0/month | Early Expo development and light builds |
| Starter | US$19/month, about NT$600/month | When app builds and updates become frequent |
| Production | US$199/month, about NT$6,400/month | After public launch or when team/release needs justify it |

Recommendation:

Start Free. Move to Starter when native app release cadence becomes real. Delay Production.

### Backend: Supabase / Postgres

| Stage | Cost | Notes |
|---|---:|---|
| Free | US$0/month | Good for early development and demos |
| Pro baseline | About US$25 to 30/month, about NT$800 to 1,000/month | Better for real users because of production reliability and backups |
| Small production | About US$50 to 150/month, about NT$1,600 to 4,800/month | More realtime/chat/storage/traffic |
| Growing production | US$200+/month, about NT$6,400+/month | Depends on realtime connections, files, egress, compute |

Recommendation:

Use Free while testing. Move to Pro before inviting real beta users who depend on the data.

### Web Hosting

| Option | Cost | Notes |
|---|---:|---|
| Vercel Hobby | US$0/month | Good for early website/admin MVP |
| Vercel Pro | US$20/month, about NT$640/month | Use when project becomes production or team collaboration matters |
| Cloudflare Pages / Workers | US$0 to 20+/month | Good alternative for static web and edge functions |

Recommendation:

Use a free tier first. Upgrade when domain, reliability, or team workflow requires it.

### Push Notifications

| Item | Cost | Notes |
|---|---:|---|
| Firebase Cloud Messaging | US$0 | Android push and cross-platform notification infrastructure |
| Apple Push Notification service | Included with Apple Developer Program | Needs Apple developer account for production |
| Notification backend logic | Supabase Edge Functions or similar | Usually included in backend cost until usage grows |

Recommendation:

Budget engineering time, not vendor fees. The hard part is correct notification logic, read state, mute rules, and avoiding spam.

### Monitoring And Analytics

| Item | Cost | Recommended Timing |
|---|---:|---|
| Sentry / error monitoring | US$0 to 30+/month | Add before beta users |
| Product analytics | US$0 to 100+/month | Add when validating conversion and retention |
| Uptime monitoring | US$0 to 20/month | Add before public launch |

Recommendation:

Do not overbuy analytics. Track only the few events that prove the product works:

- Circle created.
- Task created.
- Share link copied.
- Participant submitted.
- Payment status updated.
- Task completed.
- Organizer creates a second task.

## Domain, Brand, And Legal Costs

| Item | Estimate | Recommendation |
|---|---:|---|
| Domain | NT$400 to 1,500/year | Buy only after name direction is stable |
| Logo / app icon | NT$5,000 to 50,000 | Simple professional icon is enough for MVP |
| Privacy policy / terms | NT$10,000 to 80,000 | Needed before public app launch |
| Trademark search / filing | NT$10,000 to 80,000+ | Do after naming decision |
| Company / tax / accounting setup | Varies | Ask CPA before collecting platform revenue |

Recommendation:

Do not overspend on brand before product-market fit. But do not launch public apps without privacy policy, terms, and data deletion handling.

## Payment And Money Handling

### MVP Recommendation

Start with manual payment tracking:

- User writes payment instructions.
- Participant submits order or signup.
- Organizer marks `未付款`, `待確認`, `已付款`.
- No money flows through InCircle.

This keeps cost and regulation low.

### If Adding Real Online Payments Later

Likely Taiwan payment gateway costs:

| Payment Type | Planning Estimate |
|---|---:|
| Credit card / mobile payment gateway | About 2.6% to 3.5% per transaction |
| ATM / virtual account | Often lower percentage or fixed minimum fee |
| Withdrawal fee | Often small fixed fee, such as NT$10 per withdrawal depending on provider |

Important product rule:

If InCircle collects money from participants and pays organizers/sellers later, the product becomes much more complex. It may trigger:

- Refund process.
- Dispute process.
- Settlement records.
- Fraud and chargeback handling.
- Tax/accounting questions.
- Potential stored-value, escrow, or platform-payment concerns depending on structure.

Recommendation:

Do not hold funds in the MVP. First support external payment proof or last-five-digits transfer confirmation.

### App Store Payment Rules

For this product, most payments are for physical goods or real-world services:

- Lunch.
- Drinks.
- KTV.
- Group buys.
- Circle-only member sale items.
- Event deposits.

These should generally be handled outside in-app purchase.

If InCircle later sells digital features, subscriptions, premium tools, or digital content inside the app, revisit Apple and Google billing rules. Small businesses may qualify for lower 15% platform fees for digital goods, but rules vary by platform and program.

## Suggested Budget By Phase

### Phase 0: Current Prototype

Goal:

Validate product direction.

Suggested spending:

- NT$0 monthly if kept local.
- Optional NT$400 to 1,500 for one domain if a name is chosen.

Do now:

- Continue current website/database prototype.
- Add key workflow screens.
- Interview organizers.
- Test real cases: drink order, office meal, group buy, KTV, circle member sale.

Avoid:

- Payment gateway.
- App Store accounts.
- Legal-heavy marketplace setup.
- Full native app build.

### Phase 1: Private Web MVP

Goal:

Run real tasks with a small number of circles.

Suggested budget:

- One-time: NT$20,000 to 100,000.
- Monthly: NT$1,000 to 5,000.

Included:

- Domain.
- Hosted frontend.
- Supabase Pro when real users start.
- Basic monitoring.
- Minimal privacy policy and terms.

Success gate:

- 10 completed tasks.
- At least 30% of organizers create a second task.
- Participants can submit without explanation.
- Organizers say payment/status tracking is better than chat-only.

### Phase 2: Native App MVP

Goal:

Test iPhone, Android, iPad, push notification, and in-app announcements.

Suggested budget:

- One-time setup excluding development: NT$80,000 to 250,000.
- Monthly: NT$3,000 to 15,000.
- Development if outsourced: NT$900,000 to 2,500,000.

Included:

- Apple Developer Program.
- Google Play Console.
- Expo/EAS Starter if needed.
- Supabase Pro.
- Push notification implementation.
- QA devices and app store preparation.
- Privacy policy, terms, deletion request flow.

Success gate:

- Push notification actually improves response rate.
- Organizers still create repeated tasks.
- Members understand why InCircle is useful even if they already have chat groups.

### Phase 3: Public Launch

Goal:

Public App Store / Google Play launch.

Suggested budget:

- One-time non-dev setup: NT$150,000 to 500,000.
- Monthly operating cost: NT$10,000 to 50,000+.
- Marketing budget: highly variable; start with NT$10,000 to 100,000/month only if conversion is measurable.

Included:

- App store launch assets.
- Production monitoring.
- Customer support process.
- Abuse/report flow.
- Data export/deletion.
- Security review.
- Basic marketing experiments.

## What I Would Spend First

Priority order:

1. Web MVP completion.
2. Real user test with 5 to 10 organizers.
3. Supabase production backend migration.
4. Notification and announcement model.
5. Expo mobile app shell.
6. TestFlight / Google internal testing.
7. Privacy policy, terms, and account deletion.
8. Payment proof flow.
9. Payment gateway only after manual payments become painful.

## What I Would Delay

- Full payment gateway.
- Holding money for users.
- Public marketplace.
- Seller storefronts.
- Logistics integration.
- Complex coupons.
- Full chat app replacement.
- Expensive agency branding.
- Large marketing spend before retention is proven.

## Source References Checked

- Apple Developer Program: https://developer.apple.com/programs/enroll/
- Google Play Console registration: https://support.google.com/googleplay/android-developer/answer/6112435
- Expo pricing: https://expo.dev/pricing
- Supabase pricing: https://supabase.com/pricing
- Supabase compute billing: https://supabase.com/docs/guides/platform/manage-your-usage/compute
- Vercel pricing: https://vercel.com/pricing
- Firebase Cloud Messaging pricing: https://firebase.google.com/products/cloud-messaging
- Apple App Review Guidelines, goods/services outside app: https://developer.apple.com/app-store/review/guidelines/
- Apple App Store Small Business Program: https://developer.apple.com/app-store/small-business-program/
- Google Play service fees: https://support.google.com/googleplay/android-developer/answer/112622
- NewebPay fee table: https://www.newebpay.com/website/Page/content/service_fare
- TapPay payments service: https://www.tappaysdk.com/taiwan-en/service/payments
