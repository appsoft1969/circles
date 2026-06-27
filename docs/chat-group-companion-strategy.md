# Chat Group Companion Strategy

InCircle should be designed as a companion to existing chat groups, not a replacement for chat apps.

## Core Principle

> Chat groups are where people talk. InCircle is where the group task gets organized.

In Chinese:

> 把群裡的 +1，變成清楚的名單與統計。

Supporting copy:

> 訂飲料、揪吃飯、團購、票券、KTV，誰要、幾份、誰付了，圈內幫你整理清楚。

## Why This Matters

Most target users already have their real groups in a chat app. Asking them to move the whole group into a new app creates too much friction.

InCircle should succeed by fitting into the existing behavior:

1. Organizer creates a task in InCircle.
2. InCircle generates a link.
3. Organizer posts the link to the chat group.
4. Participants submit through the link.
5. Organizer manages the structured result in InCircle.
6. Conversation continues in the original chat group.

## What Chat Apps Should Keep Doing

InCircle should not compete with chat apps on:

- Casual chat.
- Relationship maintenance.
- Stickers and lightweight reactions.
- Group conversation.
- Social presence.
- Existing contact graph.
- Daily notifications and habit.

## What InCircle Should Do Better

InCircle should focus on the parts chat is not structurally good at:

- Structured signup.
- Item or option selection.
- Quantity counting.
- Deadline control.
- Payment status.
- Pickup or attendance status.
- Exportable records.
- Reusing a previous setup.
- Seeing who has not responded.
- Seeing who has not paid.

## Template Direction

The product should eventually support multiple task templates that share the same engine.

### Group Buy

Use for products, supplies, shared purchases, and casual recurring buys.

Key fields:

- Item.
- Variant.
- Quantity.
- Price.
- Deadline.
- Payment status.
- Pickup status.

### Circle Member Sale

Use when a known circle member occasionally sells self-grown produce, handmade goods, small-batch food, crafts, or extra inventory to people in the same circle.

Key fields:

- Seller.
- Item.
- Variant or pack size.
- Available quantity.
- Price.
- Deadline.
- Payment status.
- Pickup status.

Boundary:

This is circle-only commerce. It should not create public discovery, seller rankings, storefronts, or a marketplace feed in the early product.

### Office Meal Order

Use for lunch, dinner, bento orders, or shared office food orders.

Key fields:

- Restaurant.
- Menu item.
- Price.
- Add-ons.
- Note.
- Delivery time.
- Payment status.
- Pickup status.

### Drink Order

Use for office drinks or cafe orders.

Key fields:

- Drink.
- Size.
- Sweetness.
- Ice level.
- Toppings.
- Quantity.
- Note.
- Payment status.

### Activity Signup

Use for KTV, dinner, hiking, camping, sports, or casual gatherings.

Key fields:

- Activity name.
- Time.
- Location.
- RSVP status.
- Headcount.
- Guest count.
- Deposit or shared cost.
- Final settlement status.

### Interest Check

Use before something is a confirmed activity, vote, or claim flow.

Good examples:

- Who wants to watch a movie this weekend?
- Who is interested in dinner after work?
- Who wants to go to a ball game?
- I have a few free tickets or freebies; who wants one?

The organizer should be able to see interest count, tentative quantity, and notes, then later edit the follow-up title, deadline, instructions, and options before turning the idea into an activity, poll, or claim/order task.

### Claim Registration

Use after an interest check or announcement becomes a real claim flow for free tickets, seats, quotas, freebies, or perks.

Key fields:

- Claim option.
- Quantity or headcount.
- Claim deadline.
- Pickup or transfer method.
- Waitlist or backup status.
- Completion status.

Boundary:

This is not a public coupon marketplace. It is a circle-only registration list for things a known person is distributing to the group.

### Poll

Use for choosing time, location, restaurant, product option, or activity plan.

Key fields:

- Options.
- Voting deadline.
- Single or multiple choice.
- Result visibility.

### Expense Split

Use after an activity or purchase when the group needs to settle money.

Key fields:

- Total expense.
- Participants.
- Split rule.
- Paid by.
- Owed amount.
- Settlement status.

## Product Boundary

InCircle should not become a full chat app, social feed, public community platform, public marketplace, or seller backend.

The long-term product should be:

> A structured task layer for small real-life circles that already live in chat groups.

## MVP Implication

The current prototype can stay group-buy-first, but the language should avoid making the product feel limited to group buys forever.

Recommended generic wording:

- `建立事項` when choosing a template.
- `建立團購` inside the group-buy template.
- `成員填單` for participant submission.
- `管理統計` for organizer operations.
- `複製分享連結` for distribution.
