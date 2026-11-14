// Run locally with an authenticated GitHub CLI, or GITHUB_TOKEN in Actions.
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { THEMES } from "./card-theme.mjs";

const username = process.argv[2] || process.env.PROFILE_USERNAME || "Marlon-Chaviano";
const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

async function fetchCalendar() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  let result;
  if (token) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ query, variables: { login: username } }),
    });
    if (!response.ok) throw new Error(`GitHub API responded ${response.status}`);
    result = await response.json();
  } else {
    result = JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${query}`, "-f", `login=${username}`], {
      encoding: "utf8", timeout: 30_000,
    }));
  }
  if (result.errors?.length || !result.data?.user) {
    throw new Error(`GitHub API error: ${JSON.stringify(result.errors || "user not found")}`);
  }
  return result.data.user.contributionsCollection.contributionCalendar;
}

const esc = (s) => String(s).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => n.toLocaleString("en-US");
const levels = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function render(calendar, t) {
  const days = calendar.weeks.flatMap((w) => w.contributionDays);
  const active = days.filter((d) => d.contributionCount > 0).length;
  let streak = 0, best = 0;
  for (const day of days) {
    streak = day.contributionCount ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  const step = 13, cell = 10, top = 132;
  const gridX = 828 - (calendar.weeks.length * step - (step - cell));
  let lastMonth = -1;
  const labels = [];
  const cells = calendar.weeks.map((week, col) => {
    const month = new Date(`${week.contributionDays[0].date}T00:00:00Z`).getUTCMonth();
    if (month !== lastMonth && col < calendar.weeks.length - 2) {
      labels.push(`<text x="${gridX + col * step}" y="${top - 10}" class="tiny">${months[month]}</text>`);
      lastMonth = month;
    }
    return week.contributionDays.map((d) => {
      const row = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      return `<rect x="${gridX + col * step}" y="${top + row * step}" width="${cell}" height="${cell}" rx="2.5" fill="${t.heat[levels.indexOf(d.contributionLevel)]}"><title>${d.date}: ${d.contributionCount} contributions</title></rect>`;
    }).join("");
  }).join("");
  const legendX = 731;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="274" viewBox="0 0 860 274" role="img" aria-labelledby="title desc">
  <title id="title">${esc(username)} on GitHub</title>
  <desc id="desc">${fmt(calendar.totalContributions)} contributions in the past year, ${active} active days, and a best streak of ${best} days.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif; fill: ${t.text}; font-variant-numeric: tabular-nums; }
    .title { font-size: 17px; font-weight: 600; }
    .handle { font-size: 13px; fill: ${t.muted}; }
    .label { font-size: 12px; fill: ${t.muted}; font-weight: 500; }
    .big { font-size: 26px; font-weight: 600; }
    .tiny { font-size: 10px; fill: ${t.muted}; }
  </style>
  <rect x=".5" y=".5" width="859" height="273" rx="12" fill="${t.bg}" stroke="${t.border}"/>
  <g transform="translate(32 26)" fill="${t.accent}"><path d="M12 .5C5.63.5.5 5.63.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.23c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.18 1.77 1.18 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 0 1 5.75 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.08 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.79.56A11.5 11.5 0 0 0 23.5 12C23.5 5.63 18.37.5 12 .5Z"/></g>
  <text x="64" y="44" class="title">GitHub</text>
  <text x="152" y="44" class="handle">@${esc(username)}</text>
  <text x="828" y="44" class="handle" text-anchor="end">Past 12 months</text>
  <line x1="32" y1="68" x2="828" y2="68" stroke="${t.divider}"/>
  <text x="32" y="107" class="label">Contributions</text>
  <text x="32" y="143" class="big">${fmt(calendar.totalContributions)}</text>
  <text x="32" y="176" class="label">${active} active days</text>
  <text x="32" y="197" class="label">${best}d best streak</text>
  ${labels.join("")}${cells}
  <text x="32" y="249" class="tiny">Updated ${new Date().toISOString().slice(0, 10)}</text>
  <text x="${legendX - 6}" y="249" class="tiny" text-anchor="end">Less</text>
  ${t.heat.map((c, i) => `<rect x="${legendX + i * step}" y="240" width="10" height="10" rx="2.5" fill="${c}"/>`).join("")}
  <text x="${legendX + 5 * step + 3}" y="249" class="tiny">More</text>
</svg>\n`;
}

const calendar = await fetchCalendar();
for (const [name, theme] of Object.entries(THEMES)) {
  const file = new URL(`../assets/github-${name}.svg`, import.meta.url);
  await writeFile(file, render(calendar, theme));
  console.log(`wrote ${file.pathname}`);
}
