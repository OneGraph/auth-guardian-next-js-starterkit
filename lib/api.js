import {
  ONE_GRAPH_APP_ID,
  ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN,
} from '../lib/constants'
import { basicFetchOneGraph } from '../lib/oneGraphNextClient'

const operationsDoc = `
query FindMeOnVercel {
  me {
    vercel: zeit {
      id
      email
      name
      username
      billingChecked
      avatar
    }
  }
}

query GitHubIssuesQuery(
  $first: Int = 50
  $name: String = "nextjs-auth-guardian-starterkit"
  $owner: String = "sgrove"
) {
  gitHub {
    repository(name: $name, owner: $owner) {
      issues(
        first: $first
        orderBy: { field: CREATED_AT, direction: DESC }
      ) {
        totalCount
        edges {
          node {
            ...GitHubIssueFragment
          }
        }
      }
    }
  }
}

query GitHubIssueQuery(
  $name: String = "nextjs-auth-guardian-starterkit"
  $owner: String = "sgrove"
  $number: Int = 10
) {
  gitHub {
    repository(name: $name, owner: $owner) {
      issue(number: $number) {
        ...GitHubIssueFragment
      }
    }
  }
}

fragment GitHubIssueFragment on GitHubIssue {
  title
  url
  body
  id
  number 
  createdAt
  author {
    login
    avatarUrl
  }
  repository {
    openGraphImageUrl
  }
}

query FindMeOnGitHub {
  me {
    github {
      bio
      email
      databaseId
      login
      id
      name
    }
  }
}

mutation CreateGitHubIssueMutation($input: GitHubCreateIssueInput!) {
  gitHub {
    createIssue(input: $input) {
      issue {
        id
        number
        url
      }
    }
  }
}
`

export async function getAllIssues(first, repoForIssues) {
  const repo = repoForIssues || {
    name: 'nextjs-auth-guardian-starterkit',
    owner: 'sgrove',
  }
  const result = await basicFetchOneGraph(
    ONE_GRAPH_APP_ID,
    ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN,
    operationsDoc,
    { owner: repo.owner, name: repo.name, first: first },
    'GitHubIssuesQuery'
  )

  const allIssues = result.data?.gitHub?.repository?.edges

  return allIssues || null
}

export async function getIssueWithAccessToken(
  accessToken,
  number,
  repoForIssue
) {
  const repo = repoForIssue || {
    name: 'nextjs-auth-guardian-starterkit',
    owner: 'sgrove',
  }
  const result = await basicFetchOneGraph(
    ONE_GRAPH_APP_ID,
    accessToken,
    operationsDoc,
    { owner: repo.owner, name: repo.name, number: number },
    'GitHubIssueQuery'
  )

  const issue = result.data?.gitHub?.repository?.issue

  return issue || null
}

export async function getIssueWithServerSideAccessToken(number, repoForIssue) {
  return getIssueWithAccessToken(
    ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN,
    number,
    repoForIssue
  )
}

export async function findMeOnGitHub(accessToken) {
  const result = await basicFetchOneGraph(
    ONE_GRAPH_APP_ID,
    accessToken,
    operationsDoc,
    {},
    'FindMeOnGitHub'
  )

  const me = result.data?.me?.github

  return me || null
}

export async function createGitHubIssue(accessToken, issue) {
  const result = await basicFetchOneGraph(
    ONE_GRAPH_APP_ID,
    accessToken,
    operationsDoc,
    { input: issue },
    'CreateGitHubIssueMutation'
  )

  const createdIssue = result.data?.gitHub?.createIssue?.issue

  return createdIssue || null
}

export async function createGitHubIssueWithServerSideAccessToken(issue) {
  return createGitHubIssue(ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN, issue)
}

export async function findMeOnVercel(accessToken) {
  const result = await basicFetchOneGraph(
    ONE_GRAPH_APP_ID,
    accessToken,
    operationsDoc,
    {},
    'FindMeOnGitHub'
  )

  const me = result?.data?.vercel

  return me || null
}
