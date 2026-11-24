# Software factory

GitHub Actions runs two tasks on this repo. The owner merges every PR by hand.

| Task | Trigger | What a run does | Next |
| --- | --- | --- | --- |
| Implementer (`.github/workflows/implement.yml`) | The owner adds `ready-for-agent` to a ticket | If a PR is already open or a blocker isn't closed, comments and stops. Otherwise builds the ticket on `agent/issue-<n>` to the Definition of done and opens a draft PR with `Closes #<n>`. If it can't, it comments on the ticket and labels it `ready-for-human`. | The PR starts the checks and a review |
| Automated review (`.github/workflows/review.yml`) | A PR opens, or the owner adds `agent-review` | Runs the code-review skill against the tickets the PR closes, posts a comment-only review, and labels the PR `review-passed` or `review-failed`. A pass marks a draft PR ready. | Nothing: the owner merges, or pushes fixes and adds `agent-review` |

The automated checks (`.github/workflows/checks.yml`) run on every PR, and branch protection requires them on `master`.

## Rules

- **Only the owner adds trigger labels** (`ready-for-agent`, `agent-review`). The factory's GitHub token is the owner's, so a workflow can't tell the owner from the factory. Runs only remove trigger labels, or add labels that start nothing: `agent-working`, `ready-for-human`, `review-passed`, `review-failed`.
- **Claude holds no GitHub token in a run.** It reads the ticket from a file and leaves its outcome in files, and the workflow's own steps do every GitHub write. No step merges.
- **A run reads only what the owner wrote** on a ticket: its body and the owner's comments. The repo is public, and anyone can comment.
- **Prompts and tool permissions** live in `.github/factory/`. A prompt or permission change is a factory change, and gets human review like any other.

## Secrets

| Secret | Used for |
| --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code, from `claude setup-token` |
| `FACTORY_GITHUB_TOKEN` | A fine-grained personal access token for this repo only: Contents, Issues and Pull requests read/write. No Workflows permission, so runs can't change `.github/workflows/`. It expires: rotate it before then. |
| `ANTHROPIC_API_KEY` | The app's live evals. The workflow writes it to `.envrc`, which Claude is denied reading. |

Set them, the labels and branch protection with `scripts/setup-factory.sh`. To rotate one token, re-run it and press Enter through the stages you don't need.
