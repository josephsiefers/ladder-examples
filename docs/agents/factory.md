# Software factory

GitHub Actions runs two tasks on this repo. The owner merges every PR by hand.

| Task | Trigger | What a run does | Next |
| --- | --- | --- | --- |
| Implementer (`.github/workflows/implement.yml`) | The owner adds `ready-for-agent` to a ticket | If a run already has the ticket, a PR is already open, or a blocker isn't closed, comments and stops. Otherwise builds the ticket on `agent/issue-<n>` to the Definition of done and opens a draft PR with `Closes #<n>`. If it can't, it comments on the ticket and labels it `ready-for-human`. | The PR starts the checks and a review |
| Automated review (`.github/workflows/review.yml`) | A PR opens, or the owner adds `agent-review` | Runs the code-review skill against the tickets the PR closes, posts a comment-only review, and labels the PR `review-passed` or `review-failed`. A pass marks a draft PR ready. | Nothing: the owner merges, or pushes fixes and adds `agent-review` |

The automated checks (`.github/workflows/checks.yml`) run on every PR, and branch protection requires them on `master`.

## Rules

- **Only the owner adds trigger labels** (`ready-for-agent`, `agent-review`). The factory's GitHub token is the owner's, so a workflow can't tell the owner from the factory. Runs only remove trigger labels, or add labels that start nothing: `agent-working`, `ready-for-human`, `review-passed`, `review-failed`.
- **The runner that runs Claude never holds the factory's GitHub token.** Each workflow is split into jobs, and each job gets a fresh runner. The job that runs Claude has at most a read-only `GITHUB_TOKEN`, and it hands on only text files and a git bundle. The jobs that hold the token run code from `master` only, and never run anything from the Claude job's output. No step merges. This matters because GitHub-hosted runners give passwordless `sudo`: once untrusted code runs on a runner, every later step there is exposed.
- **The review reads the PR but runs nothing from it.** Its prompts, permissions and scripts come from `master` (except `review.yml` itself, which a `pull_request` run takes from the PR branch), and Claude ignores any `.claude/` settings the PR brings. So a change to `.github/factory/` only takes effect once it is merged.
- **A run reads only what the owner wrote** on a ticket: its body and the owner's comments. The repo is public, and anyone can comment.
- **Prompts and tool permissions** live in `.github/factory/` and in the `claude` flags of each workflow. A prompt or permission change is a factory change, and gets human review like any other.
- **The implementer runs in auto mode; the review runs on its allow list alone.** In the implementer, a call the settings' allow and deny rules don't decide goes to a classifier model, which runs it or blocks it; it is never left waiting for approval. `WebSearch` and `WebFetch` are there for current docs, and are on no allow list, so the classifier judges every call. The review runs in `dontAsk` mode: a call off its allow list is refused, so the allow list is what keeps it from running the PR's code. That list is the `git` reads and `ls` in `review-settings.json`, plus the shell commands Claude Code itself treats as read-only (`cat`, `head`, `grep`, `wc`, `sed -n`). A deny list can't do that job, since `bash -c`, `sh`, `env` and other runners each get around one. The review's Write is allowed only into its out directory, its `git` calls are denied `--output` (which writes a file), and it has no web tools. Each workflow passes `--tools` with only the tools its task uses, and the settings turn off the bundled skills the prompts don't use, to keep the starting context small.

## Secrets

| Secret | Used for |
| --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code, from `claude setup-token` |
| `FACTORY_GITHUB_TOKEN` | A fine-grained personal access token for this repo only: Contents, Issues and Pull requests read/write. No Workflows permission, so runs can't change `.github/workflows/`. It expires: rotate it before then. |
| `ANTHROPIC_API_KEY` | The app's live evals. The workflow writes it to `.envrc`, which Claude is denied reading. |

The Claude job does hold `CLAUDE_CODE_OAUTH_TOKEN` and, in the implementer, `ANTHROPIC_API_KEY`. In the implementer, code Claude writes and runs (an npm script, a test) can read both. Denying Claude `.envrc` stops casual exposure, not a determined injection. The network is open, and the auto-mode classifier blocks sending secrets out, but it is a model's judgement, not a guarantee. The review runs no code and has no web tools; its one way out is the review text, which is posted on the PR. Treat both as keys you can revoke and replace; the GitHub token is the one kept out of reach.

Set them, the labels and branch protection with `scripts/setup-factory.sh`. To rotate one token, re-run it and press Enter through the stages you don't need.
