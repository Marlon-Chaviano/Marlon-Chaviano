// Generates assets/leetcode-dark.svg and assets/leetcode-light.svg from the
// public LeetCode GraphQL API. Run with: node scripts/leetcode-card.mjs [username]

import { writeFile } from "node:fs/promises";

const USERNAME = process.argv[2] || process.env.LEETCODE_USERNAME || "Marlon-Chaviano";
const OUT_DIR = new URL("../assets/", import.meta.url);

const QUERY = `
query($u: String!, $year: Int!, $previousYear: Int!) {
  allQuestionsCount { difficulty count }
  matchedUser(username: $u) {
    profile { ranking }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    languageProblemCount { languageName problemsSolved }
    userCalendar(year: $year) { streak totalActiveDays submissionCalendar }
    previousCalendar: userCalendar(year: $previousYear) { submissionCalendar }
  }
}`;

const LOGO =
  "M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523 2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z";

import { THEMES } from "./card-theme.mjs";

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86400;

async function fetchStats(username) {
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: `https://leetcode.com/u/${username}/`,
      "User-Agent": "Mozilla/5.0 (github-profile-card)",
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ query: QUERY, variables: { u: username, year: new Date().getUTCFullYear(), previousYear: new Date().getUTCFullYear() - 1 } }),
  });
  if (!res.ok) throw new Error(`LeetCode API responded ${res.status}`);
  const { data, errors } = await res.json();
  if (errors?.length || !data?.matchedUser) {
    throw new Error(`LeetCode API error: ${JSON.stringify(errors ?? "user not found")}`);
  }

  const byDifficulty = (rows) => Object.fromEntries(rows.map((r) => [r.difficulty, r.count]));
  const user = data.matchedUser;
  return {
    username,
    totals: byDifficulty(data.allQuestionsCount),
    solved: byDifficulty(user.submitStatsGlobal.acSubmissionNum),
    ranking: user.profile.ranking,
    activeDays: user.userCalendar.totalActiveDays,
    maxStreak: user.userCalendar.streak,
    languages: [...user.languageProblemCount]
      .sort((a, b) => b.problemsSolved - a.problemsSolved)
      .slice(0, 3),
    calendar: {
      ...JSON.parse(user.previousCalendar.submissionCalendar || "{}"),
      ...JSON.parse(user.userCalendar.submissionCalendar || "{}"),
    },
  };
}

const fmt = (n) => n.toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Last 53 weeks of daily submission counts, Sunday-first columns ending on today (UTC).
function buildHeatmap(calendar) {
  const counts = new Map(Object.entries(calendar).map(([ts, n]) => [Math.floor(Number(ts) / DAY), n]));
  const today = Math.floor(Date.now() / 1000 / DAY);
  const todayDow = new Date(today * DAY * 1000).getUTCDay();
  const start = today - todayDow - 52 * 7;
  const days = [];
  for (let d = start; d <= today; d++) days.push({ day: d, count: counts.get(d) || 0 });
  return days;
}

