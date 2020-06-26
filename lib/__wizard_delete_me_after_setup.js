import Container from '../components/container'
import MoreStories from '../components/more-stories'
import HeroPost from '../components/hero-post'
import Intro from '../components/intro'
import Alert from '../components/alert'
import Footer from '../components/footer'
import Meta from '../components/meta'
import Head from 'next/head'
import {
  ONE_GRAPH_APP_ID,
  AUTO_DETECTED_GITHUB_LINK,
  GIT_CHECKOUT_LINK,
  FEEDBACK_REPO_ID,
  ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN,
  ONE_GRAPH_SITE_HOST,
} from '../lib/constants'
import {
  auth,
  destroyAuth,
  saveAuth,
  useAuthGuardian,
  useFetchSupportedServices,
  fetchOneGraph,
  basicFetchOneGraph,
} from '../lib/oneGraphNextClient'
import { isSsr } from './common'
import { corsPrompt } from '../lib/metaHelpers'
import MultiStep from 'react-multistep'
import OneGraphAuth from 'onegraph-auth'
import { SubscriptionClient } from 'onegraph-subscription-client'

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

const testServerSideAuthTokenOperationDoc = `
query FindMeOnGitHub {
  me {
    github {
      databaseId
      login
    }
  }
}`

const vercelOperationDoc = `query FindMeOnVercel {
  me {
    vercel: zeit {
      id
      email
      name
      username
      avatar
    }
  }
}

query VercelProjectByNameQuery($projectName: String!) {
  vercel: zeit {
    secrets {
      edges {
        node {
          id
          name
          created
        }
      }
    }
    projectByName(name: $projectName) {
      ...ZeitProjectFullFragment
    }
  }
}

query VercelProjectByIdQuery($projectId: String!) {
  vercel: zeit {
    secrets {
      edges {
        node {
          id
          name
          created
        }
      }
    }
    projectById(id: $projectId) {
      ...ZeitProjectFullFragment
    }
  }
}

mutation TriggerRedeployMutation($projectId: String!) {
  vercel: zeit {
    triggerProjectRedeployment(
      input: { projectId: $projectId }
    ) {
      project {
        ...ZeitProjectFullFragment
      }
    }
  }
}

mutation CreateSecretMutation(
  $name: String!
  $value: String!
) {
  vercel: zeit {
    createSecret(input: { name: $name, value: $value }) {
      secret {
        created
        name
        id
      }
    }
  }
}

mutation SetEnvironmentalVariableMutation(
  $projectId: String!
  $key: String!
  $secretId: String!
) {
  vercel: zeit {
    createEnvironmentalVariable(
      input: {
        projectId: $projectId
        key: $key
        secretId: $secretId
      }
    ) {
      environmentalVariable {
        configurationId
        createdAt
        key
        target
        updatedAt
        value
      }
    }
  }
}

subscription DeploymentCreatedSubscription(
  $projectId: String!
) {
  vercel: zeit {
    deploymentCreatedEvent(
      input: { projectId: $projectId }
    ) {
      raw
    }
  }
}

subscription DeploymentReadySubscription(
  $projectId: String!
) {
  vercel: zeit {
    deploymentReadyEvent(input: { projectId: $projectId }) {
      raw
    }
  }
}

subscription LogSubscription($projectId: String!) {
  vercel: zeit {
    logEvent(input: { projectId: $projectId }) {
      raw
    }
  }
}

fragment ZeitProjectFullFragment on ZeitProjectFull {
  id
  name
  updatedAt
  createdAt
  accountId
  alias {
    id
    alias
    created
    createdAt
    updatedAt
    deploymentId
    projectId
  }
  latestDeployments {
    id
    url
  }
  env {
    configurationId
    createdAt
    key
    target
    updatedAt
    value
  }
  link {
    org
    repo
    repoId
    type
  }
}`

/** Our first-setup wizard has to do the following steps:
0. Display the inferred project name
1. Try to get the project id based on name
2. Check to see if ONE_GRAPH_APP_ID is set via ENV. If not, check in the project env list via api (in case the user refreshed the page before redeploying)
2a. Handle CORS prompt here so we can make our calls
3. If it's not set in env or the API, render a link asking them to go to their OG dashboard and copy/paste it in (with example picture) [SERVER=DONE]
4. Create a secret for ONE_GRAPH_APP_ID
5. Set the env var 
6. Repeat 2-5 for SERVER_SIDE_AUTH_TOKEN env var for GitHub access
7. Once all the env vars are set, create a deploy hook url 
8. Hit the deploy-hook url from the browser
9. Show progress bar for new deploy
10. Refresh the page once the deploy is done, app will now be configured and run like normal
*/

