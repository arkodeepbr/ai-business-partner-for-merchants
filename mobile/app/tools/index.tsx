import { Link } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { Card, Note, Screen } from '@/components/Screen';
const tools=[['Transactions','transactions'],['Import transaction CSV','imports'],['Sales insights','sales-insights'],['Cash flow & settlements','settlements'],['Inventory','inventory'],['Suppliers','suppliers'],['Purchase order drafts','purchase-orders'],['Customers & loyalty','customers'],['Campaign drafts','campaigns'],['Credit offers','credit'],['GST & tax','tax'],['Reports','reports'],['Staff','staff'],['Stores','stores'],['Approvals','approvals'],['Notifications','notifications']];
export default function Tools(){return <Screen title="Business tools" subtitle="Available tools depend on your connected services">
 {tools.map(([item,key])=><Link key={key} href={{pathname:'/tools/[module]',params:{module:key}}} asChild><Pressable><Card title={item}><Text style={{color:'#1769E0',fontWeight:'600'}}>Open module →</Text></Card></Pressable></Link>)}
 <Card title="Data and action access"><Note>Features depend on permissions and connected sources. No external action is executed without a verified provider.</Note></Card>
 </Screen>}
