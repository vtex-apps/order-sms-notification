let currentAccountName = 'account-name-not-set'
let currentFunctionName = 'function-name-not-set'

export function configLog(accountName, functionName) {
  currentAccountName = accountName
  currentFunctionName = functionName
}

export function sendLog(message) {
  console.log(`[${currentAccountName}] [${currentFunctionName}] ${message}`)
}
