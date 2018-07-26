import fetchHelper from './fetch-helper'
import { sendLog, configLog } from './log-helper'
import { getFeed, getOrder } from './order-fetcher'
import { ColossusContext } from 'colossus';
import axios from 'axios'
import {json } from 'co-body'

const FUNCTION_NAME = 'seller_newOrderSMSNotification'

const MD_ENDPOINT = 'https://api.vtex.com'

function getSellerStoreData(accountName, authToken) {
  const url = `${MD_ENDPOINT}/${accountName}/dataentities/stores/search?_fields=_all`
  return fetchHelper(url, {
    headers: {
      'Proxy-Authorization': authToken,
      'VtexIdclientAutCookie': authToken,
      'X-Vtex-Proxy-To': 'https://api.vtex.com',
    },
  })
}


function postMessageCenterSMS(accountName, mobileNumber, selectedDeliveryChannel, orderId, openTextField, authToken) {
  const payload = getMessageCenterPayload(mobileNumber, selectedDeliveryChannel, orderId, openTextField)
  const url = `http://sms-provider.vtex.aws-us-east-1.vtex.io/${accountName}/lowbeer/api/sms-provider`

            return axios({
              headers: {
                'Proxy-Authorization': authToken,
                'Authorization': authToken,
              },
                method: 'post',
                responseType: 'stream',
                url: url,
                data: payload,
            }).then(function(response){      
                console.log('o response de sucesso é gigantesco, nao vale a pena logar. Mas deu tudo certo.')
                return response.data
            }).catch(function(error){
                return error
            })
}


function commitOrderFeed(accountName, orderToken, authToken) {
  const payload = [
    {
      commitToken: orderToken
    }
  ]
  console.log('>>>> payload',payload)
  const url = `http://${accountName}.vtexcommercestable.com.br/api/oms/pvt/feed/orders/status/confirm`
  return fetchHelper(url, {
    method: 'POST',
    body: payload,
    headers: {
      'X-Vtex-Proxy-To': `https://${accountName}.vtexcommercestable.com.br`,
      Authorization: authToken,
    },
  })
}

/* async function checkStoreEntity(accountName, authToken) {
  var extraEndpoint = `http://${accountName}.vtexcommercestable.com.br/api/dataentities/stores/schemas/v2`
  return fetchHelper(extraEndpoint, {
    headers: {
      'Authorization': authToken,
      'X-Vtex-Proxy-To': `https://${accountName}.vtexcommercestable.com.br`,
    },
    timeout: 3000,
    retries: 3,
  }).then(response => {
    return {
      id: Object.keys(response.data)[0],
    }
  })
} */

function getMessageCenterPayload(mobileNumber, selectedDeliveryChannel, orderId, openTextField) {
  let text = '';
  if (openTextField != null) {
    text =  'Novo pedido para sua loja do tipo ' + selectedDeliveryChannel + "! Pedido - " + orderId + ". O vendedor desse cliente: " + openTextField;
  } else {
    text = 'Novo pedido para sua loja do tipo ' + selectedDeliveryChannel + "! Pedido - " + orderId;
  }
  return {
   
      destination: mobileNumber,
      messagetext: text,
    }
  
}

async function checkFeed(
  accountName,
  maxLot = 20,
  authToken
) {
  const orders = await getFeed(accountName, maxLot, authToken)

  console.log('Orders retrieved on feed: ', orders)
  
  if (orders == null) {
    return
  }

  //const feedOrders = orders.filter(({ status }) => status === 'order-accepted' || status === 'waiting-ffmt-authorization' || status === 'window-to-cancel' || status === 'authorize-fulfillment' || status === 'ready-for-handling')
  //console.log('All orders in feed >>>', feedOrders)
  return orders
}

function rejectWithError(errorMessage) {
  sendLog(errorMessage)
  return Promise.reject({
    success: false,
    message: errorMessage,
  })
}

