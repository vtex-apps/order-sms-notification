import fetchHelper from './fetch-helper'
import { sendLog } from './log-helper'

const CORRECT_STATE = 'ready-for-handling'
const FUTURE_STATE_CHANGE = 'start-handling'
const FUTURE_STATE = 'invoiced'

const getCheckoutEndpoint = accountName =>
  `http://${accountName}.vtexcommercestable.com.br/api/checkout`

const getOMSEndpoint = accountName =>
  `http://${accountName}.vtexcommercestable.com.br/api/oms`

const getMDEndpoint = (accountName, acronym) =>
  `http://api.vtex.com/${accountName}/dataentities/${acronym}/documents`


export function getFeed(accountName, maxLot, authToken) {
  const omsEndpoint = getOMSEndpoint(accountName)
  const feedUrl = `${omsEndpoint}/pvt/feed/orders/status?maxLot=${maxLot}`
  return fetchHelper(feedUrl, {
    headers: {
      'X-Vtex-Proxy-To': `https://${accountName}.vtexcommercestable.com.br`,
      Authorization: authToken,
    }
  })
}

export function getOrderForm(accountName, orderFormId) {
  const checkoutEndpoint = getCheckoutEndpoint(accountName)
  const checkoutUrl = `${checkoutEndpoint}/pub/orderForm/${orderFormId}`
  return fetchHelper(checkoutUrl)
}

export function getOrder(accountName, orderId, authToken) {
  const omsEndpoint = getOMSEndpoint(accountName)
  const omsUrl = `${omsEndpoint}/pvt/orders/${orderId}`
  return fetchHelper(omsUrl, {
    headers: {
      'X-Vtex-Proxy-To': `https://${accountName}.vtexcommercestable.com.br`,
      'Proxy-Authorization': authToken,
      'VtexIdclientAutCookie': authToken,
    }
  })
}

export function addCart(accountName, orderFormId, itemsPayload) {
  const checkoutEndpoint = getCheckoutEndpoint(accountName)
  const checkoutUrl = `${checkoutEndpoint}/pub/orderForm/${orderFormId}/items`
  return fetchHelper(checkoutUrl, {
    method: 'POST',
    body: JSON.stringify(itemsPayload),
    headers: {
      'X-Vtex-Proxy-To': `https://${accountName}.vtexcommercestable.com.br`,
    }
  })
}

function leftPad(value) {
  value = parseInt(value, 10)
  if (value < 10) {
    return `0${value}`
  }
  return value.toString()
}

function formatInternationalDate(date) {
  const year = date.getFullYear()
  const day = leftPad(date.getDate())
  const month = leftPad(date.getMonth() + 1)
  return `${year}-${month}-${day}`
}

export function invoiceOrder({
  accountName,
  orderId,
  invoiceType,
  invoiceNumber,
  invoiceValue,
  invoiceUrl,
  items,
  headers
}) {
  const omsEndpoint = getOMSEndpoint(accountName)
  return fetchHelper(`${omsEndpoint}/pvt/orders/${orderId}/invoice`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      invoiceNumber,
      invoiceValue,
      invoiceUrl,
      issuanceDate: formatInternationalDate(new Date()),
      trackingNumber: null,
      trackingUrl: null,
      type: invoiceType,
      items: items
    }),
    retries: 3
  })
}

function getXmlTagValue(xml, tagName) {
  const begin = xml.indexOf(`<${tagName}>`) + `<${tagName}>`.length
  const end = xml.indexOf(`</${tagName}>`, begin)
  return xml.substring(begin, end)
}

function getXmlTagPropertyValue(xml, tagName, property) {
  let begin = xml.indexOf(`<${tagName}`) + `<${tagName}`.length
  begin = xml.indexOf(`${property}="`, begin) + `${property}="`.length
  const end = xml.indexOf(`"`, begin)
  return xml.substring(begin, end)
}

