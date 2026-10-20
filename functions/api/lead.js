// Cloudflare Pages Function: POST /api/lead
// Sends AI Visibility Kit sign-ups, progress check-ins and completed roadmaps to GoHighLevel.
//
// Configure ONE connection in Cloudflare Pages → Settings → Variables and Secrets:
//   Option A (recommended): GHL_PIT (Private Integration token, encrypted) + GHL_LOCATION_ID
//   Option B:               GHL_WEBHOOK_URL (a GHL workflow "Inbound Webhook" trigger URL)
//
// Optional with Option A, to fill GHL custom fields (see README):
//   GHL_FIELDS = {"visibility_score":"<fieldId>","followers":"<fieldId>", ...}
//   GHL_ROADMAP_FIELD_ID = "<fieldId>"   (older single-field setting, still supported)

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const clip = (s, n) => String(s ?? "").trim().slice(0, n);
const numOrNull = (x, max = 1e9) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const GHL = "https://services.leadconnectorhq.com";
const EVENTS = ["signup", "login", "progress", "roadmap"];

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Something went wrong. Please try again." }, 400);
  }

  if (data.company) return json({ ok: true }); // honeypot: bots fill the hidden field

  const email = clip(data.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Enter a valid email address." }, 400);
  }

  const event = EVENTS.includes(data.event) ? data.event : "signup";
  const lead = {
    event,
    milestone: Boolean(data.milestone),
    first_name: clip(data.first, 80),
    email,
    phone: clip(data.phone, 40),
    instagram: clip(data.ig, 80),
    linkedin: clip(data.linkedin, 200),
    industry: clip(data.industry, 120),
    city: clip(data.city, 120),
    goal: clip(data.goal, 160),
    marketing_consent: data.consent === undefined ? undefined : Boolean(data.consent),
    // Progress
    visibility_score: numOrNull(data.score, 100),
    visibility_tier: clip(data.tier, 40),
    followers: numOrNull(data.followers),
    followers_start: numOrNull(data.followers_start),
    followers_growth: Number.isFinite(Number(data.followers_growth)) && data.followers_growth !== null ? Number(data.followers_growth) : null,
    stage: clip(data.stage, 40),
    primary_platform: clip(data.primary, 40),
    posts_logged: numOrNull(data.posts_logged, 100000),
    median_views: numOrNull(data.median_views),
    best_follow_rate: numOrNull(data.best_follow_rate, 1000),
    total_follows_from_posts: numOrNull(data.total_follows_from_posts),
    secrets_done: numOrNull(data.secrets_done, 100),
    chapters_done: numOrNull(data.chapters_done, 100),
    chapters_total: numOrNull(data.chapters_total, 100),
    logins: numOrNull(data.logins, 100000),
    chapters_completed: Array.isArray(data.chapters_completed) ? data.chapters_completed.map(String).slice(0, 20) : [],
    last_login: data.event === "login" ? new Date().toISOString() : null,
    roadmap: clip(data.roadmap, 20000),
    source: "AI Visibility Kit",
    submitted_at: new Date().toISOString(),
  };
  lead.tags = buildTags(lead);

  try {
    if (env.GHL_PIT && env.GHL_LOCATION_ID) {
      await sendViaApi(lead, env);
    } else if (env.GHL_WEBHOOK_URL) {
      const r = await fetch(env.GHL_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lead),
      });
      if (!r.ok) throw new Error(`Webhook ${r.status}`);
    } else {
      console.error("AI Visibility Kit: no GoHighLevel credentials configured");
      return json({ ok: false, error: "Lead capture isn't configured yet." }, 500);
    }
  } catch (err) {
    console.error("AI Visibility Kit lead error:", err);
    return json({ ok: false, error: "We couldn't save that right now. Please try again." }, 502);
  }

  return json({ ok: true });
}

// One tag per finished chapter, in kit order, so workflows can trigger on each step.
const CHAPTER_TAGS = {
  start: "vk-step-1-details",
  brand: "vk-step-2-signature",
  portrait: "vk-step-3-portrait",
  linkedin: "vk-step-4-linkedin",
  instagram: "vk-step-5-instagram",
  secrets: "vk-step-6-reach-secrets",
  engine: "vk-step-7-100k-engine",
  ai: "vk-step-8-found-by-ai",
  agents: "vk-step-9-growth-agents",
};

