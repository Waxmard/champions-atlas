#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  list)
    gh api graphql \
      -f owner="${GITHUB_REPOSITORY%/*}" \
      -f name="${GITHUB_REPOSITORY#*/}" \
      -F number="$2" \
      -f query='
        query($owner: String!, $name: String!, $number: Int!) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  isOutdated
                  path
                  line
                  comments(first: 20) { nodes { author { login } body } }
                }
              }
            }
          }
        }' \
      --jq '.data.repository.pullRequest.reviewThreads.nodes[]
        | select(.isResolved | not)
        | {id, path, line, isOutdated, comments: [.comments.nodes[] | {author: .author.login, body}]}'
    ;;
  resolve)
    gh api graphql -f id="$2" -f query='
      mutation($id: ID!) {
        resolveReviewThread(input: {threadId: $id}) { thread { isResolved } }
      }'
    ;;
  *)
    echo "usage: $0 list <pr-number> | resolve <thread-id>" >&2
    exit 2
    ;;
esac
