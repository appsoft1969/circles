# InCircle MVP PRD

## 1. Product Summary

**Chinese name:** 圈內  
**English name:** InCircle  
**Positioning:** 熟人圈的生活辦事空間

InCircle is a lightweight tool for people who already have small real-life groups and need to get things done together. The product is designed to complement existing chat groups: conversation can stay where it already happens, while InCircle handles structured signup, counting, payment status, and reusable records.

The first version focuses on group-buy workflows that usually happen inside chat groups, but the product should eventually support other familiar-circle tasks such as interest checks, claim registration for free tickets or perks, circle-only member sales, office meal orders, drink orders, KTV signups, activity planning, polls, and expense splits.

The product should not start as a social network. It should work as an external helper for existing chat groups.

## 2. Positioning

**One-line positioning:**

> A familiar-circle tool for running group buys, signups, payment tracking, and simple coordination without losing everything in chat.

**Chinese positioning:**

> 給熟人圈主使用的揪團辦事工具，補上聊天群裡容易混亂的登記、統計、付款狀態與完成紀錄。

**Hero copy:**

> 把群裡的 +1，變成清楚的名單與統計。

**Supporting copy:**

> 訂飲料、揪吃飯、團購、票券、KTV，誰要、幾份、誰付了，圈內幫你整理清楚。

## 3. Problem

Small groups already coordinate through chat, but operational details are fragile:

- "+1" messages are scattered across chat.
- Quantities and variants are easy to miscount.
- Payment status is tracked manually.
- Pickup or completion status is hard to follow.
- Repeated group buys require rebuilding the same structure every time.
- Important details are buried by normal conversation.

## 4. Target Users

### Primary User: Circle Organizer

The organizer is the person who starts group buys or activities inside a known group.

Examples:

- A friend who often buys coffee beans with a small group.
- A parent who coordinates shared purchases.
- A coworker organizing lunch orders.
- A camping or sports enthusiast coordinating supplies.
- A small community host who runs occasional low-volume group buys.
- A circle member who occasionally sells self-grown produce, handmade goods, or small-batch work to people they already know.

### Secondary User: Participant

The participant joins through a shared link, usually from a chat group. They should be able to submit an order without installing an app.

## 5. MVP Primary Scenario

The MVP should focus on **group buy management**.

Example flow:

1. Organizer creates a circle: "咖啡豆團購圈".
2. Organizer creates a group buy: "7 月咖啡豆團購".
3. Organizer enters product name, price, variants, deadline, pickup note, and payment instructions.
4. App generates a share link.
5. Organizer posts the link to a chat group.
6. Participants open the link and submit name, quantity, variant, and note.
7. Organizer sees total quantity, total amount, individual orders, payment status, and pickup status.
8. Organizer marks payment and pickup manually.
9. Completed group buy remains as a record and can be duplicated next time.

## 6. MVP Goals

- Make it faster for organizers to collect orders than using chat messages.
- Reduce missed quantities and payment confusion.
- Let participants submit without signup for the first version.
- Give organizers a clear management table.
- Support reuse by duplicating a previous group buy.
- Prove that a chat-link companion workflow feels natural before adding broader templates.

## 7. Non-Goals

The MVP should not include:

- Public group discovery.
- Social feed.
- Friend graph.
- Real-time chat.
- Full marketplace.
- Public seller storefronts.
- Native payment processing.
- Logistics integrations.
- Rating or review system.
- Complex permission roles.

## 8. Core Objects

### User

An authenticated organizer account.

Initial fields:

- id
- display_name
- email or phone
- created_at

### Circle

A private or link-accessible group container.

Initial fields:

- id
- owner_user_id
- name
- description
- invite_code
- created_at

### Circle Member

A known participant inside a circle.

Initial fields:

- id
- circle_id
- display_name
- contact_hint
- created_at

### Group Buy

The main MVP transaction object.

Initial fields:

- id
- circle_id
- title
- description
- deadline_at
- payment_instructions
- pickup_instructions
- status: draft, open, closed, completed, cancelled
- created_at

### Item

A purchasable item or variant.

Initial fields:

- id
- group_buy_id
- name
- variant_name
- unit_price
- max_quantity optional
- sort_order

### Order Response

Participant submission.

Initial fields:

- id
- group_buy_id
- participant_name
- participant_contact optional
- item_id
- quantity
- note
- payment_status: unpaid, paid, confirmed, cancelled
- pickup_status: pending, picked_up, not_needed
- submitted_at

