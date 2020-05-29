import OneGraphAuth from 'onegraph-auth'
import useSWR, { mutate } from 'swr'
import { isSsr } from './common'
import { ONE_GRAPH_APP_ID } from './constants'
import ErrorPage from 'next/error'

// This setup is only needed once per application
export async function basicFetchOneGraph(
  appId,
  accessToken,
  operationsDoc,
  variables,
  operationName
) {
  const authHeaders = !!accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {}

  const result = await fetch(
    `https://serve.onegraph.com/graphql?app_id=${appId}`,
    {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: operationsDoc,
        variables: variables,
        operationName: operationName,
      }),
    }
  )

  const json = await result.json()

  if (!!json.errors) {
    console.warn(`Errors in GraphQL for "${operationName}":`, json.errors)
  }

  return json
}

export function fetchOneGraph(auth, operationsDoc, variables, operationName) {
  return basicFetchOneGraph(
    auth?.appId,
    auth?.accessToken()?.accessToken,
    operationsDoc,
    variables,
    operationName
  )
}

export function checkErrorForCorsConfigurationRequired(error) {
  if (error?.message?.match('not allowed by Access-Control-Allow-Origin')) {
    return true
  }
  return false
}

export function checkErrorForMissingOneGraphAppId(error) {
  window.eeeerror = error
  if (error?.message?.match('app_id must be a valid UUID')) {
    debugger
    return true
  }
  return false
}

/* Get a list of all the supported services for authentication
and authorization that OneGraph supports */
export const query = `
query SupportedServicesQuery {
  oneGraph {
    services {
      service
      friendlyServiceName
      slug
      supportsOauthLogin
      supportsCustomServiceAuth
    }
  }
}`

export function useFetchSupportedServices(auth) {
  const { data, error, loading } = useSWR([query], (query, variables) => {
    return fetchOneGraph(auth, query, variables, 'SupportedServicesQuery')
  })

  if (loading) {
    return { loading: loading }
  }

  const corsConfigurationRequired = checkErrorForCorsConfigurationRequired(
    error
  )

  const missingOneGraphAppId = checkErrorForCorsConfigurationRequired(
    data?.errors && data?.errors[0]
  )

  if (!data) {
    return {
      supportedServices: [],
      corsConfigurationRequired: corsConfigurationRequired,
      missingOneGraphAppId: missingOneGraphAppId,
    }
  }

  const result = data

  const oauthServices = result.data?.oneGraph?.services || []
  const supportedServices = oauthServices
    .filter((service) => service.supportsOauthLogin)
    .sort((a, b) => a.friendlyServiceName.localeCompare(b.friendlyServiceName))

  return {
    supportedServices,
    corsConfigurationRequired: corsConfigurationRequired,
    missingOneGraphAppId: missingOneGraphAppId,
  }
}

export const useAuthGuardian = (auth) => {
  if (isSsr) return { loading: true, user: null, error: null }
  const accessToken = auth.accessToken()

  let decoded = null
  let error = null

  if (!!accessToken) {
    try {
      const payload = atob(accessToken.accessToken.split('.')[1])
      decoded = JSON.parse(payload)
      delete decoded['https://onegraph.com/jwt/claims']
    } catch (e) {
      console.warn(`Error decoding OneGraph jwt for appId=${appId}: `, e)
    }
  }

  return { user: decoded, error: error, loading: false }
}

export const auth = isSsr
  ? {
      accessToken: () => null,
    }
  : new OneGraphAuth({
      appId: ONE_GRAPH_APP_ID,
      oneGraphOrigin: 'https://serve.onegraph.com',
    })

const atob = (str) => {
  return Buffer.from(str, 'base64').toString('binary')
}

