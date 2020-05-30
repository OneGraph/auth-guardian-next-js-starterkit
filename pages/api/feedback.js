import { FEEDBACK_REPO_ID } from '../../lib/constants'
import {
  createGitHubIssueWithServerSideAccessToken,
  findMeOnGitHub,
} from '../../lib/api'
import { rawAuthGuardianCookie } from '../../lib/oneGraphNextClient'

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true })
  }

  if (req.method !== 'POST') {
    res.status(501).json({
      error: {
        code: 'method_unknown',
        message: 'This endpoint only responds to POST, OPTIONS',
      },
    })
    return
  }

  const agCookie = (await rawAuthGuardianCookie(req)) || null

  // If the user submitting feedback logged into GitHub, then include some data about them in the issue body so we can thank them later
  const user = !!agCookie ? await findMeOnGitHub(agCookie) : null

  console.log('Cookie / user: ', agCookie, user)
  const rawFeedback =
    typeof req.body === 'object' ? req.body : JSON.parse(req.body)

  const backmatter = { emotion: rawFeedback.emotion || '还不错', user: user }
  const feedbackTitle = rawFeedback.title || '[No title]'
  const feedbackBody = `${rawFeedback.body}

\`\`\`next-js-metadata
${JSON.stringify(backmatter)}
\`\`\``

  const issue = {
    repositoryId: FEEDBACK_REPO_ID,
    title: feedbackTitle,
    body: feedbackBody,
  }

  const result = await createGitHubIssueWithServerSideAccessToken(issue)

  res.json({ success: !!result })
}