### Adjacent Template: Circle Member Sale

This is not a public marketplace. It is a circle-only sale opened by a known member for occasional, low-volume items.

Examples:

- Self-grown vegetables or fruit.
- Handmade goods.
- Small-batch food or crafts.
- Extra inventory that a member wants to share with the circle.

Required fields:

- Seller name.
- Item name.
- Variant or pack size.
- Unit price.
- Available quantity optional.
- Deadline.
- Payment instructions.
- Pickup instructions.
- Payment status.
- Pickup status.

Product rule:

This template should feel like a private task inside a trusted circle, not like a public e-commerce listing.

## 9. Required Screens

### 9.1 My Circle List

Purpose:

Show the organizer's groups and active items that need attention.

Required content:

- Circle list.
- Active group buys count.
- Pending payment count.
- Create circle action.

### 9.2 Circle Home

Purpose:

Show all active and past group buys inside a circle.

Required content:

- Circle name and member count.
- Active group buys.
- Completed group buys.
- Create group buy action.
- Invite or share circle action.

### 9.3 Create Group Buy

Purpose:

Let organizer configure a new group buy quickly.

Required fields:

- Title.
- Description.
- Item name.
- Variant or option.
- Unit price.
- Deadline.
- Payment instructions.
- Pickup instructions.

MVP constraint:

Start with one or multiple simple item rows. Avoid inventory, SKU, discounts, shipping rules, and tax handling.

### 9.4 Participant Order Page

Purpose:

Let a participant submit from a chat-group link without installing the app.

Required fields:

- Participant name.
- Contact hint optional.
- Item selection.
- Quantity.
- Note.
- Submit button.

Required states:

- Open.
- Deadline passed.
- Submission received.
- Editing disabled after closure.

### 9.5 Group Buy Management

Purpose:

Organizer can manage all orders in one table.

Required content:

- Total quantity.
- Total amount.
- Orders by participant.
- Payment status.
- Pickup status.
- Export CSV action.
- Copy share link action.
- Close group buy action.
- Duplicate group buy action.

## 10. MVP Functional Requirements

### Organizer

- Can create an account.
- Can create a circle.
- Can create a group buy.
- Can generate and copy a share link.
- Can view participant responses.
- Can edit payment status manually.
- Can edit pickup status manually.
- Can close a group buy.
- Can duplicate a completed group buy.
- Can export responses to CSV.

### Participant

- Can open a public group buy link.
- Can submit name and order details.
- Can see confirmation after submit.
- Can optionally receive or copy their order summary.

## 11. Access Model

MVP should use a pragmatic access model:

- Organizers must sign in.
- Participants can submit through a unique link without signing in.
- Each public group buy link should use an unguessable token.
- Organizer pages require authentication.

This avoids onboarding friction for participants and supports chat-group-first distribution.

## 12. Success Metrics

MVP success should be measured by organizer reuse, not downloads.

Primary metrics:

- Number of group buys created.
- Number of interest checks created for activities, meals, tickets, or freebies before a plan is confirmed.
- Percentage of interest checks converted into an activity, poll, or claim registration.
- Percentage of group buys receiving at least 3 responses.
- Percentage of organizers creating a second group buy.
- Average number of manual payment status updates per group buy.
- CSV export usage.

Qualitative validation:

- Organizer says it was easier than chat-only tracking.
- Participants complete submission without instruction.
- Organizer is willing to use it again for the next group buy.

## 13. Validation Plan

Test with 3 to 5 real organizers:

- One casual group-buy organizer.
- One parent or family coordinator.
- One hobby community organizer.
- One coworker lunch or snack organizer.
- Optional: one small creator/community host.

Each test should use a real upcoming group buy. Avoid hypothetical interviews only.

Questions after usage:

- Did posting the link to a chat group feel acceptable?
- Did participants understand the form?
- Did the table reduce manual work?
- What did you still track outside the app?
- Would you use it again next time?

## 14. Open Product Questions

- Should the product support activities in V1, or keep V1 focused only on group buys?
- Should participants be able to edit their submission through a magic link?
- Should organizer confirmation be separate from participant self-marked paid status?
- Should the app support multiple currencies later?
- What is the final English name?
- Should the Chinese name remain "圈內" despite existing nearby naming conflicts?
