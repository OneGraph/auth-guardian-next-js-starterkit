import Container from '../components/container'
import MoreStories from '../components/more-stories'
import HeroPost from '../components/hero-post'
import Intro from '../components/intro'
import Layout from '../components/layout'
import { getAllIssues } from '../lib/api'
import Head from 'next/head'
import {
  ONE_GRAPH_APP_ID,
  INITIAL_SETUP_WIZARD_HAS_COMPLETED,
} from '../lib/constants'
import {
  auth,
  destroyAuth,
  saveAuth,
  useAuthGuardian,
  useFetchSupportedServices,
} from '../lib/oneGraphNextClient'
import InitialSetupWizard from '../lib/__wizard_delete_me_after_setup'
import useSWR from 'swr'
// Only used for the initial demo display, feel free to delete
import { corsPrompt, exampleUsage } from '../lib/metaHelpers'

export default function Index({ allIssues }) {
  if (!INITIAL_SETUP_WIZARD_HAS_COMPLETED) {
    return <InitialSetupWizard />
  }

  const [state, setState] = React.useState({
    mostRecentService: null,
  })

  const {
    supportedServices,
    corsConfigurationRequired,
  } = useFetchSupportedServices(auth)

  const user = React.useMemo(
    () => {
      const authGuardianData = useAuthGuardian(auth)
      return authGuardianData.user
    },
    // Refetch user data if the accessToken changes
    [auth.accessToken()]
  )

  return (
    <>
      <Layout>
        <Head>
          <title>Next.js Auth Playground with OneGraph's AuthGuardian</title>
        </Head>
        <div className="mx-auto mpx-5 max-w-4xl">
          {corsConfigurationRequired ? corsPrompt(ONE_GRAPH_APP_ID) : null}
          <header className="App-header">
            <p className="description">
              Your OneGraph auth JWT preview:{' '}
              {!!auth.accessToken() ? (
                <button
                  onClick={() => {
                    destroyAuth(auth)
                    setState((oldState) => {
                      return { ...oldState, mostRecentService: null }
                    })
                  }}
                >
                  [Logout]
                </button>
              ) : null}
            </p>
            <textarea
              className="jwt-preview card"
              rows={15}
              value={!!user ? JSON.stringify(user, null, 2) : 'No OneGraph JWT'}
              readOnly={true}
            ></textarea>
            <br />
            <textarea
              className="jwt-preview"
              style={{ userSelect: 'all' }}
              rows={1}
              value={
                !!auth.accessToken() && !!auth.accessToken().accessToken
                  ? auth.accessToken().accessToken
                  : 'No OneGraph JWT detected'
              }
              readOnly={true}
            ></textarea>
          </header>
          <div className="grid">
            {(supportedServices || []).map((service) => {
              return (
                <button
                  key={service.slug}
                  className="card w-64 m-4"
                  onClick={async () => {
                    await auth.login(service.slug)
                    const isLoggedIn = await auth.isLoggedIn(service.slug)

                    if (isLoggedIn) {
                      saveAuth(auth)
                    }

                    setState((oldState) => {
                      return {
                        ...oldState,
                        [service.slug]: isLoggedIn,
                        mostRecentService: service,
                      }
                    })
                  }}
                >
                  {!!state[service.slug] ? ' ✓' : ''}{' '}
                  <h3>{service.friendlyServiceName} &rarr;</h3>
                </button>
              )
            })}
          </div>{' '}
          {!state.mostRecentService ? null : (
            <>
              <h3>
                Add 'Sign in with {state.mostRecentService.friendlyServiceName}'
                to your React app
              </h3>
              <textarea
                className="card"
                style={{ marginBottom: '250px' }}
                rows={15}
                value={exampleUsage(ONE_GRAPH_APP_ID, state.mostRecentService)}
                readOnly={true}
              ></textarea>
            </>
          )}
        </div>
      </Layout>

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        footer {
          width: 100%;
          height: 100px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        footer img {
          margin-left: 0.5rem;
        }
        footer a {
          display: flex;
          justify-content: center;
          align-items: center;
        }
        a {
          color: inherit;
          text-decoration: none;
        }
        .title a {
          color: #0070f3;
          text-decoration: none;
        }
        .title a:hover,
        .title a:focus,
        .title a:active {
          text-decoration: underline;
        }
        .title {
          margin: 0;
          line-height: 1.15;
          font-size: 4rem;
        }
        .title,
        .description {
          text-align: center;
        }
        .description {
          line-height: 1.5;
          font-size: 1.5rem;
        }
        code {
          background: #fafafa;
          border-radius: 5px;
          padding: 0.75rem;
          font-size: 1.1rem;
          font-family: Menlo, Monaco, Lucida Console, Liberation Mono,
            DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace;
        }
        .grid {
          display: flex;
          align-items: center;
          justify-content: start;
          flex-wrap: wrap;
          max-width: 100%;
          margin-top: 3rem;
        }
        button.card {
          background-color: unset;
          cursor: pointer;
        }
        textarea.card {
          width: 100%;
        }
        textarea {
          width: 100%;
        }
        .card {
          padding: 1.5rem;
          text-align: left;
          color: inherit;
          text-decoration: none;
          border: 1px solid #eaeaea;
          border-radius: 10px;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .card:hover,
        .card:focus,
        .card:active {
          color: #0070f3;
          border-color: #0070f3;
        }
        .card h3 {
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
        }
        .card p {
          margin: 0;
          font-size: 1.25rem;
          line-height: 1.5;
        }
        .logo {
          height: 1em;
        }
        @media (max-width: 600px) {
          .grid {
            width: 100%;
            flex-direction: column;
          }
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }
        nav {
          color: #fff;
          background-color: #333;
        }
        nav.cors-prompt {
          background-color: #bb0000;
          font-weight: bolder;
          color: white;
        }
        nav a {
          color: #fff;
        }
        nav * {
          display: inline;
        }
        nav li {
          margin: 20px;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </>
  )
}

export async function getStaticProps() {
  return {
    props: {},
  }
}