function getInvoiceNumber(xml) {
  if (!xml) {
    return null
  }
  return (
    getXmlTagPropertyValue(xml, 'infNFe', 'Id') ||
    getXmlTagPropertyValue(xml, 'infCFe', 'Id')
  )
}

function getCancelInvoiceNumber(xml) {
  if (!xml) {
    return null
  }
  return (
    getXmlTagValue(xml, 'chNFe') || getXmlTagPropertyValue(xml, 'infCFe', 'Id')
  )
}

function getInvoiceUrl(accountName, orderId, acronym) {
  return `${getMDEndpoint(accountName, acronym)}/${orderId}`
}

function rejectWithError(
  errorMessage,
  shouldRetry = false,
  extraErrorInfo = {}
) {
  sendLog(errorMessage)
  return Promise.reject({
    message: errorMessage,
    shouldRetry,
    ...extraErrorInfo
  })
}

export function updateFiscalNote(
  accountName,
  order,
  authToken,
  cfeXml,
  type = 'Output'
) {
  const { orderId } = order

  const invoiceNumber =
    type === 'Input' ? getCancelInvoiceNumber(cfeXml) : getInvoiceNumber(cfeXml)

  if (!invoiceNumber) {
    return rejectWithError(
      `Error finding invoiceNumber (${invoiceNumber}) on xml ${cfeXml}`
    )
  }

  const mdEntity =
    type === 'Input' ? 'CANCEL_ORDER_FISCAL_CODE' : 'ORDER_FISCAL_CODE'

  if (order.packageAttachment && order.packageAttachment.packages) {
    let alreadyHasInvoiceNumber = false

    order.packageAttachment.packages.forEach(orderPackage => {
      alreadyHasInvoiceNumber =
        alreadyHasInvoiceNumber ||
        (orderPackage.type === type &&
          orderPackage.invoiceNumber === invoiceNumber)
    })

    if (alreadyHasInvoiceNumber) {
      return rejectWithError(
        `The fiscal note with number ${invoiceNumber} and type ${
          type
        } already exists on order ${orderId}`,
        false, // should not retry
        { alreadyHasInvoiceNumber }
      )
    }
  }

  const headers = {
    'Proxy-Authorization': authToken,
    'VtexIdclientAutCookie': authToken,
    'X-Vtex-Proxy-To': `https://${accountName}.vtexcommercestable.com.br`,
  }

  return invoiceOrder({
    accountName,
    orderId,
    invoiceType: type,
    invoiceNumber,
    invoiceValue: order.value,
    invoiceUrl: getInvoiceUrl(accountName, orderId, mdEntity),
    items: order.items,
    headers
  }).catch(e => {
    e.shouldRetry = true
    return Promise.reject(e)
  })
}

export function updateCancelFiscalNote(accountName, order, cfeXml, authToken) {
  return updateFiscalNote(accountName, order, cfeXml, authToken, 'Input')
}

export function changeOrderStatus(
  accountName,
  order,
  authToken,
  correctState = CORRECT_STATE,
  futureStateChange = FUTURE_STATE_CHANGE,
  futureState = FUTURE_STATE
) {
  const { orderId } = order
  if (order.status === futureState) {
    sendLog(`Order ${orderId} is already with status ${futureState}`)
    return Promise.resolve({ success: true })
  }
  if (order.status !== correctState) {
    return rejectWithError(
      `Order ${order.orderId} with incorrect status ${
        order.status
      } instead of ${correctState}`,
      true
    )
  }
  const omsEndpoint = getOMSEndpoint(accountName)
  const omsUrl = `${omsEndpoint}/pvt/orders/${orderId}/changestate/${
    futureStateChange
  }`
  const headers = {
    'Proxy-Authorization': authToken,
    'VtexIdclientAutCookie': authToken,
    'X-Vtex-Proxy-To': `https://${accountName}.vtexcommercestable.com.br`,
  }
  return fetchHelper(omsUrl, {
    method: 'POST',
    headers,
    retries: 3
  }).catch(e => {
    e.shouldRetry = true
    return Promise.reject(e)
  })
}
