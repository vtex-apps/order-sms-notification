import { Apps } from '@vtex/api'
import axios from 'axios'
import { json } from 'co-body'
import { ColossusContext } from 'colossus'
import SplunkEvents from 'splunk-events'

import pkg from '../manifest.json'
import { configLog, sendLog } from './log-helper'
import { getOrder } from './order-fetcher'

const FUNCTION_NAME = 'seller_newOrderSMSNotification'
const APP_MAJOR = pkg.version.split('.')[0]
const SPLUNK_ENDPOINT = 'splunk-heavyforwarder-public.vtex.com'
const splunkEvents = new SplunkEvents()

function logEvent(level, type, workflow, event) {
  console.log(`\n\n [SPLUNK] - Sending log, level: ${level}, type: ${type}, workflow: ${workflow}, event: ${event.toString()}\n \n`)
  try {
    splunkEvents.logEvent(
      level,
      type,
      workflow,
      '-',
      event
    )
  } catch (e) {
    console.log(`\n\n [SPLUNK] - Error sending log: ${e.toString()} \n\n`)
  }
}

async function getMobileNumberFromSettings({ vtex }) {
  // const filter = `vtex.order-sms-notification@${APP_MAJOR}.x`
  const filter = 'vtex.order-sms-notification'
  const apps = new Apps(vtex)
  let phone
  await apps.getAppSettings(filter).then((r) => {
    phone = r.mobilePhone
    return phone
  })
  return phone
}

function postMessageCenterSMS(accountName, ctx, mobileNumber, selectedDeliveryChannel, orderId, openTextField, authToken) {
  logEvent('Important', 'Info', 'post-message-center-sms', {
    account: accountName,
    accountName,
    mobileNumber,
    orderId,
    sourceType: 'KPI',
    step: 'start'
  })
  const payload = getMessageCenterPayload(mobileNumber, selectedDeliveryChannel, orderId, openTextField)
  const url = `http://sms-provider.vtex.aws-us-east-1.vtex.io/${accountName}/${ctx.vtex.workspace}/api/sms-provider`
  console.log('\n\n [SMS PROVIDER] - Starting Request to SMS provider API \n \n')

    return axios({
      data: payload,
      headers: {
        'Authorization': authToken,
        'Proxy-Authorization': authToken,
      },
      method: 'post',
      responseType: 'stream',
      url,
    }).then((response) => {
      console.log(`\n\n [SMS PROVIDER] - Success calling api. Status: ${response.status} \n \n`)
      logEvent('Important', 'Info', 'post-message-center-sms', {
        account: accountName,
        message: 'Success calling sms provider (message center)',
        mobileNumber,
        payloadMessage: payload.messagetext,
        responseStatus: response.status,
        sourceType: 'LOG'
      })
      return response
    }).catch((error) => {
      console.log(`\n\n [SMS PROVIDER] - Error calling api. Status: ${error} \n \n`)
      logEvent('Critical', 'Error', 'post-message-center-sms', {
        account: accountName,
        error: error.toString(),
        message: 'Error calling sms provider (message center)',
        mobileNumber,
        payloadMessage: payload.messagetext,
        responseStatus: 503,
        sourceType: 'LOG'
      })
      return {
        data: {
          error,
          message: 'Erro na hora de chamar o sms provider (message center)',
        },
        status: 503,
      }
    })
}

function getMessageCenterPayload(mobileNumber, selectedDeliveryChannel, orderId, openTextField) {
  let text = ''
  if (openTextField != null) {
    text =  `Novo pedido para sua loja do tipo ${selectedDeliveryChannel}! Pedido - ${orderId} - O vendedor desse cliente: ${openTextField}`
  } else {
    text = `Novo pedido para sua loja do tipo ${selectedDeliveryChannel}! Pedido - ${orderId}`
  }
  return {
    destination: mobileNumber,
    messagetext: text,
  }
  
}

