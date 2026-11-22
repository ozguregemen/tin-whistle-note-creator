// Moderator command line for the community Worker. Not part of any app bundle.
// The token is the Worker's MODERATOR_TOKEN secret; keep it out of the repository.
//
//   $env:TWNC_MODERATOR_TOKEN = "<token>"
//   npm run moderate -- <worker-url> reports [resolved]
//   npm run moderate -- <worker-url> hide|restore|delete <song-id>
//   npm run moderate -- <worker-url> resolve <report-id>
//   npm run moderate -- <worker-url> suspend|unsuspend <username>
const [base = "", command = "", argument = ""] = process.argv.slice(2);
const token = process.env.TWNC_MODERATOR_TOKEN;
if (!/^https?:\/\//.test(base) || !command || !token) {
  console.error("Usage: TWNC_MODERATOR_TOKEN=... node scripts/community-moderate.mjs <worker-url> <command> [argument]");
  process.exit(2);
}

const routes = {
  reports: () => ["GET", `moderation/reports${argument === "resolved" ? "?status=resolved" : ""}`],
  hide: () => ["POST", `moderation/songs/${argument}/hide`],
  restore: () => ["POST", `moderation/songs/${argument}/restore`],
  delete: () => ["DELETE", `moderation/songs/${argument}`],
  resolve: () => ["POST", `moderation/reports/${argument}/resolve`],
  suspend: () => ["POST", `moderation/users/${encodeURIComponent(argument)}/suspend`],
  unsuspend: () => ["POST", `moderation/users/${encodeURIComponent(argument)}/unsuspend`],
};
if (!routes[command] || (command !== "reports" && !argument)) {
  console.error(`Unknown command or missing argument. Commands: ${Object.keys(routes).join(", ")}`);
  process.exit(2);
}

const [method, path] = routes[command]();
const response = await fetch(`${base.replace(/\/$/, "")}/api/community/${path}`, {
  method, headers: { "X-Moderator-Token": token, Accept: "application/json" },
});
const text = await response.text();
if (!response.ok) {
  console.error(`${response.status} ${text}`);
  process.exit(1);
}
if (command !== "reports") {
  console.log(`${command} ${argument}: done`);
} else {
  const { reports } = JSON.parse(text);
  if (!reports.length) console.log("No reports.");
  for (const report of reports) {
    const when = new Date(report.created_at).toISOString().slice(0, 16).replace("T", " ");
    const target = report.song_id ? `song ${report.song_id} "${report.song_title}"${report.hidden_at ? " [hidden]" : ""}` : `user @${report.reported_user}`;
    console.log(`${report.id}  ${when}  ${report.reason.padEnd(10)}  ${target}  by @${report.reporter}${report.note ? `\n    ${report.note}` : ""}`);
  }
}
