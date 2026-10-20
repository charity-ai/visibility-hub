# AI Visibility Kit · Charity Loves AI

A single-page workbook that grows a user's reach and following on LinkedIn and Instagram and improves how AI search tools describe them. Visitors enter their name and email to open the kit; sign-ups, growth progress and completed roadmaps go straight into GoHighLevel.

```
index.html              The whole kit (HTML, CSS, JS in one file, no build step)
functions/api/lead.js   Cloudflare Pages Function that sends leads to GoHighLevel
_headers                Security and cache headers
```

## Deploy (GitHub → Cloudflare Pages)

1. Push this folder to a new GitHub repo, e.g. `charitylovesai-bot/ai-visibility-kit`.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings: Framework preset **None**, build command **empty**, output directory **/** .
4. Add the GoHighLevel variables below (Settings → Variables and Secrets), then redeploy.
5. Custom domain: Pages project → Custom domains → e.g. `visibility.charitylovesai.com`. Cloudflare adds the DNS record automatically since the zone is already there.

## Connect GoHighLevel

Pick one option.

**Option A · API (recommended).** Creates or updates the contact, adds tags (without removing existing ones), fills custom fields, and attaches notes.

| Variable | Value |
|---|---|
| `GHL_PIT` | Private Integration token (Sub-account → Settings → Private Integrations; scopes: contacts.write, contacts.readonly). Save as **encrypted**. |
| `GHL_LOCATION_ID` | Sub-account (location) ID |
| `GHL_FIELDS` | Optional JSON that maps kit data to your custom field IDs (below) |

**Option B · Inbound Webhook.** Create a workflow with the "Inbound Webhook" trigger (a premium trigger in GHL), copy its URL into `GHL_WEBHOOK_URL`, submit the form once, then map the fields. Every field listed below arrives in the webhook payload.

### What the kit sends

| Event | When | Tags added |
|---|---|---|
| `signup` | They open the kit | `ai-visibility-kit`, `kit-signup` |
| `progress` | While they work, at most every 6 hours, plus right away on a milestone (new Visibility level or new follower stage) | `kit-active`, `visibility-<level>`, `followers-<stage>` |
| `roadmap` | They tap "Email me my roadmap" | `kit-completed` |

Also: `kit-success-story` when someone has grown 1,000+ followers since they started the kit.

Level tags: `visibility-invisible`, `-findable`, `-noticed`, `-magnetic`, `-everywhere`.
Stage tags: `followers-under-1k`, `followers-1k-to-10k`, `followers-10k-to-100k`, `followers-100k-plus`.

Progress is shared only if the user leaves "Share my growth progress" on (it's on by default, and they can turn it off in chapter vii). Their written answers are never sent, only numbers.

### Custom fields (optional, Option A)

Create these in GHL (Settings → Custom Fields), then paste their IDs into `GHL_FIELDS`. Use any subset.

```json
{
  "visibility_score": "<number field id>",
  "visibility_tier": "<text field id>",
  "followers": "<number field id>",
  "followers_start": "<number field id>",
  "followers_growth": "<number field id>",
  "stage": "<text field id>",
  "primary_platform": "<text field id>",
  "posts_logged": "<number field id>",
  "best_follow_rate": "<number field id>",
  "roadmap": "<multi-line text field id>"
}
```

With these filled you can build a Smart List sorted by `followers_growth` to find your best success stories, and use `{{contact.roadmap}}`-style merge fields (whatever you name the field) in emails.

Notes are added on sign-up, roadmap completion and milestones only, so routine check-ins don't clutter the contact record.

### Workflows to build in GHL

1. **Welcome** · Trigger: tag `kit-signup` added → email "Your AI Visibility Kit is open" with the kit link → day 2, 4, 7 nurture emails (one reach secret each) → day 9 consultation invite.
2. **Roadmap delivery** · Trigger: tag `kit-completed` added → email with the roadmap custom field → internal notification to Charity. Completers are your hottest leads.
3. **Level up** · Trigger: tag `visibility-magnetic` or `visibility-everywhere` added → congratulations email → offer a strategy call.
4. **Stage up** · Trigger: tag `followers-1k-to-10k` (or higher) added → personal congratulations SMS from Charity → ask what's working.
5. **Success story** · Trigger: tag `kit-success-story` added → internal alert → request a testimonial and before/after screenshots.
6. **Gone quiet** · Trigger: tag `kit-signup` added → wait 14 days → if no `kit-active` tag, send a "pick up where you left off" email.

The "Email me my roadmap" button reports success only when GoHighLevel accepts the request; it does not send the email itself. The Roadmap delivery workflow does that.

## Selling it for $27 later

Swap the gate form for a GHL order form or Stripe Payment Link, then have the thank-you page redirect to `https://your-kit-url/?access=paid`. That opens the kit without the email form (the buyer's details are already in GHL from checkout). It's a light gate suited to a $27 product, not hard paywall security.

## Local preview

`npx wrangler pages dev .` runs the page and the function together at http://localhost:8788.
