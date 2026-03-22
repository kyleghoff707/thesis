# gstack Security Audit Report

**Date:** March 22, 2026
**Version audited:** 0.9.8.0
**Author:** Garry Tan (open source, GitHub)
**Audited by:** Claude Opus 4.6 — 8 parallel agents scanning every file, folder, script, and skill

---

## The Big Question: Is gstack stealing my data?

**No.** gstack does not send your source code, project files, API keys, or any sensitive data to its own servers. Your code stays on your machine.

That said, it's not completely hands-off. There are a few things worth knowing about, ranked from most important to least.

---

## Where gstack lives on your computer

| Location | What's there | Size |
|----------|-------------|------|
| `~/.claude/skills/gstack/` | All 45 skills, their source code, tests, docs, and a headless browser | 172 MB |
| `~/.gstack/` | Settings, a small usage log, project metadata | 52 KB |
| Project `.gstack/` folder | Screenshots and logs from QA/design testing you've run | 17 MB |

---

## Findings (ranked by importance)

### 1. The /codex skill sends your code to OpenAI

**What it is:** The `/codex` skill calls OpenAI's Codex AI to get a "second opinion" on your code. When you use it, your code changes (the diff) get sent to OpenAI's servers.

**When it happens:** Only if you have the Codex CLI tool installed on your computer AND you invoke `/codex`, `/review` (on large diffs), or `/ship` (which can trigger a Codex review automatically).

**Is it a problem?** If you don't want your code going to OpenAI, yes. But it only fires if you have Codex installed — which you likely don't.

**How to check/fix:**
- Run `which codex` in your terminal. If it says "not found," you're fine — nothing is being sent.
- To be extra safe: `gstack-config set codex_reviews disabled`

---

### 2. There's a telemetry system (currently turned OFF for you)

**What it is:** gstack has a system that can send anonymous usage stats (which skills you use, how long they take, your operating system) to a database run by the gstack author.

**Your current status: OFF.** Your config file (`~/.gstack/config.yaml`) says `telemetry: off`. Nothing is being sent.

**The catch:** Even with telemetry off, gstack still writes a small local log file (`~/.gstack/analytics/skill-usage.jsonl`) every time you use a skill. It records which skill you ran, when, and the name of the project folder (just "stock-analyzer", not the full path or any code). This file stays on your computer — it's never sent anywhere while telemetry is off.

**What would be sent if you turned it on:**
- Skill name (e.g., "qa", "ship")
- How long it ran
- Whether it succeeded or failed
- Your operating system and gstack version
- Optionally, a scrambled ID based on your computer name (community tier only)

**What is NEVER sent, even if telemetry is on:**
- Your code
- Your file names or paths
- Your API keys
- Your project name (stripped before sending)
- Your git branch name (stripped before sending)

**Heads up — dark pattern alert:** The first time you run a gstack skill, it will ask you to opt in to telemetry. The prompt makes you say "no" twice to fully opt out (first declining "community," then declining "anonymous"). To skip this entirely, run: `touch ~/.gstack/.telemetry-prompted`

---

### 3. The /browse skill is a full web browser

**What it is:** gstack includes a headless (invisible) web browser built on Chromium. It's used by `/browse`, `/qa`, `/design-review`, and `/canary` to test your app by navigating to it, clicking things, and taking screenshots.

**Why it matters:** This browser can go to any URL, fill in forms, run JavaScript, and even import cookies from your real browsers (Chrome, Arc, Brave, Edge). It's powerful.

**Is it a problem?** Not right now. The skill instructions only tell it to visit URLs you specify (usually localhost for testing). There's no evidence it's being directed to send data anywhere. But if the skill files were ever tampered with, this tool could theoretically be misused.

**Bottom line:** It's a legitimate QA tool, but be aware it exists and has full browser capabilities.

---

### 4. gstack checks for updates by pinging GitHub

**What it is:** Every time you use a gstack skill (cached for 60 minutes), it fetches a tiny file from GitHub to check if there's a newer version. This tells GitHub your IP address and that you're using gstack.

**Is it a problem?** Minor. This is standard behavior for most developer tools. It doesn't send any of your data.

**How to turn it off:** `gstack-config set update_check false`

---

### 5. The /ship skill auto-commits everything

**What it is:** When you run `/ship`, it eventually runs `git add -A` which stages ALL files in your project — including any untracked files that might be sensitive (like `.env` files with API keys).

**Is it a problem?** Only if you have sensitive files that aren't in your `.gitignore`. Check your `.gitignore` to make sure files like `.env.local` are listed (yours already is).

**Bottom line:** Make sure your `.gitignore` is solid before using `/ship`.

---

### 6. Two scripts use `eval` (a mildly risky coding pattern)

**What it is:** Two small helper scripts (`gstack-review-log` and `gstack-review-read`) use a shell command called `eval` that executes the output of another script. In theory, a maliciously crafted git remote URL could inject commands here.

**Is it a problem?** Practically, no. The input is sanitized and would require someone to compromise your git remote URL. But it's sloppy coding practice.

---

## Things that are completely clean

- **No malicious dependencies.** Only 8 packages installed, all well-known (Playwright by Microsoft, the official Anthropic SDK, etc.). None of them run code during installation.
- **No hidden code.** Everything is readable — plain shell scripts and markdown files. No compiled binaries hiding behavior, no encoded/encrypted strings.
- **No prompt injection.** The skill files don't secretly tell Claude to do anything sketchy. They nudge Claude to suggest other gstack skills (which can be annoying), but that's a UX choice, not a security issue.
- **No credential theft.** gstack never reads your `.env` files, never accesses your keychain (except cookie import which shows a macOS permission dialog), and never touches your API keys.
- **The safety skills (freeze, careful, guard) only restrict what Claude can do** — they never expand permissions.
- **The database key that's visible in gstack's code** is a public/read-only key (like a Firebase config) that can only insert telemetry records. It can't read other users' data or do anything harmful.

---

## Recommended actions

| Action | Why | How |
|--------|-----|-----|
| Block the telemetry first-run prompt | Avoid the dark-pattern opt-in flow | `touch ~/.gstack/.telemetry-prompted` |
| Disable update checks (optional) | Stop the GitHub ping every 60 min | `gstack-config set update_check false` |
| Disable Codex reviews | Prevent code from going to OpenAI if Codex is ever installed | `gstack-config set codex_reviews disabled` |
| Periodically delete the local log | Clean up the usage log that writes even with telemetry off | `rm ~/.gstack/analytics/skill-usage.jsonl` |
| Keep your .gitignore solid | Prevent `/ship` from staging sensitive files | Already looks good for this project |

---

## The macOS popup during the audit

During this audit, macOS showed a "VS Code would like to access data from other apps" dialog. This was triggered by the audit agents scanning directories aggressively — not by gstack doing anything shady. It's a standard VS Code permission for reading files across app boundaries. Safe to allow; you can manage it later in System Settings > Privacy & Security.

---

## Final verdict

**gstack is not "the product is you" software.** It's a developer workflow tool that operates locally. The telemetry system is opt-in and currently off. The only way your code leaves your machine is through `/codex` (which calls OpenAI) — and that requires a separate tool to be installed.

The main things to watch for: the local usage logging that ignores the "off" setting (minor), the telemetry opt-in dark pattern (annoying), and the `/ship` auto-commit behavior (manageable with a good `.gitignore`).

**Risk level: Low.** Use the recommended actions above for extra peace of mind.
