import { withTransaction } from '../db/pool.js'
import { promoteWaitlist } from '../waitlist/service.js'
export async function runWaitlistPromotion(){return withTransaction(promoteWaitlist)}
