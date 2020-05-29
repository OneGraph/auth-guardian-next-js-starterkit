import copy from 'copy-to-clipboard'
import { ONE_GRAPH_APP_ID } from './constants'
import { isSsr } from './common'

export const exampleUsage = (appId, service) => {
  const componentName = `LoginWith${service.friendlyServiceName.replace(
    /\W/g,
    ''
  )}`
  return `import OneGraphAuth from "onegraph-auth";
  
      const auth = new OneGraphAuth({
        appId: "${appId}",
      });
  
      /* Usage:
        <${componentName} oneGraphAuth={auth} onLogin={() => console.log("User has successfully logged into ${service.friendlyServiceName}.")} />
      */
      const ${componentName} = ({ oneGraphAuth, onLogin }) => {
        return (
          <button
            onClick={async () => {
              await oneGraphAuth.login("${service.slug}");
              const isLoggedIn = await oneGraphAuth.isLoggedIn("${service.slug}");
              if (isLoggedIn) {
                onLogin();
              }
            }}
          >
          Log in with ${service.friendlyServiceName}
          </button>
        );
      };`
}

export function corsPrompt(appId) {
  const origin = isSsr ? '' : window.location.origin

  return (
    <nav className="cors-prompt">
      <ul>
        <li>
          <a
            className="App-link"
            href={`https://www.onegraph.com/dashboard/app/${appId}?add-cors-origin=${origin}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Please click here to add {origin} to your allowed CORS origins and
            then refresh
          </a>
        </li>
      </ul>
    </nav>
  )
}

export function serverSideAuthTokenConfigurationPrompt(appId) {
  return (
    <>
      It looks like you might not have set your server-side auth token with
      GitHub access in{' '}
      <code>`lib/constants.js:ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN`</code>!
      <br /> You can create one in just a few clicks on{' '}
      <a
        target="_blank"
        href={`https://www.onegraph.com/dashboard/app/${ONE_GRAPH_APP_ID}/auth/server-side`}
      >
        your OneGraph app dashboard here⤴ and then set it as an environmental
        variable: <br />
        <code>ONE_GRAPH_SERVER_SIDE_ACCESS_TOKEN=&lt;your_token&gt;</code> for
        this Next.js application
      </a>
    </>
  )
}