async function sendSMS(accountName: string, authToken: string, ctx: ColossusContext) {
  configLog(accountName, FUNCTION_NAME)
  sendLog(
    `Initiating SMS notification for accountName ${accountName}`,
  )
  console.log('\n\n [ORDER SMS] - Parsing body... \n \n')
  let body
  logEvent('Important', 'Info', 'parse-request-body', {
    account: accountName,
    sourceType: 'KPI',
    step: 'start'
  })
  try {
    body = await json(ctx.req)
  } catch (e) {
    logEvent('Critical', 'Error', 'parse-request-body', {
      account: accountName,
      error: e,
      sourceType: 'LOG',
    })
    return {
      data: {
        error: e.toString(),
        message: 'Error parsing request body',
      },
      status: 500
    }
  }
  console.log(`\n\n [ORDER SMS] - Body parsed: \n workspace: ${ctx.vtex.workspace}\n body: ${JSON.stringify(body)} \n orderId: ${body.orderId} \n accountName: ${body.accountName} \n \n`)
  logEvent('Important', 'Info', 'parse-request-body', {
    account: accountName,
    bodyAccountName: body.accountName,
    bodyOrderId: body.orderId,
    sourceType: 'KPI',
    step: 'end'
  })


  let mobileNumber
  console.log(`\n\n [SETTINGS] - getting mobile phone from app settings \n \n`)
  logEvent('Important', 'Info', 'get-settings', {
    account: accountName,
    bodyAccountName: body.accountName,
    bodyOrderId: body.orderId,
    sourceType: 'KPI',
    step: 'start'
  })
  try {
    mobileNumber = await getMobileNumberFromSettings(ctx)
  } catch (e) {
    console.log(`\n\n [SETTINGS] - Error getting number from settings: \n Error: ${'' + e} \n \n`)
    logEvent('Critical', 'Error', 'get-settings', {
      account: accountName,
      error: e.toString(),
      message: 'Error getting mobile number from app settings (VBASE)... perhaps it is not configured in my-apps settings in myvtex admin...',
      responseStatus: 503,
      sourceType: 'LOG',
    })
    return {
      data: {
        error: e,
        message: 'Error getting mobile number from app settings (vbase)',
      },
      status: 503
    }
  }
  
  if(!mobileNumber) {
    console.log(`\n\n [SETTINGS] - Exiting function, no mobile number in app settings. \n \n`)
    logEvent('Critical', 'Error', 'get-settings', {
      account: accountName,
      message: 'Mobile number is empty in app settings...',
      responseStatus: 500,
      sourceType: 'LOG',
    })
    return {
      data: {
        error: 'Config error',
        message: 'No mobile number found in app settings...'
      },
      status: 500,
    }
  }
  console.log(`\n\n [SETTINGS] - got this mobile number: ${mobileNumber} \n \n`)
  logEvent('Important', 'Info', 'get-settings', {
    account: accountName,
    bodyAccountName: body.accountName,
    bodyOrderId: body.orderId,
    mobileNumber,
    sourceType: 'KPI',
    step: 'end'
  })
  
  console.log(`\n\n [OMS] - getting order data \n \n`)
  logEvent('Important', 'Info', 'get-order-data', {
    account: accountName,
    bodyAccountName: body.accountName,
    bodyOrderId: body.orderId,
    mobileNumber,
    sourceType: 'KPI',
    step: 'start'
  })
  let orderData
  try {
    orderData = await getOrder(body.accountName, body.orderId, authToken)
  } catch (e) {
    logEvent('Critical', 'Error', 'get-order-data', {
      account: accountName,
      error: e.toString(),
      message: 'Error getting order data...',
      mobileNumber,
      responseStatus: 500,
      sourceType: 'LOG',
    })
    return {
      data: {
        error: e.error,
        message: 'Exiting function, error getting order data...'
      },
      status: 503
    }
  }
  console.log(`\n\n [OMS] - GOT THIS: ${orderData} \n \n`)

  if(!orderData) {
    console.log(`\n\n [OMS] - Exiting function, order data is empty... \n \n`)
    logEvent('Critical', 'Error', 'get-order-data', {
      account: accountName,
      bodyAccountName: body.accountName,
      bodyOrderId: body.orderId,
      message: 'Exiting function, order data is empty...',
      mobileNumber,
      sourceType: 'KPI',
      step: 'end'
    })
    return {
      data: {
        message: 'Exiting function, order data is empty...'
      },
      status: 500
    }
  }

  logEvent('Important', 'Info', 'get-order-data', {
    account: accountName,
    bodyAccountName: body.accountName,
    bodyOrderId: body.orderId,
    mobileNumber,
    sourceType: 'KPI',
    step: 'end'
  })

  logEvent('Important', 'Info', 'check-order-instore', {
    account: accountName,
    bodyAccountName: body.accountName,
    bodyOrderId: body.orderId,
    mobileNumber,
    sourceType: 'KPI',
    step: 'start'
  })

  // valida se é pedido do instore, nesse caso sair da funcao -- ainda precisa fazer o loop dentro do customApps
  if(orderData.customData != null && (orderData.customData.customApps[0].fields['cart-type'] === 'INSTORE' || orderData.customData[0].fields[0]['cart-type'] === 'INSTORE_DELIVERY')){
    console.log(`\n\n [MASTER DATA] - Exiting function, order is NOT inStore... \n \n`)
    logEvent('Important', 'Info', 'check-order-instore', {
      account: accountName,
      bodyAccountName: body.accountName,
      bodyOrderId: body.orderId,
      message: 'Exiting function, order is inStore so message was not sent...',
      mobileNumber,
      responseStatus: 204,
      sourceType: 'KPI',
      step: 'end'
    })
    return {
      data: {
        message: 'Exiting function, order is NOT inStore so message was not sent...'
      },
      status: 204 // returns 2xx so masterdata doesn't retry, since it's pointless
    }
  }
  console.log(`\n\n [MASTER DATA] - order ${orderData.orderId} is inStore:\n SLA: ${orderData.shippingData.logisticsInfo[0].deliveryChannel} \n Custom data: ${orderData.customData} \n \n`)

  console.log(`\n\n [MASTER DATA] - parsing order data... \n \n`)
  const deliveryChannel = orderData.shippingData ? orderData.shippingData.logisticsInfo[0].deliveryChannel : null
  const openTextField = orderData.openTextField ? orderData.openTextField.value : null
  console.log(`\n\n [MASTER DATA] -> pedido - ${orderData.orderId} - tipo de entrega: ${deliveryChannel} - observação: ${openTextField} \n \n`)
  console.log(`\n\n [MESSAGE CENTER] - calling function postMessageCenterSMS... \n \n`)
  logEvent('Important', 'Info', 'check-order-instore', {
    account: accountName,
    bodyAccountName: body.accountName,
    bodyOrderId: body.orderId,
    message: 'Order is NOT instore so SMS was sent',
    mobileNumber,
    sourceType: 'KPI',
    step: 'end'
  })
  const response = await postMessageCenterSMS(body.accountName, ctx, mobileNumber, deliveryChannel, orderData.orderId, openTextField, authToken)
  console.log(`\n\n [MESSAGE CENTER] - FINISHED CALLING MESSAGE CENTER, RETURNING THIS RESPONSE: \n ctx.response.status: ${response.status} \n ctx.response.body:\n`)
  logEvent('Important', 'Info', 'post-message-center-sms', {
    account: accountName,
    bodyAccountName: body.accountName,
    mobileNumber,
    orderId: body.orderId,
    responseStatus: response.status,
    sourceType: 'KPI',
    step: 'end'
  })
  console.log(response.data)
  console.log('\n')
  return response
}

