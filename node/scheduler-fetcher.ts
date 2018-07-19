import fetchHelper from './fetch-helper'


type SchedulerPayloadType = {
  id?: string
  scheduler: {
    type: string
    // V2: Will go back to this version
    // expression: string
    cron: string
    endDate: string
  }
  action: {
    type: string
    uri: string
    headers: {
      accept: string
      'content-type': string
    }
    method: string
    body: object
  }
}

// V2: Will go back to this version
// const getSchedulerEndpoint = (accountName, app, workspace = 'master') =>
//   `https://${accountName}.vtexcommercestable.com.br/api/scheduler/${workspace}/${app}`
const getSchedulerEndpoint = (accountName, app, workspace = 'master') =>
  app && workspace ? `http://api.vtex.com/${accountName}/scheduler` : ''

const getPayloadScheduler = (
    accountName,
  functionName,
  body,
  schedulerId,
  workspace = 'master'
) => {
  const functionURI = `https://${workspace}--${accountName}.myvtex.com/_v/order-sms-notification`
  const uri =
    workspace === 'master'
      ? functionURI
      : `${functionURI}?workspace=${workspace}`
  const payload: SchedulerPayloadType = {
    scheduler: {
      // V2: Will go back to this version
      // type: 'recurrent-cron',
      // expression: '*/5 * * * *',
      
      type: 'cron',
      cron: '*/5 * * * *',
      endDate: '2020-12-01T00:00:00Z',
    },
    action: {
      type: 'request',
      uri,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'GET',
      body: {  
        "text": "oi bruzzi" 
        
    }
    },
  }
  if (schedulerId) {
    payload.id = schedulerId
  }
  return payload
}



export function setScheduler(
  accountName,
  functionName,
  workspace,
  body,
  s3token,
  schedulerId = null
) {
  schedulerId = schedulerId || `${accountName}-recurrent-cron-v1`
  const schedulerEndpoint = getSchedulerEndpoint(
    accountName,
    functionName,
    workspace
  )
  return fetchHelper(schedulerEndpoint, {
    method: 'PUT',
    headers: {
      'X-VTEX-API-AppToken': s3token,
      'X-VTEX-API-AppKey': 'vtexappkey-appvtex',
    },
    body: JSON.stringify(
      getPayloadScheduler(accountName, functionName, body, schedulerId, workspace)
    ),
  })
}

export function deleteScheduler(
  accountName,
  functionName,
  workspace,
  schedulerId,
  s3token
) {
  const schedulerEndpoint = `${getSchedulerEndpoint(
    accountName,
    functionName,
    workspace
  )}/${schedulerId}`
  return fetchHelper(schedulerEndpoint, {
    method: 'DELETE',
    headers: {
      'X-VTEX-API-AppToken': s3token,
      'X-VTEX-API-AppKey': 'vtexappkey-appvtex',
    },
  })
}