function heatLevel(count, max) {
  if (count === 0) return 0;
  const r = count / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

function arc(cx, cy, r, startFrac, endFrac) {
  const a0 = 2 * Math.PI * startFrac - Math.PI / 2;
  const a1 = 2 * Math.PI * endFrac - Math.PI / 2;
  const large = endFrac - startFrac > 0.5 ? 1 : 0;
  const p = (a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}`;
}

function render(stats, t) {
  const W = 860;
  const H = 432;
  const PAD = 32;

  // Donut: share of solved problems by difficulty.
  const cx = PAD + 72;
  const cy = 162;
  const r = 62;
  const diffs = [
    { key: "Easy", color: t.easy },
    { key: "Medium", color: t.medium },
    { key: "Hard", color: t.hard },
  ];
  const solvedTotal = stats.solved.All || 0;
  const gap = solvedTotal ? 0.012 : 0;
  let cursor = 0;
  const segments = diffs
    .map((d, i) => {
      const frac = solvedTotal ? stats.solved[d.key] / solvedTotal : 0;
      const from = cursor + gap / 2;
      const to = cursor + frac - gap / 2;
      cursor += frac;
      if (to <= from) return "";
      return `<path class="seg" style="animation-delay:${0.15 + i * 0.15}s" d="${arc(cx, cy, r, from, to)}" stroke="${d.color}" stroke-width="10" stroke-linecap="round" fill="none" pathLength="1"/>`;
    })
    .join("");

  // Difficulty bars: solved vs. available problems.
  const barX = 236;
  const barW = 250;
  const bars = diffs
    .map((d, i) => {
      const y = 112 + i * 48;
      const solved = stats.solved[d.key] || 0;
      const total = stats.totals[d.key] || 1;
      const w = solved ? Math.max(4, (solved / total) * barW) : 0;
      return `
    <g class="fade" style="animation-delay:${0.2 + i * 0.1}s">
      <text x="${barX}" y="${y}" class="label">${d.key}</text>
      <text x="${barX + barW}" y="${y}" class="value" text-anchor="end"><tspan class="strong">${fmt(solved)}</tspan><tspan class="muted" dx="4">/ ${fmt(total)}</tspan></text>
      <rect x="${barX}" y="${y + 10}" width="${barW}" height="6" rx="3" fill="${t.track}"/>
      <rect class="bar" style="animation-delay:${0.35 + i * 0.12}s" x="${barX}" y="${y + 10}" width="${w.toFixed(1)}" height="6" rx="3" fill="${d.color}"/>
    </g>`;
    })
    .join("");

  // Stat tiles + languages column.
  const colX = 534;
  const tiles = [
    { label: "Active days", value: fmt(stats.activeDays) },
    { label: "Max streak", value: `${fmt(stats.maxStreak)}d` },
  ]
    .map(
      (s, i) => `
    <g class="fade" style="animation-delay:${0.25 + i * 0.1}s">
      <text x="${colX + i * 150}" y="112" class="label">${s.label}</text>
      <text x="${colX + i * 150}" y="142" class="big">${s.value}</text>
    </g>`,
    )
    .join("");

  const langMax = stats.languages[0]?.problemsSolved || 1;
  const languages = stats.languages
    .map((l, i) => {
      const y = 186 + i * 22;
      const w = l.problemsSolved ? Math.max(3, (l.problemsSolved / langMax) * 110) : 0;
      return `
    <g class="fade" style="animation-delay:${0.4 + i * 0.08}s">
      <text x="${colX}" y="${y}" class="small">${esc(l.languageName.replace(/^Python3$/, "Python"))}</text>
      <rect x="${colX + 92}" y="${y - 8}" width="${w.toFixed(1)}" height="8" rx="2" fill="${t.accent}" opacity="${1 - i * 0.25}"/>
      <text x="${W - PAD}" y="${y}" class="small strong" text-anchor="end">${fmt(l.problemsSolved)}</text>
    </g>`;
    })
    .join("");

  // Heatmap.
  const days = buildHeatmap(stats.calendar);
  const max = Math.max(1, ...days.map((d) => d.count));
  const yearSubs = days.reduce((s, d) => s + d.count, 0);
  const cell = 10;
  const step = 13;
  const gridTop = 290;
  const weeks = Math.ceil(days.length / 7);
  const hmX = W - PAD - (weeks * step - (step - cell));
  const cells = days
    .map((d, i) => {
      const col = Math.floor(i / 7);
      const row = i % 7;
      return `<rect x="${hmX + col * step}" y="${gridTop + row * step}" width="${cell}" height="${cell}" rx="2.5" fill="${t.heat[heatLevel(d.count, max)]}"><title>${new Date(d.day * DAY * 1000).toISOString().slice(0, 10)}: ${d.count} submissions</title></rect>`;
    })
    .join("");

  let lastMonth = -1;
  const monthLabels = [];
  for (let col = 0; col < weeks; col++) {
    const first = days[col * 7];
    const m = new Date(first.day * DAY * 1000).getUTCMonth();
    if (m !== lastMonth && col < weeks - 2) {
      if (lastMonth !== -1 || new Date(first.day * DAY * 1000).getUTCDate() <= 7) {
        monthLabels.push(`<text x="${hmX + col * step}" y="${gridTop - 8}" class="tiny">${MONTHS[m]}</text>`);
      }
      lastMonth = m;
    }
  }

  const legendX = W - PAD - 32 - 5 * step;
  const legend = t.heat
    .map((c, i) => `<rect x="${legendX + i * step}" y="${H - 34}" width="${cell}" height="${cell}" rx="2.5" fill="${c}"/>`)
    .join("");

  const updated = new Date().toISOString().slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(stats.username)} on LeetCode</title>
  <desc id="desc">${fmt(solvedTotal)} problems solved: ${stats.solved.Easy} easy, ${stats.solved.Medium} medium, ${stats.solved.Hard} hard. Global rank ${fmt(stats.ranking)}.</desc>
  <style>
    text { font-family: ${FONT}; fill: ${t.text}; font-variant-numeric: tabular-nums; }
    .title { font-size: 17px; font-weight: 600; }
    .handle { font-size: 13px; fill: ${t.muted}; }
    .label { font-size: 12px; fill: ${t.muted}; font-weight: 500; letter-spacing: .2px; }
    .value { font-size: 13px; }
    .strong { font-weight: 600; fill: ${t.text}; }
    .muted { fill: ${t.muted}; }
    .big { font-size: 26px; font-weight: 600; }
    .hero { font-size: 32px; font-weight: 700; }
    .small { font-size: 12px; }
    .tiny { font-size: 10px; fill: ${t.muted}; }
    .fade { opacity: 1; animation: fade .6s ease-out forwards; }
    .seg { stroke-dasharray: 1; stroke-dashoffset: 0; animation: draw .9s cubic-bezier(.2,.7,.2,1) forwards; }
    .bar { transform-box: fill-box; transform-origin: left; transform: scaleX(1); animation: grow .8s cubic-bezier(.2,.7,.2,1) forwards; }
    @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @keyframes draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
    @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @media (prefers-reduced-motion: reduce) {
      .fade, .seg, .bar { animation: none; opacity: 1; stroke-dashoffset: 0; transform: none; }
    }
  </style>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>

  <!-- Header -->
  <g transform="translate(${PAD} 26) scale(0.92)"><path d="${LOGO}" fill="${t.accent}"/></g>
  <text x="${PAD + 32}" y="44" class="title">LeetCode</text>
  <text x="${PAD + 120}" y="44" class="handle">@${esc(stats.username)}</text>
  <text x="${W - PAD}" y="44" class="handle" text-anchor="end">Global rank <tspan class="strong">#${fmt(stats.ranking)}</tspan></text>
  <line x1="${PAD}" y1="68" x2="${W - PAD}" y2="68" stroke="${t.divider}"/>

  <!-- Donut -->
  <circle cx="${cx}" cy="${cy}" r="${r}" stroke="${t.track}" stroke-width="10" fill="none"/>
  ${segments}
  <text x="${cx}" y="${cy + 6}" class="hero" text-anchor="middle">${fmt(solvedTotal)}</text>
  <text x="${cx}" y="${cy + 26}" class="label" text-anchor="middle">solved</text>

  <!-- Difficulty -->
  ${bars}

  <line x1="${colX - 24}" y1="96" x2="${colX - 24}" y2="232" stroke="${t.divider}"/>

  <!-- Stats -->
  ${tiles}
  ${languages}

  <!-- Activity -->
  <line x1="${PAD}" y1="256" x2="${W - PAD}" y2="256" stroke="${t.divider}"/>
  <g class="fade" style="animation-delay:.5s">
    <text x="${PAD}" y="${gridTop + 2}" class="label">Activity</text>
    <text x="${PAD}" y="${gridTop + 34}" class="big">${fmt(yearSubs)}</text>
    <text x="${PAD}" y="${gridTop + 54}" class="small muted">submissions</text>
    <text x="${PAD}" y="${gridTop + 70}" class="small muted">past 53 weeks</text>
    ${monthLabels.join("")}
    ${cells}
  </g>

  <text x="${PAD}" y="${H - 25}" class="tiny">Updated ${updated}</text>
  <text x="${legendX - 6}" y="${H - 25}" class="tiny" text-anchor="end">Less</text>
  ${legend}
  <text x="${legendX + 5 * step + 3}" y="${H - 25}" class="tiny">More</text>
</svg>
`;
}

const stats = await fetchStats(USERNAME);
for (const [name, theme] of Object.entries(THEMES)) {
  const file = new URL(`leetcode-${name}.svg`, OUT_DIR);
  await writeFile(file, render(stats, theme));
  console.log(`wrote ${file.pathname}`);
}
