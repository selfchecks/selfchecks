export const checklyConfig = `import { defineConfig } from "checkly";
import { Frequency } from "checkly/constructs";

export default defineConfig({
  projectName: "My checks",
  logicalId: "my-checks",
  checks: {
    activated: true,
    runtimeId: "2025.04",
    frequency: Frequency.EVERY_10M,
    locations: ["eu-west-1"],
    checkMatch: "**/*.check.ts",
    browserChecks: {
      testMatch: "**/*.spec.ts",
    },
  },
});`;

export const apiManifest = `import { ApiCheck, Frequency } from "checkly/constructs";

new ApiCheck("api-health", {
  name: "API health",
  activated: true,
  tags: ["smoke", "api"],
  frequency: Frequency.EVERY_5M,
  request: {
    method: "GET",
    url: "{{ENVIRONMENT_URL}}/api/health",
    headers: {
      accept: "application/json",
    },
  },
});`;

export const gitlabCi = `stages:
  - test
  - deploy

default:
  image:
    name: ghcr.io/selfchecks/selfchecks-cli:stable
    entrypoint: [""]

selfchecks:test:
  stage: test
  script:
    - >-
      selfchecks test
      --project "$CI_PROJECT_PATH_SLUG"
      --root .
      --record
      --reporter list
      --test-session-name "GitLab #$CI_PIPELINE_IID"
      --repository "$CI_PROJECT_PATH"
      --ref "$CI_COMMIT_REF_NAME"
      --commit-sha "$CI_COMMIT_SHA"
      --pipeline-url "$CI_PIPELINE_URL"
      --job-url "$CI_JOB_URL"
      -e "ENVIRONMENT_URL=$ENVIRONMENT_URL"
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'

selfchecks:deploy:
  stage: deploy
  needs: ["selfchecks:test"]
  script:
    - selfchecks deploy --project "$CI_PROJECT_PATH_SLUG" --root .
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'`;

export const githubActions = `name: SelfChecks

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    container: ghcr.io/selfchecks/selfchecks-cli:stable
    env:
      SELFCHECKS_URL: \${{ vars.SELFCHECKS_URL }}
      SELFCHECKS_API_TOKEN: \${{ secrets.SELFCHECKS_API_TOKEN }}
      ENVIRONMENT_URL: \${{ vars.ENVIRONMENT_URL }}
    steps:
      - uses: actions/checkout@v6
      - name: Run SelfChecks
        run: >-
          selfchecks test
          --project "$GITHUB_REPOSITORY"
          --root .
          --record
          --reporter github
          --test-session-name "GitHub #$GITHUB_RUN_NUMBER"
          --repository "$GITHUB_REPOSITORY"
          --ref "$GITHUB_REF_NAME"
          --commit-sha "$GITHUB_SHA"
          --pipeline-url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
          -e "ENVIRONMENT_URL=$ENVIRONMENT_URL"

  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    container: ghcr.io/selfchecks/selfchecks-cli:stable
    env:
      SELFCHECKS_URL: \${{ vars.SELFCHECKS_URL }}
      SELFCHECKS_API_TOKEN: \${{ secrets.SELFCHECKS_API_TOKEN }}
    steps:
      - uses: actions/checkout@v6
      - run: selfchecks deploy --project "$GITHUB_REPOSITORY" --root .`;
