import { Apps } from '@vtex/api'
import axios from 'axios'
import { ColossusContext } from 'colossus'
import { json } from 'co-body'

import pkg from '../manifest.json'
import { configLog, sendLog } from './log-helper'
import { getOrder } from './order-fetcher'

const FUNCTION_NAME = 'seller_newOrderSMSNotification'
const APP_MAJOR = pkg.version.split('.')[0]

async function getMobileNumberFromSettings({ vtex }) {
  const filter = `vtex.order-sms-notification@${APP_MAJOR}.x`
  const apps = new Apps(vtex)
  let phone
  await apps.getAppSettings(filter).then((r) => {
    phone = r.mobilePhone
    return phone
  })
  return phone
}

function postMessageCenterSMS(accountName, ctx, mobileNumber, selectedDeliveryChannel, orderId, openTextField, authToken) {
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
        return response
    }).catch((error) => {
      console.log(`\n\n [SMS PROVIDER] - Error calling api. Status: ${error} \n \n`)
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
  const body = await json(ctx.req)
  console.log(`\n\n [ORDER SMS] - Body parsed: \n workspace: ${ctx.vtex.workspace}\n body: ${JSON.stringify(body)} \n orderId: ${body.orderId} \n accountName: ${body.accountName} \n \n`)

  let mobileNumber
  console.log(`\n\n [SETTINGS] - getting mobile phone from app settings \n \n`)
  try {
    mobileNumber = await getMobileNumberFromSettings(ctx)
  } catch (e) {
    console.log(`\n\n [SETTINGS] - Error getting number from settings: \n Error: ${'' + e} \n \n`)
    return {
      data: {
        error: e,
        message: 'Error getting mobile number from app settings',
      },
      status: 500
    }
  }
  
  if(!mobileNumber) {
    console.log(`\n\n [SETTINGS] - Exiting function, no mobile number in app settings. \n \n`)
    return {
      data: {
        error: 'Config error',
        message: 'No mobile number found in app settings...'
      },
      status: 500,
    }
  }
  
  
    console.log(`\n\n [MASTER DATA] - getting order data \n \n`)
    const orderData = await getOrder(body.accountName, body.orderId, authToken)

    if(orderData === null) {
      console.log(`\n\n [MASTER DATA] - Exiting function, order data not found... \n \n`)
      return {
        data: {
          message: 'Exiting function, order data not found...'
        },
        status: 500
      }
    }

    // valida se é pedido do instore, nesse caso sair da funcao -- ainda precisa fazer o loop dentro do customApps
    if(orderData.customData != null && (orderData.customData.customApps[0].fields['cart-type'] === 'INSTORE' || orderData.customData[0].fields[0]['cart-type'] === 'INSTORE_DELIVERY')){
      console.log(`\n\n [MASTER DATA] - Exiting function, order is NOT inStore... \n \n`)
      return {
        data: {
          message: 'Exiting function, order is NOT inStore...'
        },
        status: 500
      }
    }
    console.log(`\n\n [MASTER DATA] - order ${orderData.orderId} is inStore:\n SLA: ${orderData.shippingData.logisticsInfo[0].deliveryChannel} \n Custom data: ${orderData.customData} \n \n`)

    console.log(`\n\n [MASTER DATA] - parsing order data... \n \n`)
    const deliveryChannel = orderData.shippingData ? orderData.shippingData.logisticsInfo[0].deliveryChannel : null
    const openTextField = orderData.openTextField ? orderData.openTextField.value : null
    console.log(`\n\n [MASTER DATA] -> pedido - ${orderData.orderId} - tipo de entrega: ${deliveryChannel} - observação: ${openTextField} \n \n`)
    console.log(`\n\n [MESSAGE CENTER] - calling function postMessageCenterSMS... \n \n`)
    const response = await postMessageCenterSMS(body.accountName, ctx, mobileNumber, deliveryChannel, orderData.orderId, openTextField, authToken)
    console.log(`\n\n [MESSAGE CENTER] - FINISHED CALLING MESSAGE CENTER, RETURNING THIS RESPONSE: \n ctx.response.status: ${response.status} \n ctx.response.body:\n`)
    console.log(response.data)
    console.log('\n')
    return response
}

export default {
  routes: {
    sms: async (ctx: ColossusContext) => {
      console.log('\n\n [ORDER SMS] - Just received a request! \n \n')
      let { vtex: { account, authToken } } = ctx
      authToken = ctx.vtex.authToken
      ctx.set('Cache-Control', 'no-cache')
      const res = await sendSMS(account, authToken, ctx)
      ctx.response.status = res.status
      ctx.response.body = res.data
    }
  },
}



