import Container from '../components/container'
import MoreStories from '../components/more-stories'
import HeroPost from '../components/hero-post'
import Intro from '../components/intro'
import Layout from '../components/layout'
import { getAllPostsForHome } from '../lib/api'
import Head from 'next/head'
import { CMS_NAME, ONE_GRAPH_APP_ID } from '../lib/constants'
import {
  auth,
  extractAuthGuardianCookie,
  requireUserLoggedIn,
  requireUserRoles,
  useAuthGuardian,
  useFetchSupportedServices,
  makeLoggedInError,
  makeMissingRolesError,
} from '../lib/oneGraphNextClient'
import useSWR from 'swr'
import ErrorPage from 'next/error'

const requiredRolesForThisPage = ['admin']

const minimalRequiredJwt = { user: { roles: requiredRolesForThisPage } }

export default function Index({
  allPosts,
  isAuthorized,
  isLoggedIn,
  userId,
  adminOnlyData,
  agCookie,
}) {
  if (!isLoggedIn) {
    return makeLoggedInError()
  }

  if (!isAuthorized) {
    return makeMissingRolesError(agCookie, requiredRolesForThisPage)
  }

  return (
    <>
      <Layout>
        <Head>
          <title>Next.js Secure Admin Page via OneGraph's AuthGuardian</title>
        </Head>
        <Container>
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-tight md:leading-none mb-12 text-center md:text-left">
            {adminOnlyData}
          </h1>
        </Container>
      </Layout>
    </>
  )
}

export async function getServerSideProps(ctx) {
  const agCookie = (await extractAuthGuardianCookie(ctx)) || null

  const { isAuthorized } = requireUserRoles(agCookie, requiredRolesForThisPage)
  const { userId } = requireUserLoggedIn(agCookie)

  let adminOnlyData = null
  if (isAuthorized) {
    // Make API/DB/etc. calls here knowing that the use is an admin
    adminOnlyData = "If you can see this, you're logged in as an admin!"
  }

  const isLoggedIn = !!userId

  return {
    props: {
      isAuthorized,
      isLoggedIn,
      userId,
      adminOnlyData,
      agCookie,
    },
  }
}
