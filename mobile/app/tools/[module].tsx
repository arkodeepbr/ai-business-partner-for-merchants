import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Card, Note, Screen } from '@/components/Screen';
import { api } from '@/services/api';
import { colors } from '@/theme/tokens';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Papa from 'papaparse';
import { z } from 'zod';
import { TransactionRow, type Transaction } from '../(tabs)/home';
import { useSampleWorkspace } from '@/hooks/useSampleWorkspace';

const modules: Record<string,{title:string,path:string;hint:string}> = {
 transactions:{title:'Transactions',path:'/transactions',hint:'Connected payment records'},
 imports:{title:'Import transactions',path:'/integrations/status',hint:'Import a merchant-authorized CSV. Imported data is labeled and deduplicated.'},
 'sales-insights':{title:'Sales insights',path:'/analytics/period-comparison?days=7',hint:'Period comparison from connected records'},
 settlements:{title:'Cash flow & settlements',path:'/cashflow/settlements',hint:'Settlement status from connected providers'},
 inventory:{title:'Inventory',path:'/inventory',hint:'Products and current stock'},
 suppliers:{title:'Suppliers & purchase orders',path:'/suppliers',hint:'Supplier records'},
 'purchase-orders':{title:'Purchase order drafts',path:'/purchase-orders',hint:'Every order requires review; sending is not configured'},
 customers:{title:'Customers & loyalty',path:'/customers',hint:'Customer records and recorded consent'},
 campaigns:{title:'Campaign drafts',path:'/campaigns',hint:'Drafts only; delivery is disabled'},
 credit:{title:'Credit offers',path:'/credit/offers',hint:'Only lender-originated offers are shown'},
 tax:{title:'GST & tax',path:`/tax/summary?period=${new Date().toISOString().slice(0,7)}`,hint:'Draft summaries are not statutory filings'},
 reports:{title:'Reports',path:'/reports',hint:'Export and filing providers are not configured'},
 staff:{title:'Staff',path:'/staff',hint:'Merchant staff directory'},
 stores:{title:'Stores',path:'/stores',hint:'Merchant locations'},
 approvals:{title:'Approvals',path:'/approvals',hint:'Review action proposals'},
 notifications:{title:'Notifications',path:'/notifications',hint:'In-app merchant notifications'}
};
function display(value: unknown): string {
 if(value===null||value===undefined)return '—';
 if(typeof value==='object') return Object.entries(value as Record<string,unknown>).map(([k,v])=>`${k.replaceAll('_',' ')}: ${display(v)}`).join('\n');
 return String(value);
}
export default function ModuleScreen(){
 const {module}=useLocalSearchParams<{module:string}>(); const config=modules[module]??modules.reports;
 const queryClient=useQueryClient(); const [name,setName]=useState(''); const [extra,setExtra]=useState(''); const [third,setThird]=useState(''); const [fourth,setFourth]=useState(''); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false);
 const query=useQuery({queryKey:['module',module],queryFn:()=>api<unknown>(config.path),enabled:module!=='imports'});
 const canCreate=['inventory','customers','suppliers','stores','staff','campaigns','purchase-orders'].includes(module);
 async function create(){setBusy(true);setMessage('');try{
  const path=module==='inventory'?'/inventory':`/${module}`;
  const body=module==='inventory'?{name,quantity:Number(extra)||0,reorder_level:0,unit:'unit'}:
   module==='customers'?{display_name:name}:
   module==='stores'?{name,code:extra}:
   module==='campaigns'?{name,message:extra}:
   module==='purchase-orders'?{supplier_id:name,lines:[{product_id:extra,quantity:Number(third),unit_cost:fourth}]}:
   module==='staff'?{display_name:name,role:extra||'staff'}:{name};
  const response=await api<{proposal_id?:string}>(path,{method:'POST',body:JSON.stringify(body)}); setName('');setExtra('');setThird('');setFourth('');setMessage(response.proposal_id?'Draft created with an approval proposal. Review it in Approvals.':'Saved.');await queryClient.invalidateQueries({queryKey:['module',module]});if(response.proposal_id)await queryClient.invalidateQueries({queryKey:['module','approvals']});
 }catch(e){setMessage(e instanceof Error?e.message:'Could not save this record.');}finally{setBusy(false)}}
 const rows=Array.isArray(query.data)?query.data:query.data?[query.data]:[];
 return <Screen title={config.title} subtitle={config.hint}>
  {module!=='imports'?(query.isLoading?<ActivityIndicator color={colors.blue}/>:query.isError?<Card title="Data unavailable"><Note>{query.error.message}</Note></Card>:rows.length===0?<Card title="No records"><Note>No records are available for this merchant yet. Connected providers may be required.</Note></Card>:module==='transactions'?rows.map((row,i)=><TransactionRow key={String((row as Record<string,unknown>).id??i)} transaction={row as Transaction}/>):rows.map((row,i)=><Card key={String((row as Record<string,unknown>).id??i)} title={String((row as Record<string,unknown>).name??(row as Record<string,unknown>).id??`Record ${i+1}`)}><Text style={{color:colors.ink,fontSize:13,lineHeight:20}}>{display(row)}</Text>{module==='customers'?<ConsentButton id={String((row as Record<string,unknown>).id)} onSaved={()=>queryClient.invalidateQueries({queryKey:['module',module]})}/>:null}{module==='approvals'?<ApprovalActions id={String((row as Record<string,unknown>).id)} status={String((row as Record<string,unknown>).status)} onSaved={()=>queryClient.invalidateQueries({queryKey:['module',module]})}/>:null}{module==='inventory'?<PrepareProposal kind="purchase_order" payload={{product_id:String((row as Record<string,unknown>).id),product_name:String((row as Record<string,unknown>).name),intent:'reorder review'}} label="Prepare reorder proposal"/>:null}{module==='credit'?<PrepareProposal kind="credit_application" payload={{offer_id:String((row as Record<string,unknown>).id)}} label="Prepare application proposal"/>:null}{module==='campaigns'?<CampaignApproval id={String((row as Record<string,unknown>).id)} onSaved={()=>queryClient.invalidateQueries({queryKey:['module',module]})}/>:null}</Card>)):null}
  {canCreate?<Card title={`Add ${config.title.replace(/s$/,'').toLowerCase()}`}><TextInput value={name} onChangeText={setName} placeholder={module==='customers'?'Customer display name':module==='purchase-orders'?'Supplier ID':'Name'} style={{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12,color:colors.ink}}/>
    {['inventory','stores','staff','campaigns','purchase-orders'].includes(module)?<TextInput value={extra} onChangeText={setExtra} placeholder={module==='inventory'?'Starting quantity':module==='stores'?'Store code':module==='campaigns'?'Draft message':module==='purchase-orders'?'Product ID':'Role'} keyboardType={module==='inventory'?'number-pad':'default'} multiline={module==='campaigns'} style={{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12,color:colors.ink}}/>:null}
    {module==='purchase-orders'?<><TextInput value={third} onChangeText={setThird} placeholder="Quantity" keyboardType="number-pad" style={{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12,color:colors.ink}}/><TextInput value={fourth} onChangeText={setFourth} placeholder="Unit cost (INR)" keyboardType="decimal-pad" style={{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12,color:colors.ink}}/></>:null}
    <Pressable disabled={busy||!name.trim()} onPress={create} style={{backgroundColor:colors.blue,padding:13,borderRadius:10,alignItems:'center'}}><Text style={{color:'white',fontWeight:'700'}}>{busy?'Saving…':'Save record'}</Text></Pressable>{message?<Note>{message}</Note>:null}</Card>:null}
  {module==='imports'?<ImportTransactions/>:null}
 </Screen>;
}
function ConsentButton({id,onSaved}:{id:string;onSaved:()=>void}){
 const [status,setStatus]=useState('');
 async function setConsent(consent:boolean){try{await api(`/customers/${id}/marketing-consent`,{method:'PATCH',body:JSON.stringify({consent})});setStatus(consent?'Marketing consent recorded.':'Marketing opt-out recorded.');onSaved();}catch(e){setStatus(e instanceof Error?e.message:'Could not update consent.');}}
 return <View style={{gap:8}}><Text style={{fontSize:12,color:colors.muted}}>Campaigns must respect each customer’s recorded consent.</Text><View style={{flexDirection:'row',gap:10}}><Pressable onPress={()=>setConsent(true)} style={{padding:8,backgroundColor:'#EEF4FF',borderRadius:8}}><Text style={{color:colors.blue}}>Record opt-in</Text></Pressable><Pressable onPress={()=>setConsent(false)} style={{padding:8,backgroundColor:'#FFF3F3',borderRadius:8}}><Text style={{color:colors.red}}>Opt out</Text></Pressable></View>{status?<Text style={{fontSize:12,color:colors.muted}}>{status}</Text>:null}</View>;
}
function ApprovalActions({id,status,onSaved}:{id:string;status:string;onSaved:()=>void}){
 const [result,setResult]=useState('');
 async function decide(decision:'approve'|'reject'){try{const data=await api<{message:string;status:string}>(`/approvals/${id}/decision?decision=${decision}`,{method:'POST'});setResult(`${data.status}: ${data.message}`);onSaved();}catch(e){setResult(e instanceof Error?e.message:'Could not record decision.');}}
 if(status!=='pending')return <Note>Proposal status: {status}. No external execution is performed.</Note>;
 return <View style={{gap:8}}><Text style={{color:colors.amber,fontSize:12}}>Review details above before approving. Approval records intent only.</Text><View style={{flexDirection:'row',gap:10}}><Pressable onPress={()=>decide('approve')} style={{padding:9,backgroundColor:'#E9F7F0',borderRadius:8}}><Text style={{color:colors.green}}>Approve</Text></Pressable><Pressable onPress={()=>decide('reject')} style={{padding:9,backgroundColor:'#FFF3F3',borderRadius:8}}><Text style={{color:colors.red}}>Reject</Text></Pressable></View>{result?<Note>{result}</Note>:null}</View>;
}
function PrepareProposal({kind,payload,label}:{kind:'purchase_order'|'credit_application';payload:Record<string,string>;label:string}){
 const [message,setMessage]=useState('');
 async function prepare(){try{const result=await api<{id:string}>('/approvals',{method:'POST',body:JSON.stringify({kind,payload})});setMessage(`Proposal ${result.id.slice(0,8)} created. Review it in Approvals.`);}catch(e){setMessage(e instanceof Error?e.message:'Could not create proposal.');}}
 return <View style={{gap:6}}><Pressable onPress={prepare} style={{padding:10,backgroundColor:'#EEF4FF',borderRadius:8,alignSelf:'flex-start'}}><Text style={{color:colors.blue,fontWeight:'600'}}>{label}</Text></Pressable>{message?<Note>{message}</Note>:null}</View>;
}
function CampaignApproval({id,onSaved}:{id:string;onSaved:()=>void}){
 const [message,setMessage]=useState('');
 async function prepare(){try{await api(`/campaigns/${id}/prepare-approval`,{method:'PATCH'});setMessage('Approval proposal created. Delivery remains disabled.');onSaved();}catch(e){setMessage(e instanceof Error?e.message:'Could not prepare approval.');}}
 return <View style={{gap:6}}><Pressable onPress={prepare} style={{padding:9,backgroundColor:'#EEF4FF',borderRadius:8,alignSelf:'flex-start'}}><Text style={{color:colors.blue}}>Request campaign approval</Text></Pressable>{message?<Note>{message}</Note>:null}</View>;
}