async function sendSMS(accountName: string, authToken: string, ctx: object) {
  configLog(accountName, FUNCTION_NAME)
  sendLog(
    `Initiating SMS notification for accountName ${accountName}`,
  )

  var body = await json(ctx.req)

  console.log('>>>>> orderId: ', body.orderId)
  console.log('>>>>> accountName: ', body.accountName)

  /*
  //vai no mktplace e pega o seller responsável pela entrega do pedido
  const mktplaceOrderData = await getOrder(body.accountName, body.orderId, authToken)
  console.log('>>>> SELLER ORDER ID: ' + mktplaceOrderData.sellerOrderId + ' SELLER: ' + mktplaceOrderData.shippingData.sellers[0].id)

  if(mktplaceOrderData === null) {
    console.log('Exiting function, order data not found.')
    return
  }

  if(mktplaceOrderData.shippingData.sellers[0].id = "1"){
    console.log('Exiting function, seller is e-commerce.')
    return
  }

  let sellerAccountName = mktplaceOrderData.shippingData.sellers[0].id
  let sellerOrderId = mktplaceOrderData.sellerOrderId
  */

  

  /* 
  //valida se o schema stores tem propriedade mobileNumber
  let storeEntityData = null
  try {  storeEntityData = await checkStoreEntity(accountName, authToken)
  } catch (e) {
      return rejectWithError(
        `Error on request from master data client to verify Entity schema with accountName ${accountName}: ${e}`,
      )
    }
  
  if (typeof storeEntityData.properties.mobileNumber == 'undefined'){
    return 'Your store must configure the Entity  - stores - to include the variable - mobileNumber.'
  }
  sendLog(
    `${accountName} has correct Master Data configuration.`
  ) */

  let storeData = null

  try {
    storeData = await getSellerStoreData(body.accountName, authToken)
  } catch (e) {
    console.log(e)
    return rejectWithError(
      `Error on request from master data client to retrieve Store information with accountName ${body.accountName}: ${e}`,
    )
  }
  sendLog(
    `StoreData received from accountName ${body.accountName}`,
  )

  console.log('>>>> SMS will notify: ', storeData[0].mobileNumber)
  
  if(storeData[0].mobileNumber === null) {
    console.log('Exiting function, no mobile number registered for notification.')
    return
  }
  
  

    const orderData = await getOrder(body.accountName, body.orderId, authToken)

    if(orderData === null) {
      console.log('Exiting function, order data not found.')
      return
    }
    
    // validar se é pedido do instore, nesse caso sair da funcao
    if(orderData.customData.customApps[0].fields.cart-type = "INSTORE" || orderData.customData[0].fields[0].cart-type = "INSTORE_DELIVERY"){
      console.log('Exiting function, order is inStore.')
      return
    }

    console.log('>>>> ORDER ID: ' + orderData.orderId + ' SLA: ' + orderData.shippingData.logisticsInfo[0].deliveryChannel)

    

    /*
    const string = orderData.marketplaceServicesEndpoint.split('an=')
    const accountNameMktpPlace = string[1]
    */

    const deliveryChannel = orderData.shippingData ? orderData.shippingData.logisticsInfo[0].deliveryChannel : null
    const openTextField = orderData.openTextField ? orderData.openTextField.value : null
    console.log('pedido - '+ orderData.orderId + '- tipo de entrega: ' + deliveryChannel + ' - observacao: ' +  openTextField)
    const response = await postMessageCenterSMS(body.accountName, storeData[0].mobileNumber, deliveryChannel, orderData.orderId, openTextField, authToken)
  
    
    
    
/*  let feedOrders = null

  try {
    feedOrders = await checkFeed(accountName, maxLot, authToken)
  } catch (e) {
    console.log(e)
    return rejectWithError(
      `Error on request from OMS Feed client with accountName ${accountName}: ${e}`,
    )
  }

  if (feedOrders === null) {
    console.log('Exiting function, no orders in feed to filter.')
    return
  }
  
  const usableOrders = feedOrders.filter( (order) => order && order.status === 'ready-for-handling')
  console.log('>>>> Usable orders',usableOrders)

  if (usableOrders === null) {
    console.log('Exiting function, no orders to notify.')
    return
  }

  const unusableOrders = feedOrders.filter((order) => order && order.status !== 'ready-for-handling')
  console.log('>>>> Unusable Orders ', unusableOrders)

  unusableOrders.forEach(async order => {

    console.log('Removing from feed: ' + order.orderId + 'orderToken - ' + JSON.stringify(order.commitToken))
    let commit
    try {
      commit = await commitOrderFeed(accountName, order.commitToken, authToken)
    } catch (e) {
      console.log(e.message)
      return rejectWithError(
        `Error on request to commit order  ${order.orderId}: ${e.message}`,
      )
    }
  })

  
  usableOrders.forEach(async order => {
    const orderData = await getOrder(accountName, order.orderId, authToken)
    const string = orderData.marketplaceServicesEndpoint.split('an=')
    const accountNameMktpPlace = string[1]
    const deliveryChannel = orderData.shippingData ? orderData.shippingData.logisticsInfo[0].deliveryChannel : null
    const openTextField = orderData.openTextField ? orderData.openTextField.value : null
    console.log('pedido - '+ orderData.orderId + '- tipo de entrega: ' + deliveryChannel + ' - observacao: ' +  openTextField)
    const response = await postMessageCenterSMS(accountName, storeData[0].mobileNumber, deliveryChannel, orderData.orderId, openTextField, authToken)
    console.log('resposta - ' + response)
    console.log('orderToken for orderId - '+ orderData.orderId + ' - ' + JSON.stringify(order.commitToken))
    let commit
    try {
      commit = await commitOrderFeed(accountName, order.commitToken, authToken)
    } catch (e) {
      console.log(e.message)
      return rejectWithError(
        `Error on request to commit order  ${orderData.orderId}: ${e.message}`,
      )
    }
  })

  */

  return
}

export default {
  routes: {
    sms: async (ctx: ColossusContext) => {
      var { vtex: { account, authToken } } = ctx
      authToken = ctx.vtex.authToken
      ctx.set('Cache-Control', 'no-cache')
      await sendSMS(account, authToken, ctx)
      ctx.response.status = 200
      ctx.response.body = {
        code: 'success',
        message: 'SMS sent successfuly'
      }
    }
  },
}