// Vercel doesn't give us the project name or id as a build variable, so we have to try to infer it based on the url for the first deploy
const guessVercelProjectByHostname = async (
  oneGraphAuth,
  windowLocationHostname
) => {
  if (isSsr) {
    return null
  }
  const pieces =
    windowLocationHostname.match('^([a-zA-Z0-9-]+).[a-zA-Z0-9-_]*?.?now.sh') ||
    windowLocationHostname.match('^([a-zA-Z0-9-]+).[a-zA-Z0-9-_]*?.?vercel.app')

  // Avoid project-name.username.vercel.app hangup
  const withoutUsername = ((pieces || [])[1] || '').split('.')[0]
  const full = (withoutUsername || '').split('-')

  const helper = async (remainingPieces) => {
    if ((remainingPieces || []).length === 0) {
      console.warn("Couldn't infer Vercel project name")
      return null
    }

    const candidateName = remainingPieces.join('-')
    console.log('Candidate name:', candidateName)

    const result = await fetchOneGraph(
      oneGraphAuth,
      vercelOperationDoc,
      { projectName: candidateName },
      'VercelProjectByNameQuery'
    )

    const vercelProject = result?.data?.vercel?.projectByName
    if (!!vercelProject?.id) {
      console.log(
        'Found project name: ',
        vercelProject?.name,
        vercelProject?.id
      )
      return vercelProject
    } else {
      const rest = (remainingPieces || []).slice(0, -1)
      return await helper(rest)
    }
  }

  return await helper(full)
}

const alert = (errorMessage) => {
  return (
    <div
      className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4"
      role="alert"
    >
      <p className="font-bold">Vercel Next.js install wizard failed: </p>
      <p>{errorMessage}</p>
    </div>
  )
}

const uuidV4Regex = new RegExp(
  /^[A-F\d]{8}-[A-F\d]{4}-4[A-F\d]{3}-[89AB][A-F\d]{3}-[A-F\d]{12}$/i
)

const isValidUUID = (string) => {
  return uuidV4Regex.test(string)
}

const StepSetOneGraphAppId = ({ oneGraphAppId, setOneGraphAppId }) => {
  const errorMessage = isValidUUID(oneGraphAppId)
    ? null
    : 'OneGraph appId should be a valid UUID.'

  return (
    <div className="flex-col content-middle items-center justify-center align-middle">
      <div className="md:flex-shrink-0 float-left m-1">
        <img
          className="rounded-lg w-auto "
          src="/images/onegraph_app_id_preview.png"
          alt="Find your OneGraph appId in the dashboard"
        />
      </div>
      <div className="flex-col flex">
        <div className="uppercase tracking-wide text-sm text-gray-400 font-bold align-text-middle ">
          First, enter your OneGraph <code>appId</code>:
        </div>
        <p className="mt-2 text-gray-600">
          <input
            type="text"
            className="transition-shadow duration-500 ease-in-out hover:shadow-md border border-gray-400 focus:border-gray-500 bg-white text-gray-900 appearance-none inline-block w-full border rounded py-3 px-4 focus:outline-none"
            placeholder="OneGraph appId"
            defaultValue={oneGraphAppId || ''}
            onChange={(event) => {
              const value = event.target.value
              setOneGraphAppId(value)
            }}
          />
        </p>{' '}
        <div className="uppercase tracking-wide text-sm text-gray-400 font-bold align-text-middle ">
          You can get one to copy/paste from the{' '}
          <a
            className="underline"
            target="_blank"
            href={`${ONE_GRAPH_SITE_HOST}/dashboard`}
          >
            OneGraph app dashboard
          </a>
          .
        </div>
      </div>
    </div>
  )
}

const StepSetCorsOrigin = ({
  oneGraphAppId,
  inferredVercelProjectName,
  onCorsConfiguredSuccess,
  oneGraphAuth,
}) => {
  return (
    <CorsCheck
      oneGraphAppId={oneGraphAppId}
      inferredVercelProjectName={inferredVercelProjectName}
      onCorsConfiguredSuccess={onCorsConfiguredSuccess}
      oneGraphAuth={oneGraphAuth}
    />
  )
}

const checkAccessToken = async (
  oneGraphAppId,
  accessToken,
  onSuccess,
  onFailure
) => {
  const result = await basicFetchOneGraph(
    oneGraphAppId,
    accessToken,
    testServerSideAuthTokenOperationDoc,
    {},
    'FindMeOnGitHub'
  )

  const gitHub = result?.data?.me?.github

  if (gitHub?.login) {
    onSuccess(gitHub)
  } else {
    onFailure()
  }
}

