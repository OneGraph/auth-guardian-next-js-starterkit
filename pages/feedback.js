import Container from '../components/container'
import MoreStories from '../components/more-stories'
import HeroPost from '../components/hero-post'
import Intro from '../components/intro'
import Layout from '../components/layout'
import { getAllIssues } from '../lib/api'
import {
  ONE_GRAPH_APP_ID,
  ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN,
} from '../lib/constants'
import Head from 'next/head'
import {
  auth,
  destroyAuth,
  saveAuth,
  useAuthGuardian,
  useFetchSupportedServices,
} from '../lib/oneGraphNextClient'
import { serverSideAuthTokenConfigurationPrompt } from '../lib/metaHelpers'
import useSWR from 'swr'

const submitFeedback = async ({ title, body, emotion }) => {
  const issue = { title, body, emotion }
  const result = await fetch('/api/feedback', {
    method: 'POST',
    body: JSON.stringify(issue),
  })
  const json = await result.json()
  return json
}

const submitStatusMessages = {
  idle: (
    <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-tight md:leading-none mb-12 text-center md:text-left">
      What do <span className="font-bold">you</span> think of Next.js and
      AuthGuardian?
    </h1>
  ),
  loading: 'Submitting...',
  success: 'Submitted, thank you!',
  error: serverSideAuthTokenConfigurationPrompt(ONE_GRAPH_APP_ID),
}

export default function Index() {
  const [submitStatus, setSubmitStatus] = React.useState('idle')

  const [feedback, setFeedback] = React.useState({
    title: '',
    body: '',
    emotion: 'neutral',
  })

  return (
    <>
      <Layout>
        <Head>
          <title>Next.js Auth Playground with OneGraph's AuthGuardian</title>
        </Head>
        <div className="flex flex-col mx-auto px-5 w-4/5">
          {' '}
          {submitStatusMessages[submitStatus]}
          <br />
          <label>
            <h2 className="text-1xl font-bold tracking-tighter leading-tight md:leading-none text-center md:text-left">
              Quick feedback
            </h2>
            <input
              className="card w-full"
              type="text"
              defaultValue={feedback.title}
              onChange={(event) => {
                const title = event.target.value
                setFeedback((oldFeedback) => {
                  return { ...oldFeedback, title: title }
                })
              }}
            />
          </label>
          <br />
          <label>
            <h2 className="text-1xl font-bold tracking-tighter leading-tight md:leading-none text-center md:text-left">
              Details (if you want!):
            </h2>
            <textarea
              className="card"
              rows={4}
              defaultValue={feedback.body}
              onChange={(event) => {
                const body = event.target.value
                setFeedback((oldFeedback) => {
                  return { ...oldFeedback, body: body }
                })
              }}
            ></textarea>
          </label>
          <label>
            <h2 className="text-1xl font-bold tracking-tighter leading-tight md:leading-none text-center md:text-left">
              How're you feeling right now?
            </h2>
            <select
              className="block appearance-none w-full bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 pr-8 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
              value={feedback.emotion}
              onChange={(event) => {
                const emotion = event.target.value
                setFeedback((oldFeedback) => {
                  return { ...oldFeedback, emotion: emotion }
                })
              }}
            >
              <option value="meh">😑 Meh</option>
              <option value="neutral">😐 Neutral</option>
              <option value="amazed">😲 Amazed</option>
              <option value="blown-away">🤯 Completely blown away!</option>
            </select>
          </label>
          <button
            className="bg-transparent hover:bg-blue-500 text-blue-700 font-semibold hover:text-white py-2 px-4 border border-blue-500 hover:border-transparent rounded"
            onClick={async () => {
              setSubmitStatus('loading')
              const result = await submitFeedback(feedback)
              const newStatus = result.success ? 'success' : 'error'
              setSubmitStatus(newStatus)
            }}
          >
            Submit{' '}
          </button>
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
          margin: 1rem;
          flex-basis: 20%;
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
