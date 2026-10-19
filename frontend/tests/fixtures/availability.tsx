import React from 'react'
import {createRoot} from 'react-dom/client'
import {AssetDetailPage} from '../../src/pages/AssetDetailPage.tsx'
import {createMockService, DEMO_ACCOUNTS} from '../../src/services/mockService.ts'
const {service} = createMockService({now:()=>new Date('2026-10-19T06:00:00Z'),sleep:async()=>{}})
const user = await service.login(DEMO_ACCOUNTS.student)
const control = {hold:false,calls:0,queue:[] as {resolve:()=>void;fail:()=>void}[],render:(id:string)=>render(id)}
const wrapped = {...service,
  requestBooking:async(input:Parameters<typeof service.requestBooking>[0])=>{control.calls++;return service.requestBooking(input)},
  getAssetAvailability:async(id:string)=>{
    const snapshot = await service.getAssetAvailability(id)
    if (!control.hold) return snapshot
    return new Promise<typeof snapshot>(resolve=>control.queue.push({resolve:()=>resolve(snapshot),fail:()=>resolve({ok:false,error:{code:'SERVICE_UNAVAILABLE',message:'Refresh failed'}})}))
  }
}
const root = createRoot(document.getElementById('root')!)
function render(id:string){root.render(<AssetDetailPage assetId={id} service={wrapped} user={user.ok?user.data:null}/>)}
Object.assign(window,{control})
render('accessory-03')