const csvRowSchema=z.object({
 external_id:z.string().trim().min(1).max(120),
 amount:z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
 status:z.enum(['succeeded','failed','refunded']),
 payment_method:z.string().max(32).optional(),
 occurred_at:z.string().datetime({offset:true}),
 sender_name:z.string().trim().max(180).optional(),
 sender_reference:z.string().trim().max(180).optional(),
 sender_contact:z.string().trim().max(180).optional(),
});
function ImportTransactions(){
 const sampleWorkspace=useSampleWorkspace();
 const [busy,setBusy]=useState(false);const [result,setResult]=useState('');
 async function selectAndImport(){setBusy(true);setResult('');try{
  const selection=await DocumentPicker.getDocumentAsync({type:['text/csv','text/comma-separated-values','application/vnd.ms-excel'],copyToCacheDirectory:true});
  if(selection.canceled){setBusy(false);return;}
  const file=selection.assets[0];if(file.size&&file.size>1_000_000)throw new Error('CSV must be no larger than 1 MB.');
  const csv=await FileSystem.readAsStringAsync(file.uri,{encoding:FileSystem.EncodingType.UTF8});
  const parsed=Papa.parse<Record<string,string>>(csv,{header:true,skipEmptyLines:'greedy',dynamicTyping:false});
  if(parsed.errors.length)throw new Error(`CSV parsing error: ${parsed.errors[0].message}`);
  if(parsed.data.length<1||parsed.data.length>500)throw new Error('Choose a CSV containing 1 to 500 rows.');
  const rows=parsed.data.map((row,index)=>{const check=csvRowSchema.safeParse(row);if(!check.success)throw new Error(`Row ${index+2} needs external_id, positive amount, valid status and timezone-aware occurred_at.`);return {...check.data,payment_method:check.data.payment_method||'unknown'};});
  const imported=await api<{accepted:number;duplicates_skipped:number;provider_connected:boolean}>('/integrations/import/transactions',{method:'POST',body:JSON.stringify({transactions:rows})});
  setResult(`Imported ${imported.accepted} row(s); skipped ${imported.duplicates_skipped} duplicate(s). Source: merchant import. No provider connection was created.`);
 }catch(e){setResult(e instanceof Error?e.message:'Could not import that file.');}finally{setBusy(false)}}
 return <Card title="Merchant-authorized transaction import">{sampleWorkspace
   ? <Note>CSV import requires an authenticated backend workspace. The offline presentation sample stays read-only and contains only fictional records.</Note>
   : <><Note>Use a CSV you obtained from an authorized merchant source. Required columns: external_id, amount, status, occurred_at. Optional sender columns: sender_name, sender_reference, sender_contact. Status must be succeeded, failed or refunded; timestamps must include a timezone. Imports are labeled separately from live provider feeds.</Note>
     <Pressable disabled={busy} onPress={selectAndImport} style={{backgroundColor:colors.blue,padding:13,borderRadius:10,alignItems:'center'}}><Text style={{color:'white',fontWeight:'700'}}>{busy?'Validating and importing…':'Choose CSV file'}</Text></Pressable>{result?<Note>{result}</Note>:null}</>}</Card>;
}
