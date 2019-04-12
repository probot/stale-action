workflow "Run Stale!" {
  on = "schedule(0 0 * * *)"
  resolves = ["probot/stale-action"]
}

action "probot/stale-action" {
  uses = "probot/stale-action@master"
  secrets = ["GITHUB_TOKEN"]
}

workflow "On issue comments" {
  on = "issue_comment"
  resolves = ["probot/stale-action@master - issue_comment"]
}

action "probot/stale-action - issue_comment" {
  uses = "probot/stale-action@master"
  secrets = ["GITHUB_TOKEN"]
}

workflow "On pull request" {
  on = "pull_request"
  resolves = ["probot/stale-action@master - PR"]
}

action "probot/stale-action - PR" {
  uses = "probot/stale-action@master"
  secrets = ["GITHUB_TOKEN"]
}
