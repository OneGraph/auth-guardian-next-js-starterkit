import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Container from '../../components/container'
import PostBody from '../../components/post-body'
import MoreStories from '../../components/more-stories'
import Header from '../../components/header'
import PostHeader from '../../components/post-header'
import SectionSeparator from '../../components/section-separator'
import Layout from '../../components/layout'
import {
  findMeOnGitHub,
  getAllIssues,
  getIssueWithAccessToken,
  getIssueWithServerSideAccessToken,
} from '../../lib/api'
import PostTitle from '../../components/post-title'
import Head from 'next/head'
import { CMS_NAME, ONE_GRAPH_APP_ID } from '../../lib/constants'
import markdownToHtml from '../../lib/markdownToHtml'
import {
  extractAuthGuardianCookie,
  fetchOneGraph,
  rawAuthGuardianCookie,
  requireUserLoggedIn,
  makeLoggedInError,
} from '../../lib/oneGraphNextClient'

export default function Post({ post, me, isLoggedIn }) {
  const router = useRouter()
  if (!isLoggedIn) {
    return makeLoggedInError('GitHub')
  }
  if (!router.isFallback && !post?.number) {
    return <ErrorPage statusCode={404} />
  }
  return (
    <Layout>
      <div className="flex flex-col h-screen mx-auto px-5 w-4/5">
        <Header />
        {router.isFallback ? (
          <PostTitle>Loading…</PostTitle>
        ) : (
          <>
            <article>
              <Head>
                <title>
                  {post.title} | Next.js Blog Example with {CMS_NAME}
                </title>
                <meta
                  property="og:image"
                  content={post.repository.openGraphImageUrl}
                />
              </Head>
              {!!me ? (
                <quote>
                  (I fetched this GitHub issue on your behalf,{' '}
                  {me?.name || me?.login})
                </quote>
              ) : (
                <quote>
                  I fetched this using the server-side auth token since you're
                  logged into services other than GitHub
                </quote>
              )}{' '}
              <PostHeader
                title={post.title}
                coverImage={post.repository.openGraphImageUrl}
                createdAt={post.createdAt}
                author={post.author}
              />
              <PostBody content={post.body} />
            </article>
            <SectionSeparator />
          </>
        )}
      </div>
    </Layout>
  )
}

export async function getServerSideProps(ctx) {
  const agCookie = (await extractAuthGuardianCookie(ctx)) || null

  const { userId } = requireUserLoggedIn(agCookie)

  const isLoggedIn = !!userId
  const rawAgCookie = rawAuthGuardianCookie(ctx) || null

  // First try to get the issue using the logged-in user's GitHub token
  let issue = isLoggedIn
    ? await getIssueWithAccessToken(
        rawAgCookie,
        parseInt(ctx.params.issueNumber)
      )
    : null

  // If they've logged into services *other* than GitHub, then use our server-side auth token to get the issue
  if (!issue && isLoggedIn) {
    issue = await getIssueWithServerSideAccessToken(
      parseInt(ctx.params.issueNumber)
    )
  }

  const me = isLoggedIn ? await findMeOnGitHub(rawAgCookie) : null

  const content = await markdownToHtml(issue?.body || '')

  return {
    props: {
      isLoggedIn,
      me,
      post: {
        ...issue,
        content,
      },
    },
  }
}