function buildTags(lead) {
  const tags = ["visibility-kit"];
  if (lead.event === "signup") tags.push("kit-signup");
  if (lead.event === "login") tags.push("kit-login");
  if (lead.event === "progress") tags.push("kit-active");
  if (lead.event === "roadmap") tags.push("kit-completed");
  if (lead.visibility_tier) tags.push(`visibility-${slug(lead.visibility_tier)}`); // e.g. visibility-magnetic
  if (lead.stage) tags.push(`followers-${slug(lead.stage)}`);                     // e.g. followers-1k-to-10k
  if (lead.followers_growth !== null && lead.followers_growth >= 1000) tags.push("kit-success-story");
  for (const id of lead.chapters_completed) if (CHAPTER_TAGS[id]) tags.push(CHAPTER_TAGS[id]);
  return tags;
}

async function sendViaApi(lead, env) {
  const headers = {
    Authorization: `Bearer ${env.GHL_PIT}`,
    Version: "2021-07-28",
    "content-type": "application/json",
    accept: "application/json",
  };

  const contact = { locationId: env.GHL_LOCATION_ID, email: lead.email, source: lead.source };
  if (lead.first_name) contact.firstName = lead.first_name;
  if (lead.phone) contact.phone = lead.phone;

  const customFields = buildCustomFields(lead, env);
  if (customFields.length) contact.customFields = customFields;

  const r = await fetch(`${GHL}/contacts/upsert`, { method: "POST", headers, body: JSON.stringify(contact) });
  if (!r.ok) throw new Error(`Upsert ${r.status}: ${await r.text()}`);
  const { contact: saved } = await r.json();
  if (!saved?.id) return;

  // Add tags without replacing the contact's existing ones.
  await fetch(`${GHL}/contacts/${saved.id}/tags`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tags: lead.tags }),
  }).catch((e) => console.error("Tags failed:", e));

  // Notes for sign-ups, completed roadmaps and milestones only, so routine check-ins don't clutter the record.
  if (lead.event === "progress" && !lead.milestone) return;

  const fmt = (n) => (n === null || n === undefined ? null : Number(n).toLocaleString("en-US"));
  const title = {
    signup: "Signed up",
    login: "Signed in",
    roadmap: "Roadmap completed",
    progress: "Milestone reached",
  }[lead.event];
  const lines = [
    `AI Visibility Kit · ${title}`,
    lead.logins !== null && `Sign-ins on this browser: ${lead.logins}`,
    lead.visibility_score !== null && `Visibility Score: ${lead.visibility_score}/100${lead.visibility_tier ? ` (${lead.visibility_tier})` : ""}`,
    lead.followers !== null && `Followers: ${fmt(lead.followers)}${lead.primary_platform ? ` on ${lead.primary_platform}` : ""}${lead.stage ? ` · stage ${lead.stage}` : ""}`,
    lead.followers_growth !== null && `Growth since starting the kit: ${lead.followers_growth >= 0 ? "+" : ""}${fmt(lead.followers_growth)} (from ${fmt(lead.followers_start)})`,
    lead.posts_logged ? [`Posts logged: ${lead.posts_logged}`, lead.median_views !== null && `median views ${fmt(lead.median_views)}`, lead.best_follow_rate !== null && `best follows per 1K views ${lead.best_follow_rate}`].filter(Boolean).join(" · ") : null,
    lead.chapters_total && `Chapters complete: ${lead.chapters_done}/${lead.chapters_total} · reach secrets in use: ${lead.secrets_done}/12`,
    lead.instagram && `Instagram: ${lead.instagram}`,
    lead.linkedin && `LinkedIn: ${lead.linkedin}`,
    lead.industry && `Industry: ${lead.industry}`,
    lead.city && `Location: ${lead.city}`,
    lead.goal && `60-day goal: ${lead.goal}`,
    lead.marketing_consent !== undefined && `Marketing consent: ${lead.marketing_consent ? "yes" : "no"}`,
    lead.roadmap && `\n${lead.roadmap}`,
  ].filter(Boolean);

  await fetch(`${GHL}/contacts/${saved.id}/notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: lines.join("\n") }),
  }).catch((e) => console.error("Note failed:", e));
}

function buildCustomFields(lead, env) {
  let map = {};
  try {
    map = env.GHL_FIELDS ? JSON.parse(env.GHL_FIELDS) : {};
  } catch {
    console.error("GHL_FIELDS is not valid JSON");
  }
  if (env.GHL_ROADMAP_FIELD_ID && !map.roadmap) map.roadmap = env.GHL_ROADMAP_FIELD_ID;

  const out = [];
  for (const [key, id] of Object.entries(map)) {
    const value = lead[key];
    if (!id || value === null || value === undefined || value === "") continue;
    out.push({ id, field_value: value });
  }
  return out;
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