export default {
  routes: {
    sms: async (ctx: ColossusContext) => {
      // fetcher to log events to splunk depends on colossus context
      function splunkCustomFetcher(context) {
        const headers = context.headers || {}
        return axios({
          ...context,
          headers: {
            ...headers,
            'Proxy-Authorization': ctx.vtex.authToken,
            'X-Vtex-Proxy-To': `https://${SPLUNK_ENDPOINT}:8088`,
          }
        })
      }
      console.log('\n\n [ORDER SMS] - Just received a request! Configuring splunk to start... \n \n')
      splunkEvents.config({
        debug: true,
        endpoint: `http://${SPLUNK_ENDPOINT}`,
        request: splunkCustomFetcher,
        token: '473bad07-24e0-4c46-964e-d6f059ec8789',
      })
      console.log('\n\n [ORDER SMS] - Splunk configured, let\'s start \n \n')
      let { vtex: { account, authToken } } = ctx
      authToken = ctx.vtex.authToken
      ctx.set('Cache-Control', 'no-cache')
      logEvent('Important', 'Info', 'request-received', {
        account,
        sourceType: 'KPI',
      })
      const res = await sendSMS(account, authToken, ctx)
      logEvent('Important', 'Info', 'request-responded', {
        account,
        reponseError: res.data.message || 'There was no error in response data...',
        reponseMessage: res.data.message || 'There was no message in response data...',
        responseStatus: res.status || 'There was no status in reponse data...',
        sourceType: 'KPI',
      })
      ctx.response.status = res.status
      ctx.response.body = res.data
    }
  },
}



