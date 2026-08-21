import { AsyncLocalStorage } from 'node:async_hooks'

const requestStorage = new AsyncLocalStorage()

export function withRequestStore(request,response,next) {
  requestStorage.run({request,response,transactionAudited:false},next)
}

export function currentRequestStore() {
  return requestStorage.getStore()
}