const StepSetServerSideAuthToken = ({
  oneGraphAppId,
  oneGraphServerSideAccessToken,
  setOneGraphServerSideAccessToken,
}) => {
  const [state, setState] = React.useState({
    accessToken: null,
    message: null,
  })

  React.useEffect(() => {
    if (!state.accessToken) {
      return
    }

    checkAccessToken(
      oneGraphAppId,
      state.accessToken,
      (gitHub) => {
        setState((oldState) => {
          return {
            ...oldState,
            message: `Success! We'll use ${gitHub.login}'s access token to make server-side calls.`,
          }
        })
        setOneGraphServerSideAccessToken(state.accessToken)
      },
      () => {
        setState((oldState) => {
          return {
            ...oldState,
            message: `That auth token doesn't have access to GitHub. Are you sure you added it as a service in the dashboard?`,
          }
        })
      }
    )
  }, [state.accessToken])

  return (
    <div className="flex-col content-middle items-center justify-center align-middle">
      <div className="md:flex-shrink-0 float-left m-1">
        <img
          className="rounded-lg w-auto "
          src="/images/onegraph_server_side_auth_token_preview.png"
          alt="Create a server-side auth token with GitHub as a service in your dashboard"
        />
      </div>
      <div className="flex-col flex">
        <div className="uppercase tracking-wide text-sm text-gray-400 font-bold align-text-middle ">
          <p>
            {' '}
            Next enter your secret server-side auth token to talk to GitHub:
          </p>
          <label>
            <input
              type="password"
              className="transition-shadow duration-500 ease-in-out hover:shadow-md border border-gray-400 focus:border-gray-500 bg-white text-gray-900 appearance-none inline-block w-full border rounded py-3 px-4 focus:outline-none"
              placeholder="Server-side access token"
              defaultValue={oneGraphServerSideAccessToken || ''}
              onChange={(event) => {
                const value = event.target.value
                setState((oldState) => {
                  return {
                    ...oldState,
                    accessToken: value,
                  }
                })
              }}
            />
          </label>
          <p>
            <a
              target="_blank"
              href={`${ONE_GRAPH_SITE_HOST}/dashboard/app/${oneGraphAppId}/auth/server-side`}
            >
              You can make a server-side auth token on your{' '}
              <span className="underline">OneGraph dashboard</span>
            </a>
            .
          </p>
          <br />
          <p>{state.message}</p>
        </div>
      </div>
    </div>
  )
}

const checkVercelLoginStatus = async (oneGraphAuth, onLoggedIn) => {
  const isLoggedIn = await oneGraphAuth.isLoggedIn('zeit')
  if (isLoggedIn) {
    onLoggedIn()
  }
}

