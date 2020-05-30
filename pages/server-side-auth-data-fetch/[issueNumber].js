import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Container from '../../components/container'
import PostBody from '../../components/post-body'
import MoreStories from '../../components/more-stories'
import Header from '../../components/header'
import PostHeader from '../../components/post-header'
import SectionSeparator from '../../components/section-separator'
import Layout from '../../components/layout'
import { getAllIssues, getIssueWithServerSideAccessToken } from '../../lib/api'
import PostTitle from '../../components/post-title'
import Head from 'next/head'
import {
  ONE_GRAPH_APP_ID,
  ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN,
} from '../../lib/constants'
import { serverSideAuthTokenConfigurationPrompt } from '../../lib/metaHelpers'
import markdownToHtml from '../../lib/markdownToHtml'
import { fetchOneGraph } from '../../lib/oneGraphNextClient'

export default function Post({
  post,
  morePosts,
  preview,
  isServerSideAccessTokenConfigured,
}) {
  const router = useRouter()
  if (!router.isFallback && !isServerSideAccessTokenConfigured) {
    return (
      <>
        <pre>Blah: {JSON.stringify(isServerSideAccessTokenConfigured)}</pre>
        <ErrorPage
          statusCode={511}
          title={serverSideAuthTokenConfigurationPrompt(ONE_GRAPH_APP_ID)}
        />
      </>
    )
  }
  return (
    <Layout preview={preview}>
      <div className="flex flex-col h-screen mx-auto px-5 w-4/5">
        <Header />
        {router.isFallback ? (
          <PostTitle>Loading…</PostTitle>
        ) : (
          <>
            <article>
              <Head>
                <title>
                  {post.title} | Next.js Blog Example with AuthGuardian
                </title>
                <meta
                  property="og:image"
                  content={post.repository.openGraphImageUrl}
                />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={post.repository.openGraphImageUrl}
                createdAt={post.createdAt}
                author={post.author}
              />
              <PostBody content={post.body} />
            </article>
            <SectionSeparator />
            {morePosts.length > 0 && <MoreStories posts={morePosts} />}
          </>
        )}
      </div>
    </Layout>
  )
}

export async function getStaticProps({ params, preview = false }) {
  const issue = await getIssueWithServerSideAccessToken(
    parseInt(params.issueNumber)
  )
  const isServerSideAccessTokenConfigured = !!ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN
  const content = await markdownToHtml(issue?.body || '')

  return {
    props: {
      preview,
      post: {
        ...issue,
        content,
      },
      morePosts: issue?.morePosts ?? [],
      isServerSideAccessTokenConfigured: isServerSideAccessTokenConfigured,
    },
  }
}

export async function getStaticPaths() {
  const allIssues = (await getAllIssues(100)) || []

  return {
    paths:
      allIssues?.map(
        (edge) => `/server-side-auth-data-fetch/${edge.node.number}`
      ) || [],
    fallback: true,
  }
}
