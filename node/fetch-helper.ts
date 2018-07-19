import fetch from 'node-fetch'
import { sendLog } from './log-helper'

const DEFAULT_TIMEOUT = 10000

type fetchOptions = {
  headers?: object
  body?: any
  timeout?: number
  retries?: number
  method?: string
}

const DEFAULT_OPTIONS: fetchOptions = {
  headers: {},
  timeout: null,
  retries: null
}

class CustomRequestError extends Error {
  type = 'custom-request-error'
  response = null
}

function fetchWithRetries(url, options, retries) {
  return fetch(url, options)
    .then(response => {
      sendLog(
        `url finished: ${url} ${response.statusText ||
          response.status.toString()} options: ${JSON.stringify(options)}`
      )
      if (response.status >= 400 && response.status < 600) {
        const statusText = response.statusText || response.status.toString()
        const error = new CustomRequestError(`Request Error ${statusText}`)
        error.response = response.json()
        return Promise.reject(error)
      }

      const responseCopy = response.clone()
      return responseCopy.json().catch(() => response.text())
    })
    .catch(error => {
      sendLog(`Error on request: ${url}, ${error.type} - ${error.message}`)
      if (error.type === 'request-timeout' && retries > 0) {
        sendLog(`WARNING: Retrying request to ${url} (retry number ${retries})`)
        return fetchWithRetries(url, options, retries - 1)
      }
      if (error.response) {
        return error.response.then(errorData => {
          return Promise.reject({
            ...errorData,
            error
          })
        })
      }
      return Promise.reject(error)
    })
}

export default function fetchHelper(url, options = DEFAULT_OPTIONS) {
  const fetchOptions = {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers
    },
    timeout: options.timeout || DEFAULT_TIMEOUT
  }
  const retries = options.retries || 1
  return fetchWithRetries(url, fetchOptions, retries)
}