const StepTriggerDeploy = ({
  vercelUser,
  onLoggedIntoVercel,
  oneGraphAuth,
  vercelProjectId,
  oneGraphSubscriptClient,
  oneGraphServerSideAccessToken,
  inferredVercelProjectName,
}) => {
  const [state, setState] = React.useState({
    vercelProject: null,
    secrets: [],
    actionName: null,
    projectLogs: '',
  })

  const addLogLines = (lines) => {
    setState((oldState) => {
      return {
        ...oldState,
        projectLogs: lines + '\n' + oldState.projectLogs,
      }
    })
  }

  const appIdIsSet = oneGraphAuth && oneGraphAuth.appId

  const refreshProject = async () => {
    if (!appIdIsSet) {
      return
    }

    if (!vercelProjectId) {
      return null
    }

    const result = await fetchOneGraph(
      oneGraphAuth,
      vercelOperationDoc,
      { projectId: vercelProjectId },
      'VercelProjectByIdQuery'
    )
    const secrets = (result?.data?.vercel?.secrets?.edges || [])
      .map((edge) => edge?.node)
      .filter(Boolean)
    const vercelProject = result?.data?.vercel?.projectById

    setState((oldState) => {
      return { ...oldState, vercelProject: vercelProject, secrets: secrets }
    })

    return { vercelProject: vercelProject, secrets: secrets }
  }

  React.useEffect(() => {
    refreshProject()
  }, [vercelProjectId, oneGraphAuth && oneGraphAuth.appId])

  React.useEffect(() => {
    checkVercelLoginStatus(oneGraphAuth, onLoggedIntoVercel)
  }, [oneGraphAuth?.accessToken()?.accessToken])

  const setAppIdPrompt = 'Please set a valid app id in step 1 first'

  const loginPrompt = (
    <div className="flex-col content-middle items-center justify-center align-middle">
      <div className="md:flex-shrink-0 float-left m-1">
        <img
          className="rounded-lg w-auto "
          src="/images/vercel_login.png"
          alt="Log into Vercel to finish the AuthGuardian set up"
        />
      </div>
      <div className="flex-col flex h-full">
        <div className="uppercase tracking-wide text-sm text-gray-400 font-bold align-text-middle ">
          <p>Last step!</p>
          <p>
            log into Vercel so we can set the environmental variables and
            trigger a new deploy.
          </p>
          <button
            className={
              'bg-transparent hover:bg-blue-500 text-blue-700 font-semibold hover:text-white py-2 px-4 border border-blue-500 hover:border-transparent rounded ' +
              (state.stepIndex === 0 ? 'opacity-50 cursor-not-allowed' : '')
            }
            disabled={state.stepIndex === 0}
            onClick={async () => {
              console.log('PreAuth: ', oneGraphAuth, oneGraphAuth.accessToken())

              await oneGraphAuth.login('zeit')
              console.log('Done!')
              const isLoggedIn = await oneGraphAuth.isLoggedIn('zeit')
              console.log('Is logged in? ', isLoggedIn)
              if (isLoggedIn) {
                saveAuth(oneGraphAuth)
                onLoggedIntoVercel()
              }
            }}
          >
            Log into Vercel
          </button>
        </div>
      </div>
    </div>
  )

  const fullSecretName = (envVarName) => {
    return `${(inferredVercelProjectName || '')
      .toLocaleLowerCase()
      .replace(/\W+/g, '_')}.${envVarName
      .toLocaleLowerCase()
      .replace(/\W+/g, '_')}`
  }

  const findSecretByName = (secrets, envVarName) => {
    const secretName = fullSecretName(envVarName)
    return secrets.find((secret) => secret.name == secretName)
  }

  const findEnvVarByName = (project, envVarName) => {
    return (project.env || []).find((env) => env.key == envVarName)
  }

  const actions = !!state.vercelProject
    ? [
        {
          name: 'Create secrets',
          execute: async (state) => {
            const gitLink = state.vercelProject?.link
            const gitHubOrg = gitLink?.org
            const gitHubRepo = gitLink?.repo
            const gitProvider = gitLink?.type

            console.log('Creating secret: ', 'NEXT_PUBLIC_ONE_GRAPH_APP_ID')
            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              {
                name: fullSecretName('NEXT_PUBLIC_ONE_GRAPH_APP_ID'),
                value: oneGraphAuth.appId,
              },
              'CreateSecretMutation'
            )

            console.log(
              'Creating secret: ',
              'ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN'
            )
            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              {
                name: fullSecretName('ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN'),
                value: oneGraphServerSideAccessToken,
              },
              'CreateSecretMutation'
            )

            console.log('Creating secret: ', 'NEXT_PUBLIC_GITHUB_ORG')
            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              {
                name: fullSecretName('NEXT_PUBLIC_GITHUB_ORG'),
                value: gitHubOrg,
              },
              'CreateSecretMutation'
            )

            if (!gitLink) {
              console.log(
                'Skipping Git link secrets, link is null (known issue in import flow)'
              )
            } else {
              console.log('Creating secret: ', 'NEXT_PUBLIC_GITHUB_REPO')

              await fetchOneGraph(
                oneGraphAuth,
                vercelOperationDoc,
                {
                  name: fullSecretName('NEXT_PUBLIC_GITHUB_REPO'),
                  value: gitHubRepo,
                },
                'CreateSecretMutation'
              )
              console.log('Creating secret: ', 'NEXT_PUBLIC_GIT_PROVIDER')
              await fetchOneGraph(
                oneGraphAuth,
                vercelOperationDoc,
                {
                  name: fullSecretName('NEXT_PUBLIC_GIT_PROVIDER'),
                  value: gitProvider,
                },
                'CreateSecretMutation'
              )
            }

            console.log(
              'Creating secret: ',
              'NEXT_PUBLIC_INSTALL_SETUP_WIZARD_HAS_COMPLETED'
            )
            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              {
                name: fullSecretName(
                  'NEXT_PUBLIC_INSTALL_SETUP_WIZARD_HAS_COMPLETED'
                ),
                value: 'true',
              },
              'CreateSecretMutation'
            )

            console.log('Refreshing project...')
          },
          finishedP: (state) => {
            return (
              !!findSecretByName(
                state.secrets,
                'NEXT_PUBLIC_ONE_GRAPH_APP_ID'
              ) &&
              !!findSecretByName(
                state.secrets,
                'ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN'
              ) &&
              !!findSecretByName(state.secrets, 'NEXT_PUBLIC_GITHUB_ORG') &&
              !!findSecretByName(state.secrets, 'NEXT_PUBLIC_GITHUB_REPO') &&
              !!findSecretByName(state.secrets, 'NEXT_PUBLIC_GIT_PROVIDER')
            )
          },
        },
        {
          name: 'Create environmental variables',
          execute: async (state) => {
            const gitLink = state.vercelProject?.link
            const gitHubOrg = gitLink?.org
            const gitHubRepo = gitLink?.repo
            const gitProvider = gitLink?.type

            let secret = findSecretByName(
              state.secrets,
              'NEXT_PUBLIC_ONE_GRAPH_APP_ID'
            )
            console.log('NEXT_PUBLIC_ONE_GRAPH_APP_ID: ', secret)

            let secretId = secret?.id
            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              {
                projectId: state.vercelProject.id,
                key: 'NEXT_PUBLIC_ONE_GRAPH_APP_ID',
                secretId: secretId,
              },
              'SetEnvironmentalVariableMutation'
            )

            secret = findSecretByName(
              state.secrets,
              'ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN'
            )
            console.log('ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN: ', secret)

            secretId = secret?.id

            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              {
                projectId: state.vercelProject.id,
                key: 'ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN',
                secretId: secretId,
              },
              'SetEnvironmentalVariableMutation'
            )

            secret = findSecretByName(state.secrets, 'NEXT_PUBLIC_GITHUB_ORG')
            console.log('NEXT_PUBLIC_GITHUB_ORG: ', secret)

            secretId = secret?.id

            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              {
                projectId: state.vercelProject.id,
                key: 'NEXT_PUBLIC_GITHUB_ORG',
                secretId: secretId,
              },
              'SetEnvironmentalVariableMutation'
            )

            secret = findSecretByName(state.secrets, 'NEXT_PUBLIC_GITHUB_REPO')
            console.log('NEXT_PUBLIC_GITHUB_REPO: ', secret)

            secretId = secret?.id

            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              {
                projectId: state.vercelProject.id,
                key: 'NEXT_PUBLIC_GITHUB_REPO',
                secretId: secretId,
              },
              'SetEnvironmentalVariableMutation'
            )

            secret = findSecretByName(state.secrets, 'NEXT_PUBLIC_GIT_PROVIDER')
            console.log('NEXT_PUBLIC_GIT_PROVIDER: ', secret)

            secretId = secret?.id

            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              {
                projectId: state.vercelProject.id,
                key: 'NEXT_PUBLIC_GIT_PROVIDER',
                secretId: secretId,
              },
              'SetEnvironmentalVariableMutation'
            )

            secret = findSecretByName(
              state.secrets,
              'NEXT_PUBLIC_INSTALL_SETUP_WIZARD_HAS_COMPLETED'
            )
            console.log(
              'NEXT_PUBLIC_INSTALL_SETUP_WIZARD_HAS_COMPLETED: ',
              secret
            )

            secretId = secret?.id

            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              {
                projectId: state.vercelProject.id,
                key: 'NEXT_PUBLIC_INSTALL_SETUP_WIZARD_HAS_COMPLETED',
                secretId: secretId,
              },
              'SetEnvironmentalVariableMutation'
            )
          },
          finishedP: () => {
            return (
              !!findEnvVarByName(
                state.vercelProject,
                'NEXT_PUBLIC_ONE_GRAPH_APP_ID'
              ) &&
              !!findEnvVarByName(
                state.vercelProject,
                'ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN'
              ) &&
              !!findEnvVarByName(
                state.vercelProject,
                'NEXT_PUBLIC_GITHUB_ORG'
              ) &&
              !!findEnvVarByName(
                state.vercelProject,
                'NEXT_PUBLIC_GITHUB_REPO'
              ) &&
              !!findEnvVarByName(
                state.vercelProject,
                'NEXT_PUBLIC_GIT_PROVIDER'
              ) &&
              !!findEnvVarByName(
                state.vercelProject,
                'NEXT_PUBLIC_INSTALL_SETUP_WIZARD_HAS_COMPLETED'
              )
            )
          },
        },
        {
          name: 'Trigger redeploy',
          execute: async (state) => {
            oneGraphSubscriptClient
              .request({
                query: vercelOperationDoc,
                variables: { projectId: state.vercelProject.id },
                operationName: 'DeploymentCreatedSubscription',
              })
              .subscribe(
                (next) => {
                  const deploymentId =
                    next.data?.vercel?.deploymentCreatedEvent?.raw?.payload
                      ?.deployment?.id
                  const ownerId =
                    next.data?.vercel?.deploymentCreatedEvent?.raw?.ownerId
                  const region =
                    next.data?.vercel?.deploymentCreatedEvent?.raw?.region

                  const logLine = `Deploy ${deploymentId} started for owner ${ownerId} to region "${region}"`

                  addLogLines(logLine)
                },
                (error) => console.error(error),
                () => console.log('done')
              )

            oneGraphSubscriptClient
              .request({
                query: vercelOperationDoc,
                variables: { projectId: state.vercelProject.id },
                operationName: 'DeploymentReadySubscription',
              })
              .subscribe(
                (next) => {
                  const deploymentId =
                    next.data?.vercel?.deploymentReadyEvent?.raw?.payload
                      ?.deployment?.id

                  const logLine = `Deploy ${deploymentId} finished - refresh to enter the AuthGuardian starterkit!"`
                  addLogLines(logLine)
                  const start = Date.now()
                  setInterval(async () => {
                    const elapsed = Date.now() - start
                    const remaining = 5000 - elapsed
                    setState((oldState) => {
                      return {
                        ...oldState,
                        timeUntilReload: Math.floor(remaining),
                      }
                    })
                    if (remaining < 0) {
                      const result = await refreshProject()
                      const latestUrl =
                        result?.vercelProject?.latestDeployments?.[0]?.url
                      if (!!latestUrl) {
                        window.location = `https://${latestUrl}/`
                      } else {
                        window.location.reload()
                      }
                    }
                  }, 100)
                },
                (error) => console.error(error),
                () => console.log('done')
              )

            oneGraphSubscriptClient
              .request({
                query: vercelOperationDoc,
                variables: { projectId: state.vercelProject.id },
                operationName: 'LogSubscription',
              })
              .subscribe(
                (next) => {
                  const logStatements = next.data?.vercel?.logEvent?.raw || []
                  let relevantLogs = logStatements
                    .filter((statement) => {
                      return (
                        statement.projectId === state.vercelProject.id &&
                        ['stdout'].indexOf(statement.type) > -1
                      )
                    })
                    .map((statement) => statement.message)
                    .reverse()
                    .join('\n')

                  addLogLines(relevantLogs)
                },
                (error) => console.error(error),
                () => console.log('done')
              )

            await fetchOneGraph(
              oneGraphAuth,
              vercelOperationDoc,
              { projectId: state.vercelProject.id },
              'TriggerRedeployMutation'
            )

            setState((oldState) => {
              return {
                ...oldState,
                projectLogs: 'Triggered redeploy, waiting for logs...',
              }
            })

            await refreshProject(state.vercelProject)
          },
          finishedP: (state) => {
            return false
          },
        },
      ]
    : null

  console.log('ACtions: ', actions)

  const commitPrompt = !!actions && (
    <div className="flex-col content-middle items-center justify-center align-middle">
      <div className="md:flex-shrink-0 float-left m-1">
        <img
          className="rounded-lg w-auto "
          src="/images/vercel_login.png"
          alt="Log into Vercel to finish the AuthGuardian set up"
        />
      </div>
      <div className="flex-col flex h-full">
        <div className="uppercase tracking-wide text-sm text-gray-400 font-bold align-text-middle ">
          <p>You're logged in and ready to go!</p>
          <table>
            <thead>
              <tr>
                <th />
                <th>What we'll do for {inferredVercelProjectName}:</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => {
                const isExecuting = state.actionName === action.name
                return (
                  <tr key={action.name}>
                    <td className={isExecuting ? 'animate-flicker' : ''}>
                      {isExecuting ? '◌' : action.finishedP(state) ? '⚫' : '◯'}
                    </td>
                    <td>{action.name}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!state.projectLogs ? (
            <button
              className={
                'w-full mt-4 bg-transparent hover:bg-blue-500 text-blue-700 font-semibold hover:text-white py-2 px-4 border border-blue-500 hover:border-transparent rounded ' +
                (state.stepIndex === 0 ? 'opacity-50 cursor-not-allowed' : '')
              }
              disabled={state.stepIndex === 0}
              onClick={async () => {
                await asyncForEach(actions, async (action) => {
                  console.log('Execute action: ', action)
                  setState((oldState) => {
                    return { ...oldState, actionName: action.name }
                  })
                  const actionState = await refreshProject()
                  console.log('Project for ', action.name, actionState)
                  await action.execute(actionState)
                })
                console.log('Done')
              }}
              disabled={!!state.actionName}
            >
              Make it so
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {!appIdIsSet ? setAppIdPrompt : !vercelUser ? loginPrompt : commitPrompt}
      <br />
      {state.actionName === 'Trigger redeploy' ? (
        <div className="clear-both">
          <br />
          <p className="font-semibold text-xl tracking-tight">
            <code>Logs</code>
          </p>
          {state.timeUntilReload
            ? `(refreshing automatically in ${Math.max(
                0.0,
                (state.timeUntilReload / 1000).toFixed(2)
              )} seconds...)`
            : null}
          <textarea
            className="bg-black focus:outline-none focus:shadow-outline border border-gray-300 rounded-lg py-2 px-4 block w-full appearance-none leading-normal text-white"
            style={{ userSelect: 'all' }}
            rows={10}
            value={state.projectLogs}
            readOnly={true}
          ></textarea>
        </div>
      ) : null}
    </div>
  )
}

function CorsCheck({
  oneGraphAppId,
  inferredVercelProjectName,
  onCorsConfiguredSuccess,
  oneGraphAuth,
}) {
  if (isSsr) {
    return 'Loading...'
  }

  const {
    corsConfigurationRequired,
    loading,
    supportedServices,
  } = useFetchSupportedServices(oneGraphAuth)

  const supportedServicesCount = (supportedServices || []).length

  React.useEffect(() => {
    if (!corsConfigurationRequired && supportedServicesCount > 0) {
      onCorsConfiguredSuccess()
    }
  }, [oneGraphAuth.appId, corsConfigurationRequired, supportedServicesCount])

  const requiresConfig =
    supportedServicesCount === 0 || corsConfigurationRequired

  const origin = isSsr ? '' : window.location.origin

  return (
    <div className="flex-col content-middle items-center justify-center align-middle">
      <div className="md:flex-shrink-0 float-left m-1">
        <img
          className="rounded-lg w-auto "
          src="/images/cors_origin_setup.png"
          alt="Find your OneGraph appId in the dashboard"
        />
      </div>
      <div className="flex-col flex h-full">
        <div className="uppercase tracking-wide text-sm text-gray-400 font-bold align-text-middle ">
          {requiresConfig ? (
            <a
              className="App-link"
              href={`${ONE_GRAPH_SITE_HOST}/dashboard/app/${oneGraphAppId}?add-cors-origin=${origin}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Click here to add {origin} to your allowed CORS origins
            </a>
          ) : (
            <>
              Great, CORS has been configured so{' '}
              <code>{inferredVercelProjectName}</code> can make all the OneGraph
              API calls it needs. <br /> <br />
              You'll also be able to log into {supportedServicesCount} services
              in your next.js app now.
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Index({}) {
  const [state, setState] = React.useState({
    vercelUser: null,
    corsConfigurationRequired: true,
    inferredVercelProjectName: null,
    oneGraphAppId: ONE_GRAPH_APP_ID,
    oneGraphSubscriptClient: null,
    oneGraphServerSideAccessToken: null,
    errorMessage: null,
    oneGraphAuth: null,
    vercelProjectId: null,
    projectLogs: [],
    stepIndex: 0,
  })

  React.useEffect(() => {
    if (isValidUUID(state.oneGraphAppId)) {
      const oneGraphAuth = new OneGraphAuth({
        appId: state.oneGraphAppId,
        // oneGraphOrigin: 'https://serve.onegraph.io',
      })

      const oneGraphSubscriptClient = new SubscriptionClient(
        state.oneGraphAppId,
        {
          oneGraphAuth: oneGraphAuth,
          // host: 'serve.onegraph.io',
        }
      )

      setState((oldState) => {
        return {
          ...oldState,
          oneGraphAuth: oneGraphAuth,
          oneGraphSubscriptClient: oneGraphSubscriptClient,
        }
      })
    }
  }, [state.oneGraphAppId])
  //https://vercel.com/import/project?template=https://github.com/sgrove/throw-away-delete-me-3
  //https://github.com/sgrove/next-js-auth-guardian-starterkit

  const validOneGraphAppId = isValidUUID(state.oneGraphAppId || '')
  const steps = [
    {
      component: (
        <StepSetOneGraphAppId
          oneGraphAppId={state.oneGraphAppId}
          setOneGraphAppId={(oneGraphAppId) =>
            setState((oldState) => {
              return { ...oldState, oneGraphAppId: oneGraphAppId }
            })
          }
        />
      ),
      completed: () => {
        return isValidUUID(state.oneGraphAppId)
      },
    },
    {
      component: (
        <StepSetCorsOrigin
          oneGraphAppId={state.oneGraphAppId}
          oneGraphAuth={state.oneGraphAuth}
          onCorsConfiguredSuccess={() => {
            setState((oldState) => {
              return { ...oldState, corsConfigurationRequired: false }
            })
          }}
        />
      ),
      completed: () => {
        return !state.corsConfigurationRequired
      },
    },
    {
      component: (
        <StepSetServerSideAuthToken
          oneGraphAppId={state.oneGraphAppId}
          oneGraphAuth={state.oneGraphAuth}
          oneGraphServerSideAccessToken={state.oneGraphServerSideAccessToken}
          setOneGraphServerSideAccessToken={(oneGraphServerSideAccessToken) =>
            setState((oldState) => {
              return {
                ...oldState,
                oneGraphServerSideAccessToken: oneGraphServerSideAccessToken,
              }
            })
          }
        />
      ),
      completed: () => {
        return !!state.oneGraphServerSideAccessToken
      },
    },
    {
      component: (
        <div style={{ display: 'flex' }}>
          <div className="card" style={{ flexGrow: '1' }}>
            <StepTriggerDeploy
              inferredVercelProjectName={state.inferredVercelProjectName}
              vercelProjectId={state.vercelProjectId}
              vercelUser={state.vercelUser}
              oneGraphAuth={state.oneGraphAuth}
              oneGraphSubscriptClient={state.oneGraphSubscriptClient}
              oneGraphServerSideAccessToken={
                state.oneGraphServerSideAccessToken
              }
              onCommitChanges={async () => {
                let result = await fetchOneGraph(
                  state.oneGraphAuth,
                  vercelOperationDoc,
                  { projectId: state.vercelProjectId },
                  'TriggerRedeployMutation'
                )
              }}
              onLoggedIntoVercel={async () => {
                let result = await fetchOneGraph(
                  state.oneGraphAuth,
                  vercelOperationDoc,
                  {},
                  'FindMeOnVercel'
                )
                const vercelUser = result?.data?.me?.vercel

                let hostname = window.location.hostname
                // hostname = 'auth-guardian-next-js-starterkit-2-8rea2cofc.now.sh'
                const vercelProject = await guessVercelProjectByHostname(
                  state.oneGraphAuth,
                  hostname
                )

                const projectId = vercelProject?.id

                setState((oldState) => {
                  return {
                    ...oldState,
                    vercelUser: vercelUser,
                    vercelProject: vercelProject,
                    vercelProjectId: projectId,
                    inferredVercelProjectName: vercelProject?.name,
                    errorMessage: !!projectId
                      ? null
                      : 'Unable to infer Vercel project name',
                  }
                })
              }}
            />
          </div>
        </div>
      ),
      completed: () => {
        return false
      },
    },
  ]
  return (
    <>
      <Meta />
      <main>
        <Head>
          <title>Next.js AuthGuardian First-Setup Wizard</title>
        </Head>
        <div className="h-screen w-screen bg-gray-200 absolute inset-0 z-0">
          <div
            style={{ height: '50%' }}
            className="w-screen inset-top bg-purple-900 bg-cover shadow-lg"
          ></div>
        </div>
        <Container>
          <div className="text-gray-100 m-auto align-middle content-center items-center justify-center z-10 shadow-lg">
            <div className="flex">
              {steps.map((step, idx) => {
                return (
                  <div
                    key={idx}
                    className="w-1/2 border-white items-center content-center justify-center rounded-l-sm flex"
                  >
                    <div
                      className={
                        'rounded-full rounded-b-none border-8 text-center inline-block ' +
                        (idx === state.stepIndex
                          ? 'bg-green-500 text-white border-green-500'
                          : 'text-black bg-white border-white')
                      }
                    >
                      {idx + 1}.
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="md:flex flex-col border rounded border-r-4 border-l-4 border-t-4 border-gray-100 align-middle align-text-middle inline-block content-center p-4 bg-gray-900 w-full shadow-lg">
              {state.errorMessage ? alert(state.errorMessage) : null}
              {steps[state.stepIndex].component}
              <div className="flex">
                <div className="w-1/2 content-end items-end">
                  <button
                    className={
                      'bg-transparent hover:bg-blue-500 text-blue-700 font-semibold hover:text-white py-2 px-4 border border-blue-500 hover:border-transparent rounded ' +
                      (state.stepIndex === 0
                        ? 'opacity-50 cursor-not-allowed'
                        : '')
                    }
                    disabled={state.stepIndex === 0}
                    onClick={() => {
                      state.stepIndex === 0
                        ? null
                        : setState((oldState) => {
                            return {
                              ...oldState,
                              stepIndex: oldState.stepIndex - 1,
                            }
                          })
                    }}
                  >
                    Previous
                  </button>
                </div>
                <div className="w-1/2 flex flex-row-reverse">
                  {state.stepIndex === steps.length - 1 ? null : (
                    <button
                      className={
                        'bg-transparent hover:bg-blue-500 text-blue-700 font-semibold hover:text-white py-2 px-4 border border-blue-500 hover:border-transparent rounded ' +
                        (steps[state.stepIndex].completed()
                          ? ''
                          : 'opacity-50 cursor-not-allowed')
                      }
                      onClick={() => {
                        steps[state.stepIndex].completed()
                          ? setState((oldState) => {
                              return {
                                ...oldState,
                                stepIndex: oldState.stepIndex + 1,
                              }
                            })
                          : null
                      }}
                    >
                      Next
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* <MultiStep steps={steps} /> */}
          {/* <br />
            <textarea
              className="jwt-preview"
              style={{ userSelect: 'all' }}
              rows={10}
              value={JSON.stringify(state, null, 2)}
              readOnly={true}
            ></textarea>{' '} */}
        </Container>
      </main>
      <Footer />
      <style jsx global>{`
        body {
          background-color: black;
        }

        @keyframes flickerAnimation {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        @-o-keyframes flickerAnimation {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        @-moz-keyframes flickerAnimation {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        @-webkit-keyframes flickerAnimation {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        .animate-flicker {
          -webkit-animation: flickerAnimation 1s infinite;
          -moz-animation: flickerAnimation 1s infinite;
          -o-animation: flickerAnimation 1s infinite;
          animation: flickerAnimation 1s infinite;
        }
        .blur {
          background: rgba(
            255,
            255,
            255,
            0.2
          ); // Make sure this color has an opacity of less than 1
          backdrop-filter: blur(4px); // This be the blur
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