const makeOneGraphJwtVerifier = (appId, options = {}) => {
  const jwksClient = require('jwks-rsa')
  const jwt = require('jsonwebtoken')

  const { sharedSecret, strictSsl } = options || {}
  const origin = options.oneGraphOrigin || 'serve.onegraph.com'

  const handler = (token) => {
    const promise = new Promise((resolve, reject) => {
      if (!token) return resolve({ jwt: null })

      let header = (token || '').split('.')[0]

      try {
        header = JSON.parse(atob(header))
      } catch (e) {
        reject('Error decoding JWT, header is invalid: ' + header + e)
      }

      let verifier

      const alg =
        sharedSecret &&
        header &&
        header.alg &&
        ['HS256', 'HS512'].includes(header.alg)
          ? 'HMAC'
          : 'RSA'

      if (alg === 'HMAC' && !sharedSecret) {
        reject(
          "HMAC key used when next.js configured to use RSA. Did you forget to include your `sharedSecret' when creating the OneGraphJWT client?"
        )
      }

      if (alg === 'HMAC') {
        verifier = (token, cb) => {
          jwt.verify(token, sharedSecret, { algorithms: ['HS256'] }, cb)
        }
      } else {
        var client = jwksClient({
          strictSsl,
          jwksUri: `https://${origin}/app/${ONE_GRAPH_APP_ID}/.well-known/jwks.json`,
        })

        function getKey(header, callback) {
          client.getSigningKey(header.kid, function (err, key) {
            var signingKey = (key && key.publicKey) || (key && key.rsaPublicKey)
            if (key) {
              callback(null, signingKey)
            } else {
              reject(
                'No publicKey or rsaPublicKey found on signingKey for JWT in header'
              )
            }
          })
        }

        verifier = (token, cb) =>
          jwt.verify(token, getKey, { algorithms: ['RS256'] }, cb)
      }

      verifier(token, function (err, decoded) {
        resolve(decoded)
      })
    })

    return promise
  }

  return handler
}

const verifyOneGraphJwt = makeOneGraphJwtVerifier(ONE_GRAPH_APP_ID)

export const rawAuthGuardianCookie = (ctx) => {
  var cookie = require('cookie')

  var cookies = cookie.parse(ctx.req?.headers?.cookie || '')

  return cookies.authGuardian
}

export const extractAuthGuardianCookie = async (ctx) => {
  const cookie = rawAuthGuardianCookie(ctx)

  if (!cookie) {
    return {}
  } else {
    return verifyOneGraphJwt(cookie) || null
  }
}

const authGuardianCookieName = `authGuardian`

export const destroyAuth = (auth) => {
  auth.destroy()
  document.cookie = `${authGuardianCookieName}= ; expires = Thu, 01 Jan 1970 00:00:00 GMT`
}

export const saveAuth = (auth) => {
  document.cookie = `${authGuardianCookieName}=${
    auth.accessToken().accessToken
  }`
}

// You can define whatever "logged in" means for you here
// In this case, we say a user is logged in if they have
// an `user.id`, `user.email`, or `user.username` value
export const requireUserLoggedIn = (authGuardianJwt) => {
  const userId =
    authGuardianJwt?.user?.id ||
    authGuardianJwt?.user?.username ||
    authGuardianJwt?.user?.email ||
    null

  return { userId: userId }
}

export const makeLoggedInError = (service) => {
  return (
    <ErrorPage
      title={
        <>
          You must be logged in {!!service ? `to ${service}` : null} in order to
          view this page, but according to your{' '}
          <code>{authGuardianCookieName}</code> cookie you're not logged in via
          any service
        </>
      }
      statusCode={401}
    />
  )
}

export const requireUserRoles = (authGuardianJwt, roles) => {
  const existingRoles = authGuardianJwt?.user?.roles || []
  const isAuthorized = (roles || []).every((role) =>
    existingRoles.includes(role)
  )
  return { isAuthorized: isAuthorized }
}

export const makeMissingRolesError = (authGuardianJwt, roles) => {
  const existingRoles = authGuardianJwt?.user?.roles || []
  const missingRoles = roles.filter((role) => !existingRoles.includes(role))

  return (
    <ErrorPage
      title={
        <>
          I checked your <code>{authGuardianCookieName}</code> JWT and found
          these roles:{' '}
          <code>{JSON.stringify({ user: { roles: existingRoles } })}</code>
          <br />
          However, to view this page you must have at least these roles:{' '}
          <pre>
            <code>{JSON.stringify({ user: { roles: roles } })}</code>
          </pre>
          You're missing these roles:
          <pre>
            <code>{JSON.stringify({ user: { roles: missingRoles } })}</code>
          </pre>
        </>
      }
      statusCode={403}
    />
  )
}
